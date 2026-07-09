import type { Descendant } from "slate";
import type { InlineDescendant } from "./types";

const MENTION = /\[@([^\]]+)\]\(https:\/\/matrix\.to\/#\/(@[^)\s]+)\)/g;

export function serialize(nodes: Descendant[]) {
  return nodes
    .map((node) => ("children" in node ? node.children.map(serializeInline).join("") : ""))
    .join("\n");
}

function serializeInline(node: InlineDescendant | Descendant) {
  if ("text" in node) return node.text;
  if (node.type === "mention") return `[@${node.name}](https://matrix.to/#/${node.userId})`;
  if (node.type === "emoji") return node.unicode ?? `:${node.shortcode}:`;
  return "";
}

export function deserialize(src: string): Descendant[] {
  return src
    .split(/\r?\n/)
    .map((line) => ({ type: "paragraph" as const, children: lineChildren(line) }));
}

function lineChildren(line: string) {
  const children: InlineDescendant[] = [];
  let cursor = 0;

  for (const match of line.matchAll(MENTION)) {
    children.push({ text: line.slice(cursor, match.index) });
    children.push({
      type: "mention",
      name: match[1]!,
      userId: match[2]!,
      children: [{ text: "" }],
    });
    cursor = match.index + match[0].length;
  }
  children.push({ text: line.slice(cursor) });

  return children;
}
