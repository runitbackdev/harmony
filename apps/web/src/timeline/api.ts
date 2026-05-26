import { command, rpc, subscribe } from "@harmony/core";
import { applyListDiff } from "@harmony/core/protocol";
import { useListSubscription } from "@harmony/react";
import type {
  EditMessageInput,
  FocusOnEventInput,
  PaginateInput,
  RedactMessageInput,
  SendMessageInput,
  TimelineEventData,
  ToggleReactionInput,
} from "@harmony/core";

export const getRoomState = (roomId: string) => rpc("timeline.get_room_state", roomId);
export const sendMessage = (input: SendMessageInput) => rpc("timeline.send", input);
export const editMessage = (input: EditMessageInput) => rpc("timeline.edit", input);
export const redactMessage = (input: RedactMessageInput) => rpc("timeline.redact", input);
export const toggleReaction = (input: ToggleReactionInput) =>
  rpc("timeline.toggle_reaction", input);
export const paginateTimeline = (input: PaginateInput) => rpc("timeline.paginate", input);
export const focusOnEvent = (input: FocusOnEventInput) => rpc("timeline.focus_on_event", input);
export const returnToLive = (roomId: string) => rpc("timeline.return_to_live", roomId);

export const markRoomAsRead = (roomId: string) => command("timeline.mark_as_read", roomId);

export const subscribeTimeline = (
  roomId: string,
  onChunk: Parameters<typeof subscribe<"timeline.subscribe">>[2],
) => subscribe("timeline.subscribe", roomId, onChunk);

const EMPTY_EVENTS: TimelineEventData[] = [];

export function useTimeline(roomId: string) {
  const sub = useListSubscription("timeline.subscribe", roomId, (state, chunk) => {
    if (chunk.kind === "error") return;
    if (chunk.generation !== state.generation) return;
    const events = [...state.events];
    for (const diff of chunk.diffs) applyListDiff(events, diff);
    return { ...state, events };
  });
  return sub.value?.events ?? EMPTY_EVENTS;
}
