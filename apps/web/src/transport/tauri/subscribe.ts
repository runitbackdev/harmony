import { invoke } from "@tauri-apps/api/core";

import type { HarmonyError, RpcResult } from "@harmony/core/transport";

export type SubscriptionStarted<Init, Chunk> =
  | { ok: true; initial: Init; stream: ReadableStream<Chunk> }
  | { ok: false; error: HarmonyError };

/**
 * Chunks per `harmony_poll`. The Rust side awaits the first chunk then
 * drains whatever else is already ready up to this cap, so a burst costs
 * one IPC round trip instead of one per diff.
 */
const POLL_BATCH = 64;

/**
 * Adapt a Tauri subscription command into the `{ initial, stream }` shape
 * the rest of the app consumes (matches `SubscriptionFn` in
 * `maps.generated.ts`).
 *
 * Desktop subscriptions are consumer-driven. `invoke(cmd, ...)` registers
 * the stream in Rust and returns the initial value; nothing is produced
 * until `harmony_poll` asks. Backpressure is therefore structural rather
 * than a protocol — the same property the wasm binding gets for free, and
 * the reason there is no ack, no lag heuristic, and no unbounded IPC queue.
 *
 * `pull` is only re-entered once its promise settles, so polls are
 * single-flight without a guard of our own. An empty batch means the
 * subscription is over.
 */
export async function subscribeViaTauri<I, Init, C>(
  tauriCmd: string,
  input: I,
): Promise<SubscriptionStarted<Init, C>> {
  const subscriptionId = crypto.randomUUID();

  const result = (await invoke(tauriCmd, { input, subscriptionId })) as RpcResult<Init>;
  if (!result.ok) return { ok: false, error: result.error };

  let done = false;

  const release = async () => {
    if (done) return;
    done = true;
    try {
      await invoke("harmony_unsubscribe", { subscriptionId });
    } catch {
      // best-effort — the registration is dropped on the Rust side anyway
      // once the stream ends.
    }
  };

  const stream = new ReadableStream<C>({
    async pull(controller) {
      if (done) return;
      let batch: C[];
      try {
        batch = (await invoke("harmony_poll", { subscriptionId, max: POLL_BATCH })) as C[];
      } catch (error) {
        await release();
        throw error;
      }
      if (done) return;
      if (batch.length === 0) {
        done = true;
        controller.close();
        return;
      }
      for (const chunk of batch) controller.enqueue(chunk);
    },
    cancel: release,
  });

  return { ok: true, initial: result.value, stream };
}
