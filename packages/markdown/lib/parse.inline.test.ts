import { expect, test } from "vitest";
import { parse } from "./parse.ts";
import { printRanges } from "./debug.ts";

function snap(src: string) {
  return printRanges(src, parse(src));
}

test("escaped delimiter", () => {
  expect(snap("\\*not bold\\*")).toMatchInlineSnapshot(`
    "paragraph 0..12 "\\\\*not bold\\\\*"
    syntax 0..1 "\\\\"
    syntax 10..11 "\\\\""
  `);
});

test("backslash before non-punctuation is literal", () => {
  expect(snap("a \\b c")).toMatchInlineSnapshot(`"paragraph 0..6 "a \\\\b c""`);
});

test("code span", () => {
  expect(snap("before `code` after")).toMatchInlineSnapshot(`
    "paragraph 0..19 "before \`code\` after"
    code 7..13 "\`code\`"
    syntax 7..8 "\`"
    syntax 12..13 "\`""
  `);
});

test("double-backtick span containing backtick", () => {
  expect(snap("``a`b``")).toMatchInlineSnapshot(`
    "paragraph 0..7 "\`\`a\`b\`\`"
    code 0..7 "\`\`a\`b\`\`"
    syntax 0..2 "\`\`"
    syntax 5..7 "\`\`""
  `);
});

test("unclosed backtick is literal", () => {
  expect(snap("`unclosed")).toMatchInlineSnapshot(`"paragraph 0..9 "\`unclosed""`);
});

test("mismatched backtick runs are literal", () => {
  expect(snap("``a`")).toMatchInlineSnapshot(`"paragraph 0..4 "\`\`a\`""`);
});

test("code span across newline in one paragraph", () => {
  expect(snap("`a\nb`")).toMatchInlineSnapshot(`
    "paragraph 0..5 "\`a\\nb\`"
    code 0..5 "\`a\\nb\`"
    syntax 0..1 "\`"
    syntax 4..5 "\`""
  `);
});

test("code span is opaque", () => {
  expect(snap("`[not](a-link) \\* https://nope.com`")).toMatchInlineSnapshot(`
    "paragraph 0..35 "\`[not](a-link) \\\\* https://nope.com\`"
    code 0..35 "\`[not](a-link) \\\\* https://nope.com\`"
    syntax 0..1 "\`"
    syntax 34..35 "\`""
  `);
});

test("link", () => {
  expect(snap("[text](https://example.com)")).toMatchInlineSnapshot(`
    "paragraph 0..27 "[text](https://example.com)"
    link 0..27 meta="https://example.com" "[text](https://example.com)"
    syntax 0..1 "["
    syntax 5..27 "](https://example.com)""
  `);
});

test("mention", () => {
  expect(snap("[@Ethan](https://matrix.to/#/@ethan:example.org)")).toMatchInlineSnapshot(`
    "paragraph 0..48 "[@Ethan](https://matrix.to/#/@ethan:example.org)"
    mention 0..48 meta="@ethan:example.org" "[@Ethan](https://matrix.to/#/@ethan:example.org)"
    syntax 0..1 "["
    syntax 7..48 "](https://matrix.to/#/@ethan:example.org)""
  `);
});

test("link label may contain code", () => {
  expect(snap("[see `x`](https://example.com)")).toMatchInlineSnapshot(`
    "paragraph 0..30 "[see \`x\`](https://example.com)"
    link 0..30 meta="https://example.com" "[see \`x\`](https://example.com)"
    syntax 0..1 "["
    code 5..8 "\`x\`"
    syntax 5..6 "\`"
    syntax 7..8 "\`"
    syntax 8..30 "](https://example.com)""
  `);
});

test("autolink inside label is suppressed", () => {
  expect(snap("[go https://inner.com](https://outer.com)")).toMatchInlineSnapshot(`
    "paragraph 0..41 "[go https://inner.com](https://outer.com)"
    link 0..41 meta="https://outer.com" "[go https://inner.com](https://outer.com)"
    syntax 0..1 "["
    syntax 21..41 "](https://outer.com)""
  `);
});

test("link dest with space is literal", () => {
  expect(snap("[text](has space)")).toMatchInlineSnapshot(`"paragraph 0..17 "[text](has space)""`);
});

test("nested bracket is literal", () => {
  expect(snap("[a[b]](https://example.com)")).toMatchInlineSnapshot(`
    "paragraph 0..27 "[a[b]](https://example.com)"
    autolink 7..26 meta="https://example.com" "https://example.com""
  `);
});

test("empty label is literal", () => {
  expect(snap("[](https://example.com)")).toMatchInlineSnapshot(`
    "paragraph 0..23 "[](https://example.com)"
    autolink 3..22 meta="https://example.com" "https://example.com""
  `);
});

test("empty dest is literal", () => {
  expect(snap("[text]()")).toMatchInlineSnapshot(`"paragraph 0..8 "[text]()""`);
});

test("autolink", () => {
  expect(snap("see https://example.com now")).toMatchInlineSnapshot(`
    "paragraph 0..27 "see https://example.com now"
    autolink 4..23 meta="https://example.com" "https://example.com""
  `);
});

test("autolink trims trailing punctuation", () => {
  expect(snap("read https://example.com.")).toMatchInlineSnapshot(`
    "paragraph 0..25 "read https://example.com."
    autolink 5..24 meta="https://example.com" "https://example.com""
  `);
});

test("autolink in parens", () => {
  expect(snap("(https://example.com)")).toMatchInlineSnapshot(`
    "paragraph 0..21 "(https://example.com)"
    autolink 1..20 meta="https://example.com" "https://example.com""
  `);
});

test("autolink loses balanced trailing paren", () => {
  expect(snap("https://en.wikipedia.org/wiki/A_(b)")).toMatchInlineSnapshot(`
    "paragraph 0..35 "https://en.wikipedia.org/wiki/A_(b)"
    autolink 0..34 meta="https://en.wikipedia.org/wiki/A_(b" "https://en.wikipedia.org/wiki/A_(b""
  `);
});

test("autolink in angle brackets excludes the closer", () => {
  expect(snap("see <https://example.com> now")).toMatchInlineSnapshot(`
    "paragraph 0..29 "see <https://example.com> now"
    autolink 5..24 meta="https://example.com" "https://example.com""
  `);
});

test("autolink requires a word boundary", () => {
  expect(snap("xhttps://example.com")).toMatchInlineSnapshot(
    `"paragraph 0..20 "xhttps://example.com""`,
  );
});

test("inline inside heading", () => {
  expect(snap("# see `code`")).toMatchInlineSnapshot(`
    "heading 0..12 depth=1 "# see \`code\`"
    syntax 0..2 "# "
    code 6..12 "\`code\`"
    syntax 6..7 "\`"
    syntax 11..12 "\`""
  `);
});

test("inline inside subtext", () => {
  expect(snap("-# via https://example.com")).toMatchInlineSnapshot(`
    "subtext 0..26 "-# via https://example.com"
    syntax 0..3 "-# "
    autolink 7..26 meta="https://example.com" "https://example.com""
  `);
});

test("inline inside blockquote lines", () => {
  expect(snap("> has `code`\n> and https://example.com")).toMatchInlineSnapshot(`
    "blockquote 0..38 depth=1 "> has \`code\`\\n> and https://example.com"
    syntax 0..2 "> "
    code 6..12 "\`code\`"
    syntax 6..7 "\`"
    syntax 11..12 "\`"
    syntax 13..15 "> "
    autolink 19..38 meta="https://example.com" "https://example.com""
  `);
});
