import { useState, useRef, useEffect, useCallback, useMemo, memo, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type EmojiResult,
  type EmojiGroup,
  getEmojiByGroup,
  getFrequentlyUsed,
  recordUsage,
  searchEmojiForPicker,
} from "./emoji";

type EmojiPickerButtonProps = {
  onSelect: (emoji: { native?: string }) => void;
  placement?: "top-end" | "left-start" | "right-start" | "bottom-end";
};

const FREQUENTLY_USED_GROUP = -1;
const COLUMNS = 8;
const HEADER_HEIGHT = 28;
const ROW_HEIGHT = 32;

export default function EmojiPickerButton({
  onSelect,
  placement = "top-end",
}: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { floatingStyles, refs } = useFloating({
    open,
    placement,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const handleSelect = useCallback(
    (emoji: EmojiResult, event: Pick<MouseEvent | KeyboardEvent, "shiftKey">) => {
      recordUsage(emoji.id);
      onSelect({ native: emoji.native });
      if (!event.shiftKey) setOpen(false);
    },
    [onSelect],
  );

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.emojiPickerOpen = "";
    return () => {
      delete document.documentElement.dataset.emojiPickerOpen;
    };
  }, [open]);

  return (
    <>
      <button
        ref={(node) => {
          triggerRef.current = node;
          refs.setReference(node);
        }}
        type="button"
        data-scope="emoji-picker"
        data-part="trigger"
        data-state={open ? "open" : undefined}
        onClick={() => setOpen((o) => !o)}
        aria-label="Open emoji picker"
        aria-expanded={open}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            data-scope="emoji-picker"
            data-part="popover"
          >
            <PickerDialog onSelect={handleSelect} onClose={handleClose} />
          </div>,
          document.body,
        )}
    </>
  );
}

type VirtualRow =
  | { type: "header"; group: number; label: string }
  | { type: "emoji-row"; group: number; emoji: EmojiResult[] };

function buildVirtualRows(groups: EmojiGroup[]): VirtualRow[] {
  const rows: VirtualRow[] = [];
  for (const g of groups) {
    rows.push({ type: "header", group: g.group, label: g.label });
    for (let i = 0; i < g.emoji.length; i += COLUMNS) {
      rows.push({ type: "emoji-row", group: g.group, emoji: g.emoji.slice(i, i + COLUMNS) });
    }
  }
  return rows;
}

type PickerDialogProps = {
  onSelect: (emoji: EmojiResult, event: Pick<MouseEvent | KeyboardEvent, "shiftKey">) => void;
  onClose: () => void;
};

