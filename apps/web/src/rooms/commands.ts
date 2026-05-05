import { BellOff, Eye, Link, LogOut } from "lucide-react";
import { markAsRead } from "@harmony/react";
import { notImplemented, toast } from "@/lib/toast";
import { useOmnibarCommands, type Command } from "@/omnibar";

async function copyRoomLink(spaceId: string, roomId: string) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/${spaceId}/${roomId}`);
    toast.success("Link copied");
  } catch {
    toast.error("Couldn't copy link");
  }
}

function buildRoomCommands(spaceId: string, roomId: string): Command[] {
  return [
    {
      id: "room.mark-as-read",
      label: "Mark this room as read",
      icon: Eye,
      keywords: ["unread", "clear"],
      perform: () => {
        markAsRead(roomId).catch(() => {
          toast.error("Couldn't mark room as read");
        });
      },
    },
    {
      id: "room.copy-link",
      label: "Copy link to this room",
      icon: Link,
      keywords: ["share", "url"],
      perform: () => void copyRoomLink(spaceId, roomId),
    },
    {
      id: "room.mute",
      label: "Mute this room",
      icon: BellOff,
      keywords: ["notifications", "silence"],
      perform: notImplemented,
    },
    {
      id: "room.leave",
      label: "Leave room",
      icon: LogOut,
      keywords: ["exit"],
      perform: notImplemented,
    },
  ];
}

/** Registers omnibar commands scoped to the currently open room. */
export function useRoomCommands(spaceId: string, roomId: string): void {
  useOmnibarCommands(buildRoomCommands(spaceId, roomId), [spaceId, roomId]);
}
