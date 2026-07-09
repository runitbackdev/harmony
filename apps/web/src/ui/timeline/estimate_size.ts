import type { TimelineEventData as TimelineEvent } from "@harmony/harmony-bindings-web";
import { mediaDisplaySize } from "../utils";

const MESSAGE_BASE = 44;
const MESSAGE_GROUPED = 24;
const SYSTEM = 32;
const DIVIDER = 40;
const REACTIONS = 28;
const REPLY = 24;
const MEDIA_GAP = 4;

function reservedMediaHeight(event: TimelineEvent) {
  if (event.content.type !== "message") return 0;
  const attachments = event.content.attachments;
  if (!attachments) return 0;

  let reservedHeight = 0;
  for (const attachment of attachments) {
    const width = attachment.info?.width;
    const height = attachment.info?.height;
    if (width && height) reservedHeight += mediaDisplaySize(width, height).height + MEDIA_GAP;
  }
  return reservedHeight;
}

export function estimateEventSize(event: TimelineEvent, grouped: boolean) {
  const { content } = event;

  if (content.type === "virtual") return DIVIDER;
  if (
    content.type === "membershipChange" ||
    content.type === "profileChange" ||
    content.type === "state"
  )
    return SYSTEM;

  let estimatedSize = grouped ? MESSAGE_GROUPED : MESSAGE_BASE;
  estimatedSize += reservedMediaHeight(event);
  if (event.replyTo) estimatedSize += REPLY;
  if (event.reactions && event.reactions.length > 0) estimatedSize += REACTIONS;
  return estimatedSize;
}
