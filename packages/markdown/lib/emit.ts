import { parse } from "./parse.ts";
import { toTree, type Node } from "./tree.ts";

const ANCHOR_ATTRS = 'rel="noopener noreferrer" target="_blank"';

export function emitMatrixHtml(src: string) {
  const ranges = parse(src);
  const plain = ranges.length === 0 || (ranges.length === 1 && ranges[0]!.type === "paragraph");
  if (plain) return undefined;

  const blocks = toTree(src, ranges);
  return blocks
    .map((node, i) => {
      const gap = isParagraph(node) && isParagraph(blocks[i + 1]) ? "<br><br>" : "";
      return emitNode(node) + gap;
    })
    .join("");
}

function isParagraph(node: Node | undefined) {
  return node?.kind === "element" && node.type === "paragraph";
}

function emitNode(node: Node): string {
  if (node.kind === "text") return escapeHtml(node.value).replaceAll("\n", "<br>");

  const children = () => node.children.map(emitNode).join("");

  switch (node.type) {
    case "paragraph":
      return `<span>${children()}</span>`;
    case "heading":
      return `<h${node.depth}>${children()}</h${node.depth}>`;
    case "subtext":
      return `<small data-subtext="">${children()}</small>`;
    case "blockquote":
      return `<blockquote>${children()}</blockquote>`;
    case "codeblock":
      return emitCodeblock(node);
    case "bold":
      return `<strong>${children()}</strong>`;
    case "italic":
      return `<em>${children()}</em>`;
    case "underline":
      return `<u>${children()}</u>`;
    case "strikethrough":
      return `<del>${children()}</del>`;
    case "spoiler":
      return `<span data-mx-spoiler="">${children()}</span>`;
    case "code":
      return `<code>${escapeHtml(rawText(node))}</code>`;
    case "link":
    case "autolink":
      return `<a href="${escapeHtml(node.meta ?? "")}" ${ANCHOR_ATTRS}>${children()}</a>`;
    case "mention":
      return `<a href="https://matrix.to/#/${escapeHtml(node.meta ?? "")}" ${ANCHOR_ATTRS}>${children()}</a>`;
  }
}

function emitCodeblock(node: Node & { kind: "element" }) {
  const content = rawText(node)
    .replace(/^\r?\n/, "")
    .replace(/\r?\n$/, "");
  const lang = node.meta?.replace(/[^a-zA-Z0-9_-]/g, "");
  const cls = lang ? ` class="language-${lang}"` : "";
  return `<pre><code${cls}>${escapeHtml(content)}</code></pre>`;
}

function rawText(node: Node & { kind: "element" }): string {
  return node.children
    .map((child) => (child.kind === "text" ? child.value : rawText(child)))
    .join("");
}

function escapeHtml(text: string) {
  return text.replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!,
  );
}
