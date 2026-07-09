import { useCallback, useRef } from "react";
import {
  Text,
  type Descendant,
  type Editor,
  type NodeEntry,
  type Range as SlateRange,
} from "slate";
import type { Range } from "@harmony/markdown";
import { buildDoc, type DocModel } from "./doc";
import type { CustomText } from "./types";

type LeafFlags = Omit<CustomText, "text">;

export function useDecorate(editor: Editor) {
  const cache = useRef<{ children: Descendant[]; doc: DocModel }>(null);

  return useCallback(
    ([node, path]: NodeEntry): SlateRange[] => {
      if (!Text.isText(node)) return [];

      if (cache.current?.children !== editor.children) {
        cache.current = { children: editor.children, doc: buildDoc(editor.children) };
      }
      return decorations(cache.current.doc, path);
    },
    [editor],
  );
}

export function decorations(doc: DocModel, path: number[]): SlateRange[] {
  const segment = doc.segments.get(path.join("."));
  if (!segment) return [];
  const segmentEnd = segment.start + segment.len;

  const out: SlateRange[] = [];
  for (const range of doc.ranges) {
    if (range.start >= segmentEnd) break;
    if (range.end <= segment.start) continue;

    const flags = leafFlags(range);
    if (!flags) continue;

    out.push({
      anchor: { path, offset: Math.max(range.start, segment.start) - segment.start },
      focus: { path, offset: Math.min(range.end, segmentEnd) - segment.start },
      ...flags,
    });
  }
  return out;
}

function leafFlags(range: Range): LeafFlags | undefined {
  switch (range.type) {
    case "paragraph":
      return undefined;
    case "syntax":
      return { marker: true };
    case "heading":
      return { heading: range.depth as 1 | 2 | 3 };
    case "bold":
      return { bold: true };
    case "italic":
      return { italic: true };
    case "underline":
      return { underline: true };
    case "strikethrough":
      return { strikethrough: true };
    case "spoiler":
      return { spoiler: true };
    case "code":
      return { code: true };
    case "codeblock":
      return { codeblock: true };
    case "blockquote":
      return { blockquote: true };
    case "subtext":
      return { subtext: true };
    case "link":
      return { link: true };
    case "autolink":
      return { autolink: true };
    case "mention":
      return { mention: true };
  }
}