function PickerDialog({ onSelect, onClose }: PickerDialogProps) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EmojiResult[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const activeTabRef = useRef<number>(FREQUENTLY_USED_GROUP);

  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => getEmojiByGroup(), []);
  const frequentlyUsed = useMemo(() => getFrequentlyUsed(), []);

  const allGroups: EmojiGroup[] = useMemo(() => {
    const result: EmojiGroup[] = [];
    if (frequentlyUsed.length > 0) {
      result.push({
        group: FREQUENTLY_USED_GROUP,
        label: "Frequently Used",
        emoji: frequentlyUsed,
      });
    }
    result.push(...groups);
    return result;
  }, [groups, frequentlyUsed]);

  const isSearching = query.length > 0;

  const flatEmoji = useMemo(
    () => (isSearching ? searchResults : allGroups.flatMap((g) => g.emoji)),
    [isSearching, searchResults, allGroups],
  );

  const virtualRows = useMemo(
    () =>
      isSearching
        ? buildVirtualRows([{ group: -2, label: "Search Results", emoji: searchResults }])
        : buildVirtualRows(allGroups),
    [isSearching, searchResults, allGroups],
  );

  // Map group number -> index of its header row in virtualRows
  const groupHeaderIndex = useMemo(() => {
    const map = new Map<number, number>();
    virtualRows.forEach((row, i) => {
      if (row.type === "header") map.set(row.group, i);
    });
    return map;
  }, [virtualRows]);

  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (virtualRows[i]?.type === "header" ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: 3,
  });

  // Auto-focus search on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Search handler
  useEffect(() => {
    if (!query) {
      setSearchResults([]);
      setFocusedIndex(-1);
      return;
    }

    let cancelled = false;
    void searchEmojiForPicker(query).then((results) => {
      if (!cancelled) {
        setSearchResults(results);
        setFocusedIndex(results.length > 0 ? 0 : -1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  function syncActiveTab(group: number) {
    if (group === activeTabRef.current) return;
    activeTabRef.current = group;
    const tablist = tablistRef.current;
    if (!tablist) return;
    const label = allGroups.find((g) => g.group === group)?.label;
    for (const btn of tablist.children) {
      if (!(btn instanceof HTMLElement)) continue;
      const isActive = btn.getAttribute("aria-label") === label;
      btn.setAttribute("data-state", isActive ? "active" : "");
      btn.setAttribute("aria-selected", String(isActive));
      btn.setAttribute("tabindex", isActive ? "0" : "-1");
    }
  }

  // Scroll-sync: derive active tab from visible virtual rows
  useEffect(() => {
    if (isSearching || !scrollRef.current) return;

    let rafId = 0;
    function onScroll() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const items = virtualizer.getVirtualItems();
        if (items.length === 0) return;

        let group: number | null = null;
        for (const item of items) {
          const row = virtualRows[item.index];
          if (row?.type === "header") {
            group = row.group;
            break;
          }
        }
        if (group === null) {
          const firstRow = virtualRows[items[0]!.index];
          if (firstRow) group = firstRow.group;
        }
        if (group !== null) {
          syncActiveTab(group);
        }
      });
    }

    const el = scrollRef.current;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [isSearching, virtualRows, virtualizer]);

  // Focus trap
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        if (query) {
          setQuery("");
        } else {
          onClose();
        }
        e.preventDefault();
        return;
      }

      if (e.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'input, button:not([tabindex="-1"]), [tabindex="0"]',
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [query, onClose]);

  // Click-outside handler
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const scrollToGroup = useCallback(
    (group: number) => {
      const idx = groupHeaderIndex.get(group);
      if (idx !== undefined) {
        virtualizer.scrollToIndex(idx, { align: "start" });
      }
    },
    [groupHeaderIndex, virtualizer],
  );

  // Find which virtual row + position within it an emoji flat index maps to
  function scrollToFlatIndex(index: number) {
    const emoji = flatEmoji[index];
    if (!emoji) return;

    // Find which virtual row contains this emoji
    for (let i = 0; i < virtualRows.length; i++) {
      const row = virtualRows[i];
      if (row?.type === "emoji-row" && row.emoji.some((e) => e.id === emoji.id)) {
        virtualizer.scrollToIndex(i, { align: "auto" });
        return;
      }
    }
  }

  function handleGridKeyDown(e: KeyboardEvent) {
    if (focusedIndex < 0 || flatEmoji.length === 0) return;

    let next = focusedIndex;

    switch (e.key) {
      case "ArrowRight":
        next = Math.min(focusedIndex + 1, flatEmoji.length - 1);
        break;
      case "ArrowLeft":
        next = Math.max(focusedIndex - 1, 0);
        break;
      case "ArrowDown":
        next = Math.min(focusedIndex + COLUMNS, flatEmoji.length - 1);
        break;
      case "ArrowUp":
        next = Math.max(focusedIndex - COLUMNS, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = flatEmoji.length - 1;
        break;
      case "Enter":
      case " ":
        if (flatEmoji[focusedIndex]) {
          onSelect(flatEmoji[focusedIndex], e);
        }
        e.preventDefault();
        return;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          searchRef.current?.focus();
          return;
        }
        return;
    }

    e.preventDefault();
    setFocusedIndex(next);
    scrollToFlatIndex(next);
  }

  function handleSearchKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" && flatEmoji.length > 0) {
      e.preventDefault();
      setFocusedIndex(0);
      scrollToFlatIndex(0);
    }
  }

  function handleTabKeyDown(e: KeyboardEvent, groupList: EmojiGroup[]) {
    const currentIdx = groupList.findIndex((g) => g.group === activeTabRef.current);
    let nextIdx = currentIdx;

    if (e.key === "ArrowRight") {
      nextIdx = Math.min(currentIdx + 1, groupList.length - 1);
    } else if (e.key === "ArrowLeft") {
      nextIdx = Math.max(currentIdx - 1, 0);
    } else {
      return;
    }

    e.preventDefault();
    const next = groupList[nextIdx];
    if (next) {
      syncActiveTab(next.group);
      scrollToGroup(next.group);
    }
  }

  const flatIndexById = useMemo(() => {
    const map = new Map<string, number>();
    flatEmoji.forEach((e, i) => map.set(e.id, i));
    return map;
  }, [flatEmoji]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Emoji picker"
      data-scope="emoji-picker"
      data-part="dialog"
    >
      <input
        ref={searchRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleSearchKeyDown}
        placeholder="Search emoji..."
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isSearching && searchResults.length > 0}
        aria-label="Search emoji"
        data-scope="emoji-picker"
        data-part="search"
      />

      {!isSearching && (
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="Emoji categories"
          data-scope="emoji-picker"
          data-part="tablist"
          onKeyDown={(e) => handleTabKeyDown(e, allGroups)}
        >
          {allGroups.map((g) => {
            const isDefault = g.group === FREQUENTLY_USED_GROUP;
            return (
              <button
                key={g.group}
                type="button"
                role="tab"
                aria-selected={isDefault}
                aria-label={g.label}
                tabIndex={isDefault ? 0 : -1}
                data-scope="emoji-picker"
                data-part="tab"
                data-state={isDefault ? "active" : ""}
                onClick={() => {
                  syncActiveTab(g.group);
                  scrollToGroup(g.group);
                }}
              >
                {getCategoryIcon(g.group)}
              </button>
            );
          })}
        </div>
      )}

      <div
        ref={scrollRef}
        data-scope="emoji-picker"
        data-part="panel"
        role="group"
        aria-label={isSearching ? "Search results" : "Emoji"}
        onKeyDown={handleGridKeyDown}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = virtualRows[virtualItem.index]!;

            if (row.type === "header") {
              return (
                <div
                  key={`header-${row.group}`}
                  data-scope="emoji-picker"
                  data-part="category-header"
                  data-group={row.group}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: HEADER_HEIGHT,
                    transform: `translate3d(0,${virtualItem.start}px,0)`,
                    contain: "strict",
                  }}
                >
                  {row.label}
                </div>
              );
            }

            const focusedEmoji = focusedIndex >= 0 ? flatEmoji[focusedIndex] : null;
            const rowHasFocus = focusedEmoji
              ? row.emoji.some((e) => e.id === focusedEmoji.id)
              : false;

            return (
              <EmojiRow
                key={`row-${virtualItem.index}`}
                emoji={row.emoji}
                startY={virtualItem.start}
                focusedId={rowHasFocus ? focusedEmoji!.id : null}
                flatIndexById={flatIndexById}
                onSelect={onSelect}
                onFocus={setFocusedIndex}
              />
            );
          })}
        </div>

        {isSearching && searchResults.length === 0 && (
          <p data-scope="emoji-picker" data-part="empty">
            No emoji found
          </p>
        )}
      </div>
    </div>
  );
}

