import { tauriCommands, tauriRpc, tauriSubscriptions } from "./dispatch.generated";
import type { HarmonyError, RpcResult, StreamHandle, Transport } from "@harmony/core/transport";

/**
 * Client-side Transport adapter for the Tauri host.
 *
 * Unlike {@link TransportSharedWorker}, there is no remote dispatcher: the
 * generated `tauri*` maps already bind each dotted logical name to its
 * underscore `#[tauri::command]` wrapper, so dispatch is a map lookup. The
 * only real work here is adapting the async `{ initial, stream }` that
 * `subscribeViaTauri` returns into the synchronous {@link StreamHandle} the
 * interface requires.
 */

// Transport keys are untyped strings; the generated maps are exactly keyed.
// Erase to a loose record (same seam as worker-dispatcher) to index by string.
type AnyRpc = (input: unknown) => Promise<RpcResult<unknown>>;
type AnyCommand = (input: unknown) => Promise<{ ok: true } | { ok: false; error: HarmonyError }>;
type SubscriptionStarted =
  | { ok: true; initial: unknown; stream: ReadableStream<unknown> }
  | { ok: false; error: HarmonyError };
type AnySubscription = (input: unknown) => Promise<SubscriptionStarted>;

const RPC = tauriRpc as unknown as Record<string, AnyRpc>;
const COMMANDS = tauriCommands as unknown as Record<string, AnyCommand>;
const SUBSCRIPTIONS = tauriSubscriptions as unknown as Record<string, { fn: AnySubscription }>;

export class TransportTauri implements Transport {
  private readonly readers = new Set<ReadableStreamDefaultReader<unknown>>();
  private disposed = false;

  request(name: string, input: unknown): Promise<RpcResult<unknown>> {
    if (this.disposed) {
      return Promise.resolve(errorResult("unknown", "transport disposed"));
    }
    return RPC[name](input);
  }

  command(name: string, input: unknown): void {
    if (this.disposed) return;
    void COMMANDS[name](input).catch(() => {});
  }

  subscribe(
    name: string,
    input: unknown,
    onChunk: (chunk: unknown) => void,
  ): StreamHandle<unknown> {
    if (this.disposed) {
      return {
        initial: Promise.resolve(errorResult("unknown", "transport disposed")),
        unsubscribe: () => {},
      };
    }

    let cancelled = false;
    let reader: ReadableStreamDefaultReader<unknown> | undefined;

    const initial = (async (): Promise<RpcResult<unknown>> => {
      const started = await SUBSCRIPTIONS[name].fn(input);
      if (!started.ok) return started;

      // Unsubscribed (or disposed) while the invoke was in flight: tear the
      // stream down and skip the pump, but still surface the value the invoke
      // already produced so `initial` never dangles.
      if (cancelled || this.disposed) {
        void started.stream.cancel();
        return { ok: true, value: started.initial };
      }

      reader = started.stream.getReader();
      this.readers.add(reader);
      void this.pump(reader, onChunk);
      return { ok: true, value: started.initial };
    })();

    return {
      initial,
      unsubscribe: () => {
        cancelled = true;
        if (reader) {
          void reader.cancel();
          this.readers.delete(reader);
        }
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const reader of this.readers) void reader.cancel();
    this.readers.clear();
  }

  // Drains a subscription's stream into onChunk. Stream-level errors (the
  // reserved `error` StreamEvent) reject `read()` — swallowed, since the Rust
  // ABI never emits them yet.
  private async pump(
    reader: ReadableStreamDefaultReader<unknown>,
    onChunk: (chunk: unknown) => void,
  ): Promise<void> {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(value);
      }
    } catch {
      // best-effort; stream errored or was cancelled
    } finally {
      this.readers.delete(reader);
    }
  }
}

function errorResult(code: string, message?: string): RpcResult<never> {
  const error: HarmonyError = { code };
  if (message !== undefined) error.message = message;
  return { ok: false, error };
}
