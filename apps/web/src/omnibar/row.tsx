import type { ComponentProps } from "react";
import { Hash, History } from "lucide-react";
import { cn } from "@harmony/ui";
import type { Command, OmnibarItem } from "./types";

type OmnibarRowProps = ComponentProps<"li"> & {
  item: OmnibarItem;
  query: string;
  showRecentHint: boolean;
};

export function OmnibarRow({ item, query, showRecentHint, className, ...rest }: OmnibarRowProps) {
  return (
    <li
      {...rest}
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2 cursor-pointer",
        "text-surface-950-50",
        "data-highlighted:bg-surface-100-900",
        className,
      )}
    >
      {item.kind === "command" ? (
        <CommandContent item={item} query={query} showRecentHint={showRecentHint} />
      ) : (
        <RoomContent item={item} showRecentHint={showRecentHint} />
      )}
    </li>
  );
}

function matchedAlias(query: string, command: Command) {
  if (!command.keywords?.length) return null;
  const q = query.trim().toLowerCase();
  if (q.length === 0) return null;
  if (command.label.toLowerCase().includes(q)) return null;
  return command.keywords.find((kw) => kw.toLowerCase().includes(q)) ?? null;
}

function CommandContent({
  item,
  query,
  showRecentHint,
}: {
  item: Extract<OmnibarItem, { kind: "command" }>;
  query: string;
  showRecentHint: boolean;
}) {
  const alias = matchedAlias(query, item.command);
  const Icon = item.command.icon;
  return (
    <>
      <span className="flex items-center gap-2 text-sm">
        <Icon size={14} className="text-surface-500" />
        {item.command.label}
        {alias && <span className="text-surface-500"> ({alias})</span>}
      </span>
      {showRecentHint ? (
        <RecentHint />
      ) : (
        item.command.shortcut && <Shortcut text={item.command.shortcut} />
      )}
    </>
  );
}

function RoomContent({
  item,
  showRecentHint,
}: {
  item: Extract<OmnibarItem, { kind: "room" }>;
  showRecentHint: boolean;
}) {
  return (
    <>
      <span className="flex items-center gap-2 text-sm">
        <Hash size={14} className="text-surface-500" />
        {item.room.displayName}
      </span>
      {showRecentHint ? (
        <RecentHint />
      ) : (
        item.room.parentSpace && <ParentSpace name={item.room.parentSpace.displayName} />
      )}
    </>
  );
}

function RecentHint() {
  return (
    <span className="flex items-center gap-1 text-xs text-surface-500 italic">
      <History size={12} />
      recently opened
    </span>
  );
}

function Shortcut({ text }: { text: string }) {
  return <kbd className="text-xs text-surface-500 font-mono">{text}</kbd>;
}

function ParentSpace({ name }: { name: string }) {
  return <span className="text-xs text-surface-500">{name}</span>;
}
