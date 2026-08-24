import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Autocomplete, Dialog, ScrollArea } from "@runitbk/react";
import type { RoomDataWithSpace } from "@harmony/core";
import { fetchAllRooms, ROOMS_QUERY_KEY, ROOMS_STALE_TIME_MS } from "@/rooms/queries";
import { useOmnibar } from "./use-omnibar";
import { useAllCommands } from "./registry";
import { useScorers } from "./scorer";
import { parseMode, runPipeline } from "./pipeline";
import { OmnibarRow } from "./row";
import {
  recordSelection,
  recordUsage,
  useFrequencies,
  useQueryLearning,
  useRecents,
} from "./store";
import type { OmnibarItem } from "./types";

const EMPTY_ROOMS: RoomDataWithSpace[] = [];

function itemId(item: OmnibarItem) {
  switch (item.kind) {
    case "command":
      return `cmd:${item.command.id}`;
    case "room":
      return `room:${item.room.roomId}`;
  }
}

export function Omnibar() {
  const { open, setOpen } = useOmnibar();
  const navigate = useNavigate();
  const { spaceId: currentSpaceId } = useParams({ strict: false });
  const allCommands = useAllCommands();
  const recents = useRecents();
  const frequencies = useFrequencies();
  const queries = useQueryLearning();
  const [input, setInput] = useState("");
  // Pipeline + collection use the deferred value so a fast burst of keystrokes
  // doesn't churn through N collection rebuilds — the library only sees the
  // settled query, while the input field below still reflects `input` directly
  // so typing stays visually instant.
  const deferredInput = useDeferredValue(input);

  const { data: rooms = EMPTY_ROOMS, error: roomsError } = useQuery({
    queryKey: ROOMS_QUERY_KEY,
    queryFn: fetchAllRooms,
    enabled: open,
    staleTime: ROOMS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (roomsError) console.error("Failed to load rooms for omnibar", roomsError);
  }, [roomsError]);

  useEffect(() => {
    if (!open) setInput("");
  }, [open]);

  const scorers = useScorers(allCommands, rooms, open);

  const parsed = useMemo(() => parseMode(deferredInput), [deferredInput]);

  const { filtered, isShowingRecents } = useMemo(
    () =>
      runPipeline({
        ...parsed,
        allCommands,
        rooms,
        recents,
        frequencies,
        queries,
        scorers,
        currentSpaceId,
      }),
    [parsed, allCommands, rooms, recents, frequencies, queries, scorers, currentSpaceId],
  );

  const handleSelect = (item: OmnibarItem) => {
    if (item.kind === "command") {
      recordUsage({ id: item.command.id, kind: "command", query: parsed.query });
      item.command.perform();
      setOpen(false);
      return;
    }
    const space = item.room.parentSpace;
    if (!space) {
      setOpen(false);
      return;
    }

    // Frequency + recents are recorded by the room route on mount, so URL
    // nav and omnibar nav agree. Only the query-learning side belongs here.
    if (parsed.query.length > 0) {
      recordSelection({ query: parsed.query, id: item.room.roomId, kind: "room" });
    }

    void navigate({
      to: "/$spaceId/$roomId",
      params: { spaceId: space.roomId, roomId: item.room.roomId },
    });
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-w-3xl p-0 overflow-hidden">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Autocomplete.Root
            open
            inline
            mode="none"
            autoHighlight
            items={filtered}
            value={input}
            onValueChange={(value) => setInput(value)}
          >
            <div className="border-b border-line">
              <Autocomplete.Input
                autoFocus
                placeholder="Type a command or jump to a channel…"
                className="w-full rounded-none border-none bg-transparent px-5 py-4 outline-none focus:ring-0 text-subhead placeholder:text-faint"
              />
            </div>
            <ScrollArea.Root className="h-56">
              <ScrollArea.Viewport className="py-1">
                {filtered.length === 0 ? (
                  <div className="px-4 py-8 text-center text-small text-sub">
                    {input ? "No matches." : "Start typing…"}
                  </div>
                ) : (
                  <Autocomplete.List className="flex max-h-none flex-col overflow-visible">
                    {filtered.map((item, idx) => (
                      <Autocomplete.Item
                        key={itemId(item)}
                        value={item}
                        index={idx}
                        onClick={() => handleSelect(item)}
                        className="rounded-none px-4 py-2 data-highlighted:ring-0"
                        render={
                          <OmnibarRow
                            item={item}
                            query={parsed.query}
                            showRecentHint={isShowingRecents && idx === 0}
                          />
                        }
                      />
                    ))}
                  </Autocomplete.List>
                )}
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar>
                <ScrollArea.Thumb />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
            <div className="border-t border-line px-4 py-2 text-data text-sub flex items-center gap-3">
              <span>
                <kbd className="font-mono">↑↓</kbd> navigate
              </span>
              <span>
                <kbd className="font-mono">⏎</kbd> select
              </span>
              <span>
                <kbd className="font-mono">esc</kbd> close
              </span>
            </div>
          </Autocomplete.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
