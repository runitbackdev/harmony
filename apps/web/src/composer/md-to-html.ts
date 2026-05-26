import { createMarkdownExit, type StateInline, type PluginSimple } from "markdown-exit";
import { highlightCode } from "@/composer/highlight";

const PIPE = 0x7c;

function spoilerTokenize(state: StateInline, silent: boolean): boolean {
  if (silent) return false;
  if (state.src.charCodeAt(state.pos) !== PIPE) return false;

  const scanned = state.scanDelims(state.pos, true);
  let len = scanned.length;
  if (len < 2) return false;

  if (len % 2) {
    const token = state.push("text", "", 0);
    token.content = "|";
    len--;
  }

  for (let i = 0; i < len; i += 2) {
    const token = state.push("text", "", 0);
    token.content = "||";
    state.delimiters.push({
      marker: PIPE,
      length: 0,
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close,
    });
  }

  state.pos += scanned.length;
  return true;
}

function spoilerPostProcess(state: StateInline, delimiters: StateInline["delimiters"]) {
  for (let i = delimiters.length - 1; i >= 0; i--) {
    const startDelim = delimiters[i];
    if (startDelim.marker !== PIPE || startDelim.end === -1) continue;

    const endDelim = delimiters[startDelim.end];

    const open = state.tokens[startDelim.token];
    open.type = "spoiler_open";
    open.tag = "span";
    open.nesting = 1;
    open.markup = "||";
    open.content = "";

    const close = state.tokens[endDelim.token];
    close.type = "spoiler_close";
    close.tag = "span";
    close.nesting = -1;
    close.markup = "||";
    close.content = "";
  }
}

function isTerminator(ch: number): boolean {
  switch (ch) {
    case 0x0a:
    case 0x21:
    case 0x23:
    case 0x24:
    case 0x25:
    case 0x26:
    case 0x2a:
    case 0x2b:
    case 0x2d:
    case 0x3a:
    case 0x3c:
    case 0x3d:
    case 0x3e:
    case 0x40:
    case 0x5b:
    case 0x5c:
    case 0x5d:
    case 0x5e:
    case 0x5f:
    case 0x60:
    case 0x7b:
    case 0x7c:
    case 0x7d:
    case 0x7e:
      return true;
    default:
      return false;
  }
}

const spoiler: PluginSimple = (md) => {
  md.inline.ruler.at("text", (state, silent) => {
    let pos = state.pos;
    while (pos < state.posMax && !isTerminator(state.src.charCodeAt(pos))) pos++;
    if (pos === state.pos) return false;
    if (!silent) state.pending += state.src.slice(state.pos, pos);
    state.pos = pos;
    return true;
  });

  md.inline.ruler.before("strikethrough", "spoiler", spoilerTokenize);

  md.inline.ruler2.before("strikethrough", "spoiler", (state) => {
    spoilerPostProcess(state, state.delimiters);
    for (let i = 0; i < state.tokens_meta.length; i++) {
      const delimiters = state.tokens_meta[i]?.delimiters;
      if (delimiters) spoilerPostProcess(state, delimiters);
    }
  });

  md.renderer.rules.spoiler_open = () => '<span data-mx-spoiler="">';
  md.renderer.rules.spoiler_close = () => "</span>";
};

const subtext: PluginSimple = (md) => {
  md.block.ruler.before("paragraph", "subtext", (state, startLine, _endLine, silent) => {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (pos + 3 > max) return false;
    if (state.src.slice(pos, pos + 3) !== "-# ") return false;
    if (silent) return true;

    const content = state.src.slice(pos + 3, max);
    state.line = startLine + 1;

    const open = state.push("subtext_open", "small", 1);
    open.attrSet("data-subtext", "");
    const inline = state.push("inline", "", 0);
    inline.content = content;
    inline.children = [];
    state.push("subtext_close", "small", -1);
    return true;
  });
};

const underline: PluginSimple = (md) => {
  md.renderer.rules.strong_open = (tokens, idx) => {
    return tokens[idx].markup === "__" ? "<u>" : "<strong>";
  };
  md.renderer.rules.strong_close = (tokens, idx) => {
    return tokens[idx].markup === "__" ? "</u>" : "</strong>";
  };
};

const md = createMarkdownExit({ linkify: true });
md.use(spoiler);
md.use(subtext);
md.use(underline);

// async — only works with md.renderAsync(), not md.render()
md.renderer.rules.fence = async (tokens, idx) => {
  const token = tokens[idx];
  const lang = token.info.trim();
  return highlightCode(token.content.replace(/\n$/, ""), lang);
};

md.renderer.rules.paragraph_open = () => "<span>";
md.renderer.rules.paragraph_close = (tokens, idx) => {
  const next = tokens[idx + 1];
  const needsBreak = next && next.type === "paragraph_open";
  return needsBreak ? "</span><br><br>" : "</span>";
};

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet("rel", "noopener noreferrer");
  tokens[idx].attrSet("target", "_blank");
  return self.renderToken(tokens, idx, options);
};

export async function markdownToHtml(source: string): Promise<string | undefined> {
  const result = (await md.renderAsync(source)).trim();

  const stripped = result.replace(/^<span>(.*)<\/span>$/s, "$1");
  if (stripped === source) return undefined;

  return result;
}
