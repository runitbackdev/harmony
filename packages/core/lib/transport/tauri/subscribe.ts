import { Channel, invoke } from "@tauri-apps/api/core";

import type { HarmonyError, RpcResult } from "../index";

/**
 * Wire envelope for chunks flowing over the Tauri Channel. Mirrors
 * `harmony_protocol::desktop::StreamEvent<C>` (externally-tagged enum,
 * `tag = "kind"`, `content = "data"`, camelCase variants).
 *
 * `Error` is reserved for future mid-stream failures — the current Rust
 * `Subscription` ABI doesn't surface stream-level errors but the variant
 * is defined now so adding it later isn't a wire break.
 */
type StreamEvent<C> =
  | { kind: "chunk"; data: C }
  | { kind: "end" }
  | { kind: "error"; data: HarmonyError };

export type SubscriptionStarted<Init, Chunk> =
  | { ok: true; initial: Init; stream: ReadableStream<Chunk> }
  | { ok: false; error: HarmonyError };

/**
 * Adapt a Tauri subscription command into the `{ initial, stream }` shape
 * the rest of the app already consumes (matches `SubscriptionFn` in
 * `maps.generated.ts`).
 *
 * Flow:
 * 1. Generate a `subscriptionId` (uuid) — passed to both the subscribe
 *    invoke and the eventual `harmony_unsubscribe` cancel call.
 * 2. Construct a `Channel<StreamEvent<C>>` and wire its `onmessage` to
 *    a small buffer-or-forward dispatch.
 * 3. `invoke(cmd, { input, subscriptionId, channel })` returns the
 *    initial value (or a startup error) via `Rpc<Init>`.
 * 4. Construct a `ReadableStream<C>` whose `start` drains buffered events
 *    into its controller and switches future events to direct forward;
 *    whose `cancel` invokes `harmony_unsubscribe`.
 *
 * The buffer exists because chunks can arrive between steps 2 and 4 — the
 * Channel is hot from the moment Rust spawns the pump, but the
 * ReadableStream controller doesn't exist until after `await invoke`.
 */
export async function subscribeViaTauri<I, Init, C>(
  tauriCmd: string,
  input: I,
): Promise<SubscriptionStarted<Init, C>> {
  const subscriptionId = crypto.randomUUID();
  const channel = new Channel<StreamEvent<C>>();

  const buffer: StreamEvent<C>[] = [];
  let controller: ReadableStreamDefaultController<C> | undefined;
  let ended = false;

  const apply = (event: StreamEvent<C>) => {
    if (ended || !controller) return;
    switch (event.kind) {
      case "chunk":
        controller.enqueue(event.data);
        return;
      case "end":
        ended = true;
        controller.close();
        return;
      case "error":
        ended = true;
        controller.error(event.data);
        return;
    }
  };

  channel.onmessage = (event) => {
    if (controller) apply(event);
    else buffer.push(event);
  };

  const result = (await invoke(tauriCmd, {
    input,
    subscriptionId,
    channel,
  })) as RpcResult<Init>;

  if (!result.ok) return { ok: false, error: result.error };

  const stream = new ReadableStream<C>({
    start(c) {
      controller = c;
      for (const event of buffer) apply(event);
      buffer.length = 0;
    },
    async cancel() {
      if (ended) return;
      ended = true;
      try {
        await invoke("harmony_unsubscribe", { subscriptionId });
      } catch {
        // best-effort cancel — pump will end on next channel send anyway
      }
    },
  });

  return { ok: true, initial: result.value, stream };
}
