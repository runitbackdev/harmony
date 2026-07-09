import type { Range } from "./types.ts";
import type { Node } from "./tree.ts";

export function printRanges(src: string, ranges: Range[]) {
  if (ranges.length === 0) return "(none)";

  return ranges
    .map((r) => {
      const parts = [`${r.type} ${r.start}..${r.end}`];
      if (r.depth !== undefined) parts.push(`depth=${r.depth}`);
      if (r.meta !== undefined) parts.push(`meta=${JSON.stringify(r.meta)}`);
      parts.push(JSON.stringify(src.slice(r.start, r.end)));
      return parts.join(" ");
    })
    .join("\n");
}

export function printTree(nodes: Node[], indent = 0): string {
  if (nodes.length === 0) return indent === 0 ? "(empty)" : "";

  return nodes
    .map((node) => {
      const pad = "  ".repeat(indent);
      if (node.kind === "text") return `${pad}text ${JSON.stringify(node.value)}`;

      const parts = [`${pad}${node.type}`];
      if (node.depth !== undefined) parts.push(`depth=${node.depth}`);
      if (node.meta !== undefined) parts.push(`meta=${JSON.stringify(node.meta)}`);
      const children = printTree(node.children, indent + 1);
      return children === "" ? parts.join(" ") : `${parts.join(" ")}\n${children}`;
    })
    .join("\n");
}
