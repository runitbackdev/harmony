import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as zagCombobox from "@zag-js/combobox";
import { normalizeProps, useMachine } from "@zag-js/react";
import { Dialog } from "@runitback/react";
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

function itemLabel(item: OmnibarItem) {
  switch (item.kind) {
    case "command":
      return item.command.label;
    case "room":
      return item.room.displayName;
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

  const collection = useMemo(
    () =>
      zagCombobox.collection<OmnibarItem>({
        items: filtered,
        itemToValue: itemId,
        itemToString: itemLabel,
      }),
    [filtered],
  );

  const comboboxId = useId();

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

  const comboboxService = useMachine(zagCombobox.machine, {
    id: comboboxId,
    collection,
    inputValue: input,
    onInputValueChange: ({ inputValue }) => setInput(inputValue),
    value: [],
    selectionBehavior: "clear",
    open: true,
    disableLayer: true,
    inputBehavior: "autohighlight",
    defaultHighlightedValue: filtered[0] ? itemId(filtered[0]) : undefined,
    onSelect: ({ itemValue }) => {
      const item = filtered.find((i) => itemId(i) === itemValue);
      if (item) handleSelect(item);
    },
  });
  const combobox = zagCombobox.connect(comboboxService, normalizeProps);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-w-3xl p-0 overflow-hidden">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div {...combobox.getRootProps()}>
            <div {...combobox.getControlProps()} className="border-b border-line">
              <input
                {...combobox.getInputProps()}
                autoFocus
                placeholder="Type a command or jump to a channel…"
                className="w-full bg-transparent px-5 py-4 outline-none text-subhead placeholder:text-faint"
              />
            </div>
            <div {...combobox.getContentProps()} className="h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-small text-sub">
                  {input ? "No matches." : "Start typing…"}
                </div>
              ) : (
                <ul {...combobox.getListProps()} className="flex flex-col">
                  {filtered.map((item, idx) => (
                    <OmnibarRow
                      key={itemId(item)}
                      item={item}
                      query={parsed.query}
                      showRecentHint={isShowingRecents && idx === 0}
                      {...combobox.getItemProps({ item })}
                    />
                  ))}
                </ul>
              )}
            </div>
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
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
