// Worklet-safe: no DOM, no module state, no classes, RegExp only inside functions.
import type { BlockType, Range } from "./types.ts";

interface Line {
  start: number;
  end: number;
  text: string;
}

const MATRIX_TO = "https://matrix.to/#/";

export function parse(src: string) {
  const ranges: Range[] = [];
  const lines = splitLines(src);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const block = blockParser(line.text);

    if (block) {
      i = block(src, lines, i, ranges);
    } else if (line.text.trim() === "") {
      i += 1;
    } else {
      i = parseParagraph(src, lines, i, ranges);
    }
  }

  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

function blockParser(text: string) {
  if (text.startsWith("```")) return parseFence;
  if (text.startsWith("> ")) return parseBlockquote;
  if (headingDepth(text) > 0) return parseHeading;
  if (text.startsWith("-# ")) return parseSubtext;

  return;
}

function splitLines(src: string) {
  const lines: Line[] = [];
  let start = 0;
  while (start <= src.length) {
    let breakAt = src.indexOf("\n", start);
    if (breakAt === -1) breakAt = src.length;
    const crlf = breakAt < src.length && breakAt > start && src[breakAt - 1] === "\r";
    const end = crlf ? breakAt - 1 : breakAt;
    lines.push({ start, end, text: src.slice(start, end) });
    if (breakAt === src.length) break;
    start = breakAt + 1;
  }
  return lines;
}

function startsBlock(text: string) {
  return blockParser(text) !== undefined || text.trim() === "";
}

function headingDepth(text: string) {
  let depth = 0;
  while (depth < text.length && text[depth] === "#") depth += 1;
  if (depth === 0 || depth > 3) return 0;
  if (text[depth] !== " ") return 0;
  return depth;
}

function parseFence(src: string, lines: Line[], i: number, ranges: Range[]) {
  const open = lines[i]!;
  let j = i + 1;
  while (j < lines.length && lines[j]!.text.trimEnd() !== "```") j += 1;
  const close = lines[j];

  const info = open.text.slice(3).trim();
  const block: Range = { type: "codeblock", start: open.start, end: close?.end ?? src.length };
  if (info !== "") block.meta = info.split(" ")[0];
  ranges.push(block);
  ranges.push({ type: "syntax", start: open.start, end: open.end });
  if (close) ranges.push({ type: "syntax", start: close.start, end: close.end });

  return j + 1;
}

function parseBlockquote(src: string, lines: Line[], i: number, ranges: Range[]) {
  let j = i;
  while (j < lines.length && lines[j]!.text.startsWith("> ")) j += 1;

  ranges.push({ type: "blockquote", start: lines[i]!.start, end: lines[j - 1]!.end, depth: 1 });
  for (let k = i; k < j; k += 1) {
    const line = lines[k]!;
    ranges.push({ type: "syntax", start: line.start, end: line.start + 2 });
    parseInline(src, line.start + 2, line.end, ranges);
  }

  return j;
}

function parseHeading(src: string, lines: Line[], i: number, ranges: Range[]) {
  const depth = headingDepth(lines[i]!.text);
  parseMarkedLine(src, lines[i]!, ranges, { type: "heading", depth }, depth + 1);
  return i + 1;
}

function parseSubtext(src: string, lines: Line[], i: number, ranges: Range[]) {
  parseMarkedLine(src, lines[i]!, ranges, { type: "subtext" }, 3);
  return i + 1;
}

function parseMarkedLine(
  src: string,
  line: Line,
  ranges: Range[],
  head: { type: BlockType; depth?: number },
  markerLen: number,
) {
  ranges.push({ ...head, start: line.start, end: line.end });
  ranges.push({ type: "syntax", start: line.start, end: line.start + markerLen });
  parseInline(src, line.start + markerLen, line.end, ranges);
}

function parseParagraph(src: string, lines: Line[], i: number, ranges: Range[]) {
  let j = i + 1;
  while (j < lines.length && !startsBlock(lines[j]!.text)) j += 1;
  const last = lines[j - 1]!;

  ranges.push({ type: "paragraph", start: lines[i]!.start, end: last.end });
  parseInline(src, lines[i]!.start, last.end, ranges);

  return j;
}

