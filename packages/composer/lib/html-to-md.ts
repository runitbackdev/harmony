import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
});

turndown.addRule("spoiler", {
  filter: (node) => node.nodeName === "SPAN" && node.hasAttribute("data-mx-spoiler"),
  replacement: (content) => `||${content}||`,
});

turndown.addRule("subtext", {
  filter: (node) => node.nodeName === "SMALL" && node.hasAttribute("data-subtext"),
  replacement: (content) => `-# ${content}`,
});

turndown.addRule("underline", {
  filter: ["u"],
  replacement: (content) => `__${content}__`,
});

turndown.addRule("strikethrough", {
  filter: ["del", "s"],
  replacement: (content) => `~~${content}~~`,
});

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}
