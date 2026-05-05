import type { RoomWithSpaceSummary } from "@harmony/protocol";
import type { LucideIcon } from "lucide-react";

export interface Command {
  /** Stable, namespaced identifier. e.g. "theme.toggle-dark" */
  id: string;
  /** User-facing label */
  label: string;
  /** Leading icon. Required for visual consistency. */
  icon: LucideIcon;
  /** Alternate names this command should match against */
  keywords?: string[];
  /** Display-only shortcut hint, e.g. "⌘⇧L". Actual binding lives elsewhere. */
  shortcut?: string;
  /** Action to run on selection */
  perform: () => void;
  /** Reactive gate. When false, the command is excluded from results. */
  when?: () => boolean;
  /** Empty-state visibility weight. >0 = surfaces when no recents; absent/0 = hidden until typed. */
  defaultScore?: number;
}

/** Discriminated union of everything the omnibar can show as a result. */
export type OmnibarItem =
  | { kind: "room"; room: RoomWithSpaceSummary }
  | { kind: "command"; command: Command };

export type OmnibarItemKind = OmnibarItem["kind"];
