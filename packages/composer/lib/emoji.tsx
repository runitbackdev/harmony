import { joinShortcodesToEmoji, type CompactEmoji, type ShortcodesDataset } from "emojibase";
import emojis from "emojibase-data/en/compact.json";
import joypixelsShortcodes from "emojibase-data/en/shortcodes/joypixels.json";
import githubShortcodes from "emojibase-data/en/shortcodes/github.json";

export type EmojiResult = {
  id: string;
  name: string;
  native: string;
  shortcode: string;
};

export const GROUP_LABELS: Record<number, string> = {
  0: "Smileys & Emotion",
  1: "People & Body",
  3: "Animals & Nature",
  4: "Food & Drink",
  5: "Travel & Places",
  6: "Activities",
  7: "Objects",
  8: "Symbols",
  9: "Flags",
};

interface IndexedEmoji {
  unicode: string;
  label: string;
  shortcodes: string[];
  tags: string[];
  group: number;
  order: number;
  hexcode: string;
  searchText: string;
}

let index: IndexedEmoji[] | null = null;

function buildIndex(): IndexedEmoji[] {
  const shortcodeDatasets = [joypixelsShortcodes, githubShortcodes] as ShortcodesDataset[];
  for (const emoji of emojis as CompactEmoji[]) {
    joinShortcodesToEmoji(emoji, shortcodeDatasets);
  }

  return (emojis as CompactEmoji[])
    .filter((e) => e.group !== undefined)
    .map((e) => {
      const shortcodes = e.shortcodes ?? [];
      const tags = e.tags ?? [];
      return {
        unicode: e.unicode,
        label: e.label,
        shortcodes,
        tags,
        group: e.group!,
        order: e.order ?? 0,
        hexcode: e.hexcode,
        searchText: [e.label, ...shortcodes, ...tags].join(" ").toLowerCase(),
      };
    });
}

function getIndex(): IndexedEmoji[] {
  if (index) return index;
  index = buildIndex();
  return index;
}

if (typeof requestIdleCallback === "function") {
  requestIdleCallback(() => {
    index = buildIndex();
  });
} else {
  setTimeout(() => {
    index = buildIndex();
  }, 0);
}

function toResult(entry: IndexedEmoji): EmojiResult {
  return {
    id: entry.hexcode,
    name: entry.label,
    native: entry.unicode,
    shortcode: entry.shortcodes[0] ?? entry.label,
  };
}

function rankMatch(entry: IndexedEmoji, query: string): number {
  for (const sc of entry.shortcodes) {
    if (sc === query) return 0;
  }
  if (entry.label.toLowerCase().startsWith(query)) return 1;
  for (const sc of entry.shortcodes) {
    if (sc.startsWith(query)) return 2;
  }
  return 3;
}

async function searchEmoji(query: string): Promise<EmojiResult[]> {
  if (!query) return [];
  const q = query.toLowerCase();
  const entries = getIndex();

  return entries
    .filter((e) => e.searchText.includes(q))
    .sort((a, b) => rankMatch(a, q) - rankMatch(b, q))
    .slice(0, 10)
    .map(toResult);
}

async function findByShortcode(shortcode: string): Promise<EmojiResult | null> {
  const sc = shortcode.toLowerCase().replaceAll("-", "_");
  const entries = getIndex();

  const match = entries.find((e) =>
    e.shortcodes.some((s) => s === sc || s.replaceAll("-", "_") === sc),
  );

  return match ? toResult(match) : null;
}

export type EmojiGroup = { group: number; label: string; emoji: EmojiResult[] };

let cachedGroups: EmojiGroup[] | null = null;

export function getEmojiByGroup(): EmojiGroup[] {
  if (cachedGroups) return cachedGroups;

  const entries = getIndex();
  const grouped = new Map<number, IndexedEmoji[]>();

  for (const entry of entries) {
    if (!GROUP_LABELS[entry.group]) continue;
    let arr = grouped.get(entry.group);
    if (!arr) {
      arr = [];
      grouped.set(entry.group, arr);
    }
    arr.push(entry);
  }

  cachedGroups = Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .map(([group, items]) => ({
      group,
      label: GROUP_LABELS[group]!,
      emoji: items.sort((a, b) => a.order - b.order).map(toResult),
    }));

  return cachedGroups;
}

const STORAGE_KEY = "harmony:emoji:recent";
const MAX_RECENT = 50;

type UsageEntry = { hexcode: string; count: number; lastUsed: number };

function readUsageStore(): UsageEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function recordUsage(hexcode: string) {
  const store = readUsageStore();
  const existing = store.find((e) => e.hexcode === hexcode);

  if (existing) {
    existing.count++;
    existing.lastUsed = Date.now();
  } else {
    store.push({ hexcode, count: 1, lastUsed: Date.now() });
  }

  store.sort((a, b) => b.lastUsed - a.lastUsed);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store.slice(0, MAX_RECENT)));
}

export function getFrequentlyUsed(): EmojiResult[] {
  const store = readUsageStore();
  if (!store.length) return [];

  const entries = getIndex();
  const byHexcode = new Map(entries.map((e) => [e.hexcode, e]));

  return store
    .map((s) => byHexcode.get(s.hexcode))
    .filter((e): e is IndexedEmoji => e !== undefined)
    .map(toResult);
}

export { searchEmoji, findByShortcode, searchEmoji as searchEmojiForPicker };