interface Delim {
  char: string;
  start: number;
  end: number;
  canOpen: boolean;
  canClose: boolean;
}

function parseInline(src: string, start: number, end: number, ranges: Range[], links = true) {
  const delims: Delim[] = [];
  let pos = start;
  while (pos < end) {
    pos =
      tryEscape(src, pos, end, ranges) ??
      tryCodeSpan(src, pos, end, ranges) ??
      (links ? tryLink(src, pos, end, ranges) : undefined) ??
      (links ? tryAutolink(src, pos, end, start, ranges) : undefined) ??
      tryDelimiter(src, pos, end, start, delims) ??
      pos + 1;
  }
  resolveDelimiters(delims, ranges);
}

function tryDelimiter(src: string, pos: number, end: number, segStart: number, delims: Delim[]) {
  const char = src[pos]!;
  if (char !== "*" && char !== "_" && char !== "~" && char !== "|") return undefined;

  let run = 0;
  while (pos + run < end && src[pos + run] === char) run += 1;

  const before = pos > segStart ? src[pos - 1]! : "";
  const after = pos + run < end ? src[pos + run]! : "";
  const sBefore = before === "" || /\s/.test(before);
  const sAfter = after === "" || /\s/.test(after);
  const pBefore = before !== "" && /[^\s\w]/.test(before);
  const pAfter = after !== "" && /[^\s\w]/.test(after);
  const leftFlank = !sAfter && (!pAfter || sBefore || pBefore);
  const rightFlank = !sBefore && (!pBefore || sAfter || pAfter);

  if (char === "~" || char === "|") {
    if (run < 2) return pos + run;
    const inner = pos + 2 < end ? src[pos + 2]! : "";
    const canOpen = char === "|" ? true : inner !== "" && !/\s/.test(inner);
    const canClose = char === "|" ? true : !sBefore;
    delims.push({ char, start: pos, end: pos + 2, canOpen, canClose });
    return pos + 2;
  }

  const intraword = char === "*" || run >= 2;
  const canOpen = intraword ? leftFlank : leftFlank && (!rightFlank || pBefore);
  const canClose = intraword ? rightFlank : rightFlank && (!leftFlank || pAfter);
  for (let k = 0; k < run; k += 1) {
    delims.push({ char, start: pos + k, end: pos + k + 1, canOpen, canClose });
  }
  return pos + run;
}

function resolveDelimiters(delims: Delim[], ranges: Range[]) {
  const stack: Delim[] = [];
  const pairs: { open: Delim; close: Delim }[] = [];

  for (const delim of delims) {
    const openerAt = delim.canClose ? findOpener(stack, delim) : undefined;
    if (openerAt !== undefined) {
      pairs.push({ open: stack[openerAt]!, close: delim });
      stack.length = openerAt;
    } else if (delim.canOpen) {
      stack.push(delim);
    }
  }

  pairs.sort((a, b) => a.open.start - b.open.start);

  let i = 0;
  while (i < pairs.length) {
    const outer = pairs[i]!;
    const inner = pairs[i + 1];
    const merged =
      inner !== undefined &&
      inner.open.char === outer.open.char &&
      inner.open.end - inner.open.start === 1 &&
      outer.open.end - outer.open.start === 1 &&
      inner.open.start === outer.open.end &&
      outer.close.start === inner.close.end;

    if (merged) {
      emitPair(
        ranges,
        outer.open.char,
        outer.open.start,
        inner.open.end,
        inner.close.start,
        outer.close.end,
      );
      i += 2;
    } else {
      emitPair(
        ranges,
        outer.open.char,
        outer.open.start,
        outer.open.end,
        outer.close.start,
        outer.close.end,
      );
      i += 1;
    }
  }
}

function findOpener(stack: Delim[], close: Delim) {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const open = stack[i]!;
    if (open.char !== close.char || open.end === close.start) continue;
    return i;
  }
  return undefined;
}

