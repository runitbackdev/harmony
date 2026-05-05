import { getAllRooms, markAsRead } from "@harmony/react";
import { notImplemented, toast } from "@/lib/toast";
import {
  Accessibility,
  Bell,
  BellOff,
  BookOpen,
  Bug,
  CircleSlash,
  Clock,
  Eraser,
  Eye,
  EyeOff,
  Heart,
  Keyboard,
  LayoutPanelTop,
  Mail,
  Maximize2,
  MessageCircle,
  MessageSquare,
  Minus,
  Palette,
  RotateCcw,
  Send,
  Settings,
  Shield,
  Smile,
  Sparkles,
  Trash2,
  Type,
  User,
  UserX,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { clearFrequencies, clearQueryLearning, clearRecents } from "./store";
import type { Command } from "./types";

async function markAllAsRead() {
  try {
    const rooms = await getAllRooms();
    if (rooms.length === 0) {
      toast.info("No rooms to mark as read");
      return;
    }
    const results = await Promise.allSettled(rooms.map((r) => markAsRead(r.roomId)));
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = rooms.length - failed;
    const noun = succeeded === 1 ? "room" : "rooms";
    if (failed === 0) {
      toast.success(`Marked ${succeeded} ${noun} as read`);
    } else {
      toast.error(`Marked ${succeeded} of ${rooms.length} rooms as read`);
    }
  } catch {
    toast.error("Couldn't mark rooms as read");
  }
}

// Navigation
const navigation: Command[] = [
  {
    id: "nav.settings",
    label: "Go to settings",
    icon: Settings,
    keywords: ["preferences"],
    defaultScore: 1.0,
    perform: notImplemented,
  },
  { id: "nav.profile", label: "Go to my profile", icon: User, perform: notImplemented },
  {
    id: "nav.notifications",
    label: "Go to notification preferences",
    icon: Bell,
    perform: notImplemented,
  },
  { id: "nav.privacy", label: "Go to privacy settings", icon: Shield, perform: notImplemented },
  {
    id: "nav.appearance",
    label: "Go to appearance settings",
    icon: Palette,
    perform: notImplemented,
  },
  {
    id: "nav.shortcuts",
    label: "Go to keyboard shortcuts",
    icon: Keyboard,
    perform: notImplemented,
  },
  {
    id: "nav.invites",
    label: "Go to invites",
    icon: Mail,
    keywords: ["pending", "requests"],
    perform: notImplemented,
  },
];

// Communication & creation
const communication: Command[] = [
  {
    id: "comm.dm",
    label: "Start new direct message…",
    icon: MessageCircle,
    keywords: ["dm", "message"],
    perform: notImplemented,
  },
  { id: "comm.group-dm", label: "Start new group DM…", icon: Users, perform: notImplemented },
  {
    id: "comm.quick-send",
    label: "Quick send to room…",
    icon: Send,
    keywords: ["post"],
    perform: notImplemented,
  },
];

// Theme & appearance — per-theme switchers and the cycle command live in the
// themes feature module since they need React state. Other appearance toggles
// stay here as stubs until they have implementations.
const appearance: Command[] = [
  {
    id: "theme.density",
    label: "Toggle compact density",
    icon: LayoutPanelTop,
    perform: notImplemented,
  },
  { id: "theme.font-up", label: "Increase font size", icon: ZoomIn, perform: notImplemented },
  { id: "theme.font-down", label: "Decrease font size", icon: ZoomOut, perform: notImplemented },
  { id: "theme.font-reset", label: "Reset font size", icon: Type, perform: notImplemented },
  {
    id: "theme.reduced-motion",
    label: "Toggle reduced motion",
    icon: Accessibility,
    perform: notImplemented,
  },
  {
    id: "theme.reset",
    label: "Reset appearance to defaults",
    icon: RotateCcw,
    perform: notImplemented,
  },
];

// Presence & status
const presence: Command[] = [
  { id: "presence.online", label: "Set status: Online", icon: Smile, perform: notImplemented },
  { id: "presence.away", label: "Set status: Away", icon: Clock, perform: notImplemented },
  {
    id: "presence.dnd",
    label: "Set status: Do not disturb",
    icon: Minus,
    keywords: ["busy"],
    perform: notImplemented,
  },
  {
    id: "presence.invisible",
    label: "Set status: Invisible",
    icon: EyeOff,
    keywords: ["offline"],
    perform: notImplemented,
  },
  { id: "presence.custom", label: "Set custom status…", icon: Heart, perform: notImplemented },
  { id: "presence.clear", label: "Clear status", icon: X, perform: notImplemented },
];

// Read state
const readState: Command[] = [
  {
    id: "read.mark-all",
    label: "Mark all rooms as read",
    icon: Eye,
    keywords: ["unread", "clear"],
    defaultScore: 0.5,
    perform: () => void markAllAsRead(),
  },
];

// Notifications
const notifications: Command[] = [
  {
    id: "notif.pause",
    label: "Pause all notifications…",
    icon: BellOff,
    keywords: ["mute", "snooze"],
    perform: notImplemented,
  },
  { id: "notif.resume", label: "Resume notifications", icon: Bell, perform: notImplemented },
];

// View & UI toggles. view.toggle-members lives in the room route since the
// panel state is per-room.
const view: Command[] = [
  {
    id: "view.focus-mode",
    label: "Focus mode",
    icon: Maximize2,
    keywords: ["zen", "hide"],
    perform: notImplemented,
  },
];

// Help & meta
const help: Command[] = [
  {
    id: "help.shortcuts",
    label: "Show keyboard shortcuts",
    icon: Keyboard,
    perform: notImplemented,
  },
  {
    id: "help.docs",
    label: "Open documentation",
    icon: BookOpen,
    keywords: ["help"],
    perform: notImplemented,
  },
  {
    id: "help.feedback",
    label: "Send feedback",
    icon: MessageSquare,
    perform: notImplemented,
  },
  {
    id: "help.bug",
    label: "Report a bug",
    icon: Bug,
    keywords: ["issue"],
    perform: notImplemented,
  },
  {
    id: "help.changelog",
    label: "What's new",
    icon: Sparkles,
    keywords: ["changelog", "updates"],
    perform: notImplemented,
  },
  { id: "help.community", label: "Join Harmony community", icon: Users, perform: notImplemented },
];

// Privacy & data
const privacy: Command[] = [
  {
    id: "privacy.reset-omnibar",
    label: "Reset omnibar memory",
    icon: RotateCcw,
    keywords: ["clear", "forget", "wipe", "history"],
    perform: () => {
      clearRecents();
      clearFrequencies();
      clearQueryLearning();
      toast.success("Omnibar memory cleared");
    },
  },
  {
    id: "privacy.clear-history",
    label: "Clear omnibar query history",
    icon: Eraser,
    perform: notImplemented,
  },
  {
    id: "privacy.disable-learning",
    label: "Disable omnibar learning",
    icon: CircleSlash,
    perform: notImplemented,
  },
  { id: "privacy.clear-cache", label: "Clear local cache", icon: Trash2, perform: notImplemented },
  {
    id: "privacy.blocked",
    label: "Manage blocked users",
    icon: UserX,
    perform: notImplemented,
  },
];

/** All globally-available commands. Contextual commands are registered separately
 *  via `useOmnibarCommands()` from the feature modules that own them. */
export const STATIC_COMMANDS: readonly Command[] = [
  ...navigation,
  ...communication,
  ...appearance,
  ...presence,
  ...readState,
  ...notifications,
  ...view,
  ...help,
  ...privacy,
];
