import {
  commands as commandsMap,
  rpc as rpcMap,
  subscriptions as subscriptionsMap,
} from "../protocol/maps.generated";
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
  reader: ReadableStreamDefaultReader<unknown>;
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
    state.reader.cancel().catch(() => {});
  }

  function pump(key: string) {
    const state = active.get(key);
    if (!state) return;
    const { reader } = state;
    const loop = async () => {
      while (true) {
        let result: ReadableStreamReadResult<unknown>;
        try {
          result = await reader.read();
        } catch (error) {
          console.error(`[bridge] subscription ${key} read error:`, error);
          endSubscription(key);
          return;
        }
        if (result.done) {
          active.delete(key);
          return;
        }
        const current = active.get(key);
        if (!current) return;
        for (const [subId, subPort] of current.subscribers) {
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
      respond(port, msg.id, errorResult("unknown_rpc", msg.name));
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
      respond(port, msg.id, errorResult("unknown_subscription", msg.name));
      return;
    }
    const key = `${msg.name}::${stableStringify(msg.input)}`;
    const existing = active.get(key);
    if (existing) {
      existing.subscribers.set(msg.id, port);
      registerSubscriber(port, key, msg.id);
      const snapshot = await fetchSnapshot(entry);
      respond(port, msg.id, snapshot);
      return;
    }
    let started: SubscriptionStarted;
    try {
      started = await entry.fn(msg.input);
    } catch (error) {
      respond(port, msg.id, errorResult("unknown", errorMessage(error)));
      return;
    }
    if (!started.ok) {
      respond(port, msg.id, { ok: false, error: started.error });
      return;
    }
    const state: SharedSubscription = {
      reader: started.stream.getReader(),
      subscribers: new Map([[msg.id, port]]),
    };
    active.set(key, state);
    registerSubscriber(port, key, msg.id);
    respond(port, msg.id, { ok: true, value: started.initial });
    pump(key);
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

  async function fetchSnapshot(entry: SubscriptionEntry): Promise<RpcResult<unknown>> {
    if (!entry.snapshot) return { ok: true, value: undefined };
    const fn = RPC[entry.snapshot];
    if (!fn) return errorResult("missing_snapshot_fn", entry.snapshot);
    try {
      return normalizeResult((await fn(undefined)) as RpcResult<unknown> | undefined);
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
