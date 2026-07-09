// Worklet-safe: no DOM, no imports, no module state, no classes.

export type BlockType = "codeblock" | "blockquote" | "subtext" | "heading" | "paragraph";

export type InlineType =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "spoiler"
  | "code"
  | "link"
  | "autolink"
  | "mention";

export type TokenType = BlockType | InlineType | "syntax";

export interface Range {
  type: TokenType;
  start: number;
  end: number;
  depth?: number;
  meta?: string;
}