type EmojiRowProps = {
  emoji: EmojiResult[];
  startY: number;
  focusedId: string | null;
  flatIndexById: Map<string, number>;
  onSelect: (emoji: EmojiResult, event: Pick<MouseEvent | KeyboardEvent, "shiftKey">) => void;
  onFocus: (index: number) => void;
};

const EmojiRow = memo(function EmojiRow({
  emoji,
  startY,
  focusedId,
  flatIndexById,
  onSelect,
  onFocus,
}: EmojiRowProps) {
  function handleClick(e: React.MouseEvent) {
    const btn = (e.target as HTMLElement).closest("[data-emoji-idx]") as HTMLElement | null;
    if (!btn) return;
    const idx = Number(btn.dataset.emojiIdx);
    const em = emoji[idx];
    if (em) onSelect(em, e);
  }

  function handleFocus(e: React.FocusEvent) {
    const btn = (e.target as HTMLElement).closest("[data-emoji-idx]") as HTMLElement | null;
    if (!btn) return;
    const idx = Number(btn.dataset.emojiIdx);
    const em = emoji[idx];
    if (em) onFocus(flatIndexById.get(em.id) ?? -1);
  }

  return (
    <div
      data-scope="emoji-picker"
      data-part="grid-row"
      onClick={handleClick}
      onFocus={handleFocus}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: ROW_HEIGHT,
        transform: `translate3d(0,${startY}px,0)`,
        display: "grid",
        gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
        contain: "strict",
      }}
    >
      {emoji.map((e, i) => {
        const isFocused = e.id === focusedId;
        return (
          <button
            key={e.id}
            type="button"
            aria-label={e.name}
            tabIndex={isFocused ? 0 : -1}
            data-scope="emoji-picker"
            data-part="emoji"
            data-emoji-idx={i}
            data-state={isFocused ? "focused" : undefined}
          >
            {e.native}
          </button>
        );
      })}
    </div>
  );
});

function getCategoryIcon(group: number): string {
  switch (group) {
    case FREQUENTLY_USED_GROUP:
      return "🕐";
    case 0:
      return "😀";
    case 1:
      return "👋";
    case 3:
      return "🐻";
    case 4:
      return "🍔";
    case 5:
      return "✈️";
    case 6:
      return "⚽";
    case 7:
      return "💡";
    case 8:
      return "🔣";
    case 9:
      return "🏁";
    default:
      return "❓";
  }
}
