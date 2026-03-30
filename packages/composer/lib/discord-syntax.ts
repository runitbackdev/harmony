import type { MarkdownConfig, BlockContext, Line, InlineContext } from "@lezer/markdown";
import { tags } from "@lezer/highlight";

const SpoilerDelim = { resolve: "Spoiler", mark: "SpoilerMark" };

const Spoiler: MarkdownConfig = {
  defineNodes: [
    { name: "Spoiler", style: { "Spoiler/...": tags.special(tags.content) } },
    { name: "SpoilerMark", style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: "Spoiler",
      parse(cx: InlineContext, next: number, pos: number) {
        if (next !== 124 || cx.char(pos + 1) !== 124 || cx.char(pos + 2) === 124) return -1;
        return cx.addDelimiter(SpoilerDelim, pos, pos + 2, true, true);
      },
      after: "Emphasis",
    },
  ],
};

const Subtext: MarkdownConfig = {
  defineNodes: [
    { name: "Subtext", block: true, style: tags.special(tags.content) },
    { name: "SubtextMark", style: tags.processingInstruction },
  ],
  parseBlock: [
    {
      name: "Subtext",
      parse(cx: BlockContext, line: Line) {
        if (line.next !== 45 /* '-' */) return false;
        const rest = line.text.slice(line.pos);
        if (!rest.startsWith("-# ")) return false;

        const from = cx.lineStart + line.pos;
        const markEnd = from + 2;
        const contentStart = from + 3;
        const contentEnd = cx.lineStart + line.text.length;

        const children = [
          cx.elt("SubtextMark", from, markEnd),
          ...cx.parser.parseInline(rest.slice(3), contentStart),
        ];

        cx.addElement(cx.elt("Subtext", from, contentEnd, children));
        cx.nextLine();
        return true;
      },
      before: "Blockquote",
    },
  ],
};

const UnderlineDelim = { resolve: "Underline", mark: "UnderlineMark" };

const Underline: MarkdownConfig = {
  defineNodes: [
    { name: "Underline", style: { "Underline/...": tags.special(tags.content) } },
    { name: "UnderlineMark", style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: "Underline",
      parse(cx: InlineContext, next: number, pos: number) {
        if (next !== 95 || cx.char(pos + 1) !== 95 || cx.char(pos + 2) === 95) return -1;
        // Don't match if a third underscore follows (that's ___ bold+italic territory)
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        const pBefore = /[^\s\w]/.test(before);
        const pAfter = /[^\s\w]/.test(after);
        return cx.addDelimiter(
          UnderlineDelim,
          pos,
          pos + 2,
          !sAfter && (!pAfter || sBefore || pBefore),
          !sBefore && (!pBefore || sAfter || pAfter),
        );
      },
      before: "Emphasis",
    },
  ],
};

export const discordSyntax: MarkdownConfig[] = [Spoiler, Subtext, Underline];
