import { Marked, type TokenizerExtension, type RendererExtension } from "marked";

const spoiler: TokenizerExtension & RendererExtension = {
  name: "spoiler",
  level: "inline",
  start: (src) => src.indexOf("||"),
  tokenizer(src) {
    const match = /^\|\|(.+?)\|\|/.exec(src);
    if (match) {
      return {
        type: "spoiler",
        raw: match[0],
        text: match[1],
        tokens: this.lexer.inlineTokens(match[1]),
      };
    }
  },
  renderer(token) {
    return `<span data-mx-spoiler="">${this.parser.parseInline(token.tokens!)}</span>`;
  },
};

const underline: TokenizerExtension & RendererExtension = {
  name: "underline",
  level: "inline",
  start: (src) => src.indexOf("__"),
  tokenizer(src) {
    const match = /^__(.+?)__/.exec(src);
    if (match) {
      return {
        type: "underline",
        raw: match[0],
        text: match[1],
        tokens: this.lexer.inlineTokens(match[1]),
      };
    }
  },
  renderer(token) {
    return `<u>${this.parser.parseInline(token.tokens!)}</u>`;
  },
};

const subtext: TokenizerExtension & RendererExtension = {
  name: "subtext",
  level: "block",
  start: (src) => src.indexOf("-# "),
  tokenizer(src) {
    const match = /^-# (.+?)(?:\n|$)/.exec(src);
    if (match) {
      return {
        type: "subtext",
        raw: match[0],
        text: match[1],
        tokens: this.lexer.inlineTokens(match[1]),
      };
    }
  },
  renderer(token) {
    return `<small data-subtext="">${this.parser.parseInline(token.tokens!)}</small>\n`;
  },
};

const strikethrough: TokenizerExtension & RendererExtension = {
  name: "strikethrough",
  level: "inline",
  start: (src) => src.indexOf("~~"),
  tokenizer(src) {
    const match = /^~~(.+?)~~/.exec(src);
    if (match) {
      return {
        type: "strikethrough",
        raw: match[0],
        text: match[1],
        tokens: this.lexer.inlineTokens(match[1]),
      };
    }
  },
  renderer(token) {
    return `<del>${this.parser.parseInline(token.tokens!)}</del>`;
  },
};

const marked = new Marked({
  extensions: [spoiler, underline, subtext, strikethrough],
  async: false,
});

const renderer = {
  link({ href, text }: { href: string; text: string }) {
    return `<a href="${href}" rel="noopener noreferrer" target="_blank">${text}</a>`;
  },
};

marked.use({ renderer });

export function markdownToHtml(source: string): string | undefined {
  const result = (marked.parse(source) as string).trim();

  const stripped = result.replace(/^<p>(.*)<\/p>$/s, "$1");
  if (stripped === source) return undefined;

  return result;
}
