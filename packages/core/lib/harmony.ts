import HarmonyWorker from "./worker?sharedworker";
import type {
  CommandInput,
  CommandName,
  RpcInput,
  RpcName,
  RpcOutput,
  SubscriptionChunk,
  SubscriptionInitial,
  SubscriptionInput,
  SubscriptionName,
} from "./protocol/types";
import type { RpcResult, StreamHandle, Transport } from "./transport";
import { TransportSharedWorker } from "./transport/shared-worker";
import { TransportTauri } from "./transport/tauri";
import { isNative } from "./platform";

/**
 * Typed client over a {@link Transport}. The three methods cover every
 * bridge call shape; types flow from the generated maps so each call site
 * gets the right input/output without per-feature boilerplate.
 *
 * Apps don't construct or reach for this directly — use the `call`,
 * `command`, and `subscribe` free functions exported alongside it.
 */
export class HarmonyClient {
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  rpc<K extends RpcName>(name: K, input: RpcInput<K>): Promise<RpcResult<RpcOutput<K>>> {
    return this.transport.request(name, input) as Promise<RpcResult<RpcOutput<K>>>;
  }

  command<K extends CommandName>(name: K, input: CommandInput<K>): void {
    this.transport.command(name, input);
  }

  subscribe<K extends SubscriptionName>(
    name: K,
    input: SubscriptionInput<K>,
    onChunk: (chunk: SubscriptionChunk<K>) => void,
  ): {
    initial: Promise<RpcResult<SubscriptionInitial<K>>>;
    unsubscribe: () => void;
  } {
    const handle = this.transport.subscribe(
      name,
      input,
      onChunk as (chunk: unknown) => void,
    ) satisfies StreamHandle<unknown>;
    return {
      initial: handle.initial as Promise<RpcResult<SubscriptionInitial<K>>>,
      unsubscribe: handle.unsubscribe,
    };
  }

  dispose(): void {
    this.transport.dispose();
  }
}

function createDefaultClient(): HarmonyClient {
  if (isNative()) return new HarmonyClient(new TransportTauri());
  const worker = new HarmonyWorker({ name: "harmony-sync" });
  return new HarmonyClient(new TransportSharedWorker(worker.port));
}

// Module-private singleton; not exported. Apps call through the free
// functions below so they never see (or depend on) the global handle.
const client: HarmonyClient = createDefaultClient();

/** Issue a typed request/response call. */
export function rpc<K extends RpcName>(
  name: K,
  input: RpcInput<K>,
): Promise<RpcResult<RpcOutput<K>>> {
  return client.rpc(name, input);
}

/** Issue a fire-and-forget command. Errors are logged in the worker
 *  and dropped; use {@link call} with an `Rpc<()>` return type if you
 *  need acknowledgement. */
export function command<K extends CommandName>(name: K, input: CommandInput<K>): void {
  client.command(name, input);
}

/** Subscribe to a streaming export. Returns `{ initial, unsubscribe }`
 *  where `initial` resolves once the worker has the snapshot ready and
 *  `unsubscribe` tears down the subscription. */
export function subscribe<K extends SubscriptionName>(
  name: K,
  input: SubscriptionInput<K>,
  onChunk: (chunk: SubscriptionChunk<K>) => void,
): {
  initial: Promise<RpcResult<SubscriptionInitial<K>>>;
  unsubscribe: () => void;
} {
  return client.subscribe(name, input, onChunk);
}
