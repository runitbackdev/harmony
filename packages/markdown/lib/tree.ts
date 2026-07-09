import type { Range, TokenType } from "./types.ts";

export type Node =
  | { kind: "text"; value: string }
  | {
      kind: "element";
      type: Exclude<TokenType, "syntax">;
      depth?: number;
      meta?: string;
      children: Node[];
    };

export function toTree(src: string, ranges: Range[]) {
  const root: Node[] = [];
  const stack: { range: Range; children: Node[] }[] = [];
  let pos = 0;

  const childrenAt = () => stack.at(-1)?.children ?? root;

  const flushText = (until: number) => {
    if (pos < until && stack.length > 0) {
      childrenAt().push({ kind: "text", value: src.slice(pos, until) });
    }
    pos = Math.max(pos, until);
  };

  const popUntil = (start: number) => {
    while (stack.length > 0 && stack.at(-1)!.range.end <= start) {
      flushText(stack.at(-1)!.range.end);
      stack.pop();
    }
  };

  for (const range of ranges) {
    popUntil(range.start);
    flushText(range.start);

    if (range.type === "syntax") {
      pos = range.end;
      continue;
    }

    const element: Node = { kind: "element", type: range.type, children: [] };
    if (range.depth !== undefined) element.depth = range.depth;
    if (range.meta !== undefined) element.meta = range.meta;
    childrenAt().push(element);
    stack.push({ range, children: element.children });
  }

  popUntil(src.length);
  flushText(src.length);

  return root;
}