function emitPair(
  ranges: Range[],
  char: string,
  openStart: number,
  openEnd: number,
  closeStart: number,
  closeEnd: number,
) {
  ranges.push({ type: delimiterType(char, openEnd - openStart), start: openStart, end: closeEnd });
  ranges.push({ type: "syntax", start: openStart, end: openEnd });
  ranges.push({ type: "syntax", start: closeStart, end: closeEnd });
}

function delimiterType(char: string, len: number) {
  if (char === "~") return "strikethrough";
  if (char === "|") return "spoiler";
  if (char === "_" && len === 2) return "underline";
  return len === 2 ? "bold" : "italic";
}

function tryEscape(src: string, pos: number, end: number, ranges: Range[]) {
  if (src[pos] !== "\\" || pos + 1 >= end) return undefined;
  if (!/[!-/:-@[-`{-~]/.test(src[pos + 1]!)) return undefined;

  ranges.push({ type: "syntax", start: pos, end: pos + 1 });
  return pos + 2;
}

function tryCodeSpan(src: string, pos: number, end: number, ranges: Range[]) {
  if (src[pos] !== "`") return undefined;
  const run = runLength(src, pos, end);

  let scan = pos + run;
  while (scan < end) {
    if (src[scan] !== "`") {
      scan += 1;
      continue;
    }
    const closeRun = runLength(src, scan, end);
    if (closeRun !== run) {
      scan += closeRun;
      continue;
    }
    ranges.push({ type: "code", start: pos, end: scan + run });
    ranges.push({ type: "syntax", start: pos, end: pos + run });
    ranges.push({ type: "syntax", start: scan, end: scan + run });
    return scan + run;
  }

  return pos + run;
}

function runLength(src: string, pos: number, end: number) {
  let len = 0;
  while (pos + len < end && src[pos + len] === "`") len += 1;
  return len;
}

function tryLink(src: string, pos: number, end: number, ranges: Range[]) {
  if (src[pos] !== "[") return undefined;

  const labelEnd = scanLabel(src, pos + 1, end);
  if (labelEnd === undefined || labelEnd === pos + 1) return undefined;
  if (labelEnd + 1 >= end || src[labelEnd + 1] !== "(") return undefined;

  const destEnd = scanDest(src, labelEnd + 2, end);
  if (destEnd === undefined || destEnd === labelEnd + 2) return undefined;

  const dest = src.slice(labelEnd + 2, destEnd);
  const linkEnd = destEnd + 1;
  const mention = dest.startsWith(`${MATRIX_TO}@`);

  ranges.push({
    type: mention ? "mention" : "link",
    start: pos,
    end: linkEnd,
    meta: mention ? dest.slice(MATRIX_TO.length) : dest,
  });
  ranges.push({ type: "syntax", start: pos, end: pos + 1 });
  parseInline(src, pos + 1, labelEnd, ranges, false);
  ranges.push({ type: "syntax", start: labelEnd, end: linkEnd });

  return linkEnd;
}

function scanLabel(src: string, pos: number, end: number) {
  while (pos < end) {
    const ch = src[pos]!;
    if (ch === "\\") {
      pos += 2;
    } else if (ch === "]") {
      return pos;
    } else if (ch === "[") {
      return undefined;
    } else {
      pos += 1;
    }
  }
  return undefined;
}

function scanDest(src: string, pos: number, end: number) {
  while (pos < end) {
    const ch = src[pos]!;
    if (ch === "\\") {
      pos += 2;
    } else if (ch === ")") {
      return pos;
    } else if (ch === " " || ch === "\t" || ch === "\n") {
      return undefined;
    } else {
      pos += 1;
    }
  }
  return undefined;
}

function tryAutolink(src: string, pos: number, end: number, segStart: number, ranges: Range[]) {
  if (src[pos] !== "h") return undefined;
  if (pos > segStart && /\w/.test(src[pos - 1]!)) return undefined;

  const match = /^https?:\/\/\S*[^\s.,:;!?"')\]>]/.exec(src.slice(pos, end));
  if (!match) return undefined;

  const url = match[0];
  ranges.push({ type: "autolink", start: pos, end: pos + url.length, meta: url });
  return pos + url.length;
}
