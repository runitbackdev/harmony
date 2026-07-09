import { expect, test } from "vitest";
import { parse } from "./parse.ts";
import { printRanges } from "./debug.ts";

function snap(src: string) {
  return printRanges(src, parse(src));
}

test("empty string", () => {
  expect(snap("")).toMatchInlineSnapshot(`"(none)"`);
});

test("plain text", () => {
  expect(snap("hello world")).toMatchInlineSnapshot(`"paragraph 0..11 "hello world""`);
});

test("multi-line paragraph", () => {
  expect(snap("line one\nline two")).toMatchInlineSnapshot(
    `"paragraph 0..17 "line one\\nline two""`,
  );
});

test("blank line separates paragraphs", () => {
  expect(snap("first\n\nsecond")).toMatchInlineSnapshot(`
    "paragraph 0..5 "first"
    paragraph 7..13 "second""
  `);
});

test("headings 1-3", () => {
  expect(snap("# one\n## two\n### three")).toMatchInlineSnapshot(`
    "heading 0..5 depth=1 "# one"
    syntax 0..2 "# "
    heading 6..12 depth=2 "## two"
    syntax 6..9 "## "
    heading 13..22 depth=3 "### three"
    syntax 13..17 "### ""
  `);
});

test("h4 is plain text", () => {
  expect(snap("#### nope")).toMatchInlineSnapshot(`"paragraph 0..9 "#### nope""`);
});

test("heading without space is plain text", () => {
  expect(snap("#nospace")).toMatchInlineSnapshot(`"paragraph 0..8 "#nospace""`);
});

test("subtext", () => {
  expect(snap("-# small print")).toMatchInlineSnapshot(`
    "subtext 0..14 "-# small print"
    syntax 0..3 "-# ""
  `);
});

test("subtext without space is plain text", () => {
  expect(snap("-#nospace")).toMatchInlineSnapshot(`"paragraph 0..9 "-#nospace""`);
});

test("blockquote run", () => {
  expect(snap("> first\n> second")).toMatchInlineSnapshot(`
    "blockquote 0..16 depth=1 "> first\\n> second"
    syntax 0..2 "> "
    syntax 8..10 "> ""
  `);
});

test("bare > is plain text", () => {
  expect(snap(">nospace")).toMatchInlineSnapshot(`"paragraph 0..8 ">nospace""`);
});

test("fence with lang", () => {
  expect(snap("```ts\nconst x = 1\n```")).toMatchInlineSnapshot(`
    "codeblock 0..21 meta="ts" "\`\`\`ts\\nconst x = 1\\n\`\`\`"
    syntax 0..5 "\`\`\`ts"
    syntax 18..21 "\`\`\`""
  `);
});

test("fence without lang", () => {
  expect(snap("```\nplain\n```")).toMatchInlineSnapshot(`
    "codeblock 0..13 "\`\`\`\\nplain\\n\`\`\`"
    syntax 0..3 "\`\`\`"
    syntax 10..13 "\`\`\`""
  `);
});

test("unclosed fence runs to EOF", () => {
  expect(snap("```js\nconst y = 2")).toMatchInlineSnapshot(`
    "codeblock 0..17 meta="js" "\`\`\`js\\nconst y = 2"
    syntax 0..5 "\`\`\`js""
  `);
});

test("fence swallows markdown", () => {
  expect(snap("```\n# not a heading\n> not a quote\n```")).toMatchInlineSnapshot(`
    "codeblock 0..37 "\`\`\`\\n# not a heading\\n> not a quote\\n\`\`\`"
    syntax 0..3 "\`\`\`"
    syntax 34..37 "\`\`\`""
  `);
});

test("crlf line endings close a fence", () => {
  expect(snap("```js\r\nconst x = 1\r\n```\r\n")).toMatchInlineSnapshot(`
    "codeblock 0..23 meta="js" "\`\`\`js\\r\\nconst x = 1\\r\\n\`\`\`"
    syntax 0..5 "\`\`\`js"
    syntax 20..23 "\`\`\`""
  `);
});

test("fence close with trailing whitespace", () => {
  expect(snap("```\ncode\n``` ")).toMatchInlineSnapshot(`
    "codeblock 0..13 "\`\`\`\\ncode\\n\`\`\` "
    syntax 0..3 "\`\`\`"
    syntax 9..13 "\`\`\` ""
  `);
});

test("crlf is excluded from block ranges", () => {
  expect(snap("# title\r\nbody\r\n")).toMatchInlineSnapshot(`
    "heading 0..7 depth=1 "# title"
    syntax 0..2 "# "
    paragraph 9..13 "body""
  `);
});

test("block starters interrupt a paragraph", () => {
  expect(snap("text\n> quote\ntext again")).toMatchInlineSnapshot(`
    "paragraph 0..4 "text"
    blockquote 5..12 depth=1 "> quote"
    syntax 5..7 "> "
    paragraph 13..23 "text again""
  `);
});

test("mixed document", () => {
  expect(snap("# title\n\nbody text\n-# aside\n> quoted")).toMatchInlineSnapshot(`
    "heading 0..7 depth=1 "# title"
    syntax 0..2 "# "
    paragraph 9..18 "body text"
    subtext 19..27 "-# aside"
    syntax 19..22 "-# "
    blockquote 28..36 depth=1 "> quoted"
    syntax 28..30 "> ""
  `);
});
