import { Eye, Link, LogOut } from "lucide-react";
import { getRoomIdsInSpace, markAsRead } from "@harmony/react";
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
  try {
    const roomIds = await getRoomIdsInSpace(spaceId);
    if (roomIds.length === 0) {
      toast.info("No rooms to mark as read");
      return;
    }
    const results = await Promise.allSettled(roomIds.map((id) => markAsRead(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = roomIds.length - failed;
    const noun = succeeded === 1 ? "room" : "rooms";
    if (failed === 0) {
      toast.success(`Marked ${succeeded} ${noun} as read`);
    } else {
      toast.error(`Marked ${succeeded} of ${roomIds.length} rooms as read`);
    }
  } catch {
    toast.error("Couldn't mark rooms as read");
  }
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
