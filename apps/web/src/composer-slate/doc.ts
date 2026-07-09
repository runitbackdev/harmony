import type { Descendant, Point } from "slate";
import { parse, type Range } from "@harmony/markdown";

export interface Segment {
  start: number;
  len: number;
}

export interface DocModel {
  text: string;
  ranges: Range[];
  segments: Map<string, Segment>;
}

export const VOID_CHAR = "￼";

export function buildDoc(children: Descendant[]): DocModel {
  let text = "";
  const segments = new Map<string, Segment>();

  children.forEach((block, b) => {
    if (b > 0) text += "\n";
    if (!("children" in block)) return;
    block.children.forEach((child, c) => {
      if ("text" in child) {
        segments.set(`${b}.${c}`, { start: text.length, len: child.text.length });
        text += child.text;
      } else {
        text += VOID_CHAR;
      }
    });
  });

  return { text, ranges: parse(text), segments };
}

export function pointOffset(doc: DocModel, point: Point) {
  const segment = doc.segments.get(point.path.join("."));
  return segment === undefined ? undefined : segment.start + point.offset;
}
