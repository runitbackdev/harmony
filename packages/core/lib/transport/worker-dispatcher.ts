import {
  webCommands as commandsMap,
  webRpc as rpcMap,
  webSubscriptions as subscriptionsMap,
} from "./web/dispatch.generated";
import type {
  BridgeCommand,
  BridgeRequest,
  BridgeSubscribe,
  BridgeUnsubscribe,
  HarmonyError,
  RpcResult,
} from "./index";
import { isBridgeInbound } from "./index";

type AnyFn = (input: unknown) => Promise<unknown>;

type SubscriptionStarted =
  | { ok: true; initial: unknown; stream: ReadableStream<unknown> }
  | { ok: false; error: HarmonyError };

type SubscriptionEntry = {
  fn: (input: unknown) => Promise<SubscriptionStarted>;
  snapshot?: string;
};

type RpcMap = Record<string, AnyFn>;
type CommandMap = Record<string, AnyFn>;
type SubscriptionMap = Record<string, SubscriptionEntry>;

const RPC = rpcMap as unknown as RpcMap;
const COMMANDS = commandsMap as unknown as CommandMap;
const SUBSCRIPTIONS = subscriptionsMap as unknown as SubscriptionMap;

/**
 * Per-`(name, input)` subscription state held in the worker. Multiple
 * client subscribers share the same upstream stream; chunks fan out to
 * each subscriber's MessagePort tagged with their per-client `id`.
 */
type SharedSubscription = {
  // Resolves when the upstream `entry.fn` settles. Joiners await it before
  // snapshotting so the room state their snapshot reads has been created.
  started: Promise<SubscriptionStarted>;
  // The creator sets this once the upstream is ready and starts the pump;
  // null while the upstream is still starting.
  reader: ReadableStreamDefaultReader<unknown> | null;
  subscribers: Map<string, MessagePort>;
};

export type WorkerDispatcher = {
  onMessage: (port: MessagePort, data: unknown) => Promise<void>;
  onPortClose: (port: MessagePort) => void;
  size: () => number;
};

/**
 * Build a generic worker-side dispatcher over the codegen'd maps.
 * Coexists with the legacy handler dispatcher; the worker entry routes
 * based on the message shape.
 */
