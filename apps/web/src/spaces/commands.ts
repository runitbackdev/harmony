import { Eye, Link, LogOut } from "lucide-react";
import { getDescendants } from "@/spaces/api";
import { markRoomAsRead } from "@/timeline/api";
import { notImplemented, toast } from "@/lib/toast";
import { useOmnibarCommands, type Command } from "@/omnibar";

async function copySpaceLink(spaceId: string) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/${spaceId}`);
    toast.success("Link copied");
  } catch {
    toast.error("Couldn't copy link");
  }
}

async function markSpaceAsRead(spaceId: string) {
  const result = await getDescendants(spaceId);
  if (!result.ok) {
    toast.error("Couldn't load rooms");
    return;
  }
  const roomIds = result.value;
  if (roomIds.length === 0) {
    toast.info("No rooms to mark as read");
    return;
  }
  for (const id of roomIds) markRoomAsRead(id);
  const noun = roomIds.length === 1 ? "room" : "rooms";
  toast.success(`Marked ${roomIds.length} ${noun} as read`);
}

function buildSpaceCommands(spaceId: string): Command[] {
  return [
    {
      id: "space.mark-as-read",
      label: "Mark all rooms in this space as read",
      icon: Eye,
      keywords: ["unread", "clear"],
      perform: () => void markSpaceAsRead(spaceId),
    },
    {
      id: "space.copy-link",
      label: "Copy link to this space",
      icon: Link,
      keywords: ["share", "url"],
      perform: () => void copySpaceLink(spaceId),
    },
    {
      id: "space.leave",
      label: "Leave space",
      icon: LogOut,
      keywords: ["exit"],
      perform: notImplemented,
    },
  ];
}

/** Registers omnibar commands scoped to the currently open space. */
export function useSpaceCommands(spaceId: string): void {
  useOmnibarCommands(buildSpaceCommands(spaceId), [spaceId]);
}