export function createWorkerDispatcher(): WorkerDispatcher {
  const active = new Map<string, SharedSubscription>();
  // Reverse lookup so unsubscribe-by-id is O(1) without scanning every key.
  const ownerByPort = new WeakMap<MessagePort, Set<string>>();

  function registerSubscriber(port: MessagePort, key: string, subId: string) {
    let owned = ownerByPort.get(port);
    if (!owned) {
      owned = new Set();
      ownerByPort.set(port, owned);
    }
    owned.add(`${key}::${subId}`);
  }

  function unregisterSubscriber(port: MessagePort, key: string, subId: string) {
    ownerByPort.get(port)?.delete(`${key}::${subId}`);
  }

  function endSubscription(key: string) {
    const state = active.get(key);
    if (!state) return;
    active.delete(key);
    // `reader` is null if the upstream is still starting; the creator's
    // post-await path sees the entry was removed and cancels the stream then.
    state.reader?.cancel().catch(() => {});
  }

  function pump(key: string, state: SharedSubscription) {
    const { reader } = state;
    if (!reader) return;
    const loop = async () => {
      while (true) {
        let result: ReadableStreamReadResult<unknown>;
        try {
          result = await reader.read();
        } catch (error) {
          console.error(`[bridge] subscription ${key} read error:`, error);
          // Only tear down if this entry is still ours. The dedup check in
          // `handleSubscribe` races with the async upstream start (a subscribe
          // arriving before a prior one reaches `active.set` — e.g. StrictMode's
          // remount), so a stale upstream can outlive its slot. Clobbering by
          // key would kill the live subscription that replaced us.
          if (active.get(key) === state) endSubscription(key);
          return;
        }
        if (result.done) {
          if (active.get(key) === state) active.delete(key);
          return;
        }
        // A newer upstream replaced us: stop quietly rather than fan our now
        // stale chunks out to the live subscription's subscribers.
        if (active.get(key) !== state) return;
        for (const [subId, subPort] of state.subscribers) {
          try {
            subPort.postMessage({ kind: "chunk", id: subId, chunk: result.value });
          } catch (error) {
            console.warn(`[bridge] chunk delivery failed for ${subId}:`, error);
          }
        }
      }
    };
    void loop();
  }

  async function handleRequest(port: MessagePort, msg: BridgeRequest) {
    const fn = RPC[msg.name];
    if (!fn) {
      respond(port, msg.id, errorResult("unknown", `unknown rpc: ${msg.name}`));
      return;
    }
    try {
      const result = (await fn(msg.input)) as RpcResult<unknown> | undefined;
      // Macro-emitted wrappers always return a JS object shaped like
      // RpcResult; defensively normalize.
      respond(port, msg.id, normalizeResult(result));
    } catch (error) {
      respond(port, msg.id, errorResult("unknown", errorMessage(error)));
    }
  }

  function handleCommand(msg: BridgeCommand) {
    const fn = COMMANDS[msg.name];
    if (!fn) {
      console.warn(`[bridge] unknown command: ${msg.name}`);
      return;
    }
    try {
      void Promise.resolve(fn(msg.input)).catch((error: unknown) => {
        console.error(`[bridge] command ${msg.name} failed:`, error);
      });
    } catch (error) {
      console.error(`[bridge] command ${msg.name} threw:`, error);
    }
  }

  async function handleSubscribe(port: MessagePort, msg: BridgeSubscribe) {
    const entry = SUBSCRIPTIONS[msg.name];
    if (!entry) {
      respond(port, msg.id, errorResult("unknown", `unknown subscription: ${msg.name}`));
      return;
    }
    const key = `${msg.name}::${stableStringify(msg.input)}`;

    // Register synchronously, before awaiting the async upstream start. The
    // dedup check (`active.get(key)`) would otherwise race the start: a second
    // subscribe arriving before the first reaches `active.set` spins up a
    // duplicate upstream. Inserting the shared entry up front makes concurrent
    // subscribers join one upstream + one pump, and lets a paired
    // unsubscribe find the subscriber instead of dropping it.
    let shared = active.get(key);
    const isCreator = shared === undefined;
    if (shared === undefined) {
      shared = { started: startUpstream(entry, msg.input), reader: null, subscribers: new Map() };
      active.set(key, shared);
    }
    shared.subscribers.set(msg.id, port);
    registerSubscriber(port, key, msg.id);

    const started = await shared.started;

    if (isCreator) {
      const live = active.get(key) === shared;
      if (!started.ok) {
        if (live) active.delete(key);
        respond(port, msg.id, { ok: false, error: started.error });
        return;
      }
      if (!live) {
        // Every subscriber unsubscribed while the upstream was starting
        // (StrictMode mount/unmount, quick navigate-away). Discard the
        // now-orphaned stream rather than leaking it.
        started.stream.cancel().catch(() => {});
        respond(port, msg.id, errorResult("unknown", "subscription closed"));
        return;
      }
      shared.reader = started.stream.getReader();
      respond(port, msg.id, { ok: true, value: started.initial });
      pump(key, shared);
      return;
    }

    // Joiner: the creator's upstream is already live, so seed from a fresh
    // snapshot of the current state (diffs since the upstream started are
    // already folded in). Future diffs arrive via the shared pump.
    if (!started.ok) {
      respond(port, msg.id, { ok: false, error: started.error });
      return;
    }
    if (active.get(key) !== shared) {
      respond(port, msg.id, errorResult("unknown", "subscription closed"));
      return;
    }
    const snapshot = await fetchSnapshot(entry, msg.input);
    respond(port, msg.id, snapshot);
  }

  function handleUnsubscribe(port: MessagePort, msg: BridgeUnsubscribe) {
    for (const [key, state] of active) {
      if (state.subscribers.delete(msg.id)) {
        unregisterSubscriber(port, key, msg.id);
        if (state.subscribers.size === 0) endSubscription(key);
        return;
      }
    }
  }

  async function fetchSnapshot(
    entry: SubscriptionEntry,
    input: unknown,
  ): Promise<RpcResult<unknown>> {
    if (!entry.snapshot) return { ok: true, value: undefined };
    const fn = RPC[entry.snapshot];
    if (!fn) return errorResult("unknown", `missing snapshot fn: ${entry.snapshot}`);
    try {
      // The snapshot RPC shares the subscription's input (e.g. the room id),
      // so a late joiner snapshots the same scope it's subscribing to.
      return normalizeResult((await fn(input)) as RpcResult<unknown> | undefined);
    } catch (error) {
      return errorResult("unknown", errorMessage(error));
    }
  }

  return {
    async onMessage(port: MessagePort, data: unknown) {
      if (!isBridgeInbound(data)) return;
      switch (data.kind) {
        case "request":
          await handleRequest(port, data);
          return;
        case "command":
          handleCommand(data);
          return;
        case "subscribe":
          await handleSubscribe(port, data);
          return;
        case "unsubscribe":
          handleUnsubscribe(port, data);
          return;
        case "connection.close":
          // Port lifecycle is owned by the worker entry; nothing for the
          // bridge dispatcher to do here. Subscriptions get torn down via
          // onPortClose.
          return;
        default: {
          const _exhaustive: never = data;
          return _exhaustive;
        }
      }
    },
    onPortClose(port: MessagePort) {
      const owned = ownerByPort.get(port);
      if (!owned) return;
      for (const ref of owned) {
        const sep = ref.lastIndexOf("::");
        const key = ref.slice(0, sep);
        const subId = ref.slice(sep + 2);
        const state = active.get(key);
        if (!state) continue;
        if (state.subscribers.delete(subId) && state.subscribers.size === 0) {
          endSubscription(key);
        }
      }
      ownerByPort.delete(port);
    },
    size: () => active.size,
  };
}

function respond(port: MessagePort, id: string, result: RpcResult<unknown>) {
  try {
    port.postMessage({ kind: "response", id, result });
  } catch (error) {
    console.warn(`[bridge] response delivery failed for ${id}:`, error);
  }
}

function errorResult(code: string, message?: string): RpcResult<never> {
  const error: HarmonyError = { code };
  if (message !== undefined) error.message = message;
  return { ok: false, error };
}

function normalizeResult(value: RpcResult<unknown> | undefined): RpcResult<unknown> {
  if (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof (value as { ok: unknown }).ok === "boolean"
  ) {
    return value;
  }
  // Defensive: shouldn't happen — every Rust-side handler returns a real
  // RpcResult via the macro wrappers.
  return { ok: true, value };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

/**
 * Kick off a subscription's upstream, normalizing a thrown startup error into
 * the `SubscriptionStarted` error shape so callers can `await` it without a
 * try/catch and store the promise in the shared entry.
 */
function startUpstream(entry: SubscriptionEntry, input: unknown): Promise<SubscriptionStarted> {
  return entry.fn(input).catch(
    (error: unknown): SubscriptionStarted => ({
      ok: false,
      error: { code: "unknown", message: errorMessage(error) },
    }),
  );
}

/**
 * Stable JSON stringify keyed on object property order so subscription
 * keys match regardless of caller serialization order.
 */
function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value, (_, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[key] = (v as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return v;
  });
}
