import { expect, test } from "vitest";
import { parse } from "./parse.ts";
import { toTree } from "./tree.ts";
import { printTree } from "./debug.ts";
import type { Range } from "./types.ts";

function snap(src: string) {
  return printTree(toTree(src, parse(src)));
}

test("empty string", () => {
  expect(snap("")).toMatchInlineSnapshot(`"(empty)"`);
});

test("plain paragraph", () => {
  expect(snap("hello")).toMatchInlineSnapshot(`
    "paragraph
      text "hello""
  `);
});

test("markers are stripped", () => {
  expect(snap("**_x_**")).toMatchInlineSnapshot(`
    "paragraph
      bold
        italic
          text "x""
  `);
});

test("paragraph gap is dropped, inner newline kept", () => {
  expect(snap("one\ntwo\n\nthree")).toMatchInlineSnapshot(`
    "paragraph
      text "one\\ntwo"
    paragraph
      text "three""
  `);
});

test("mention inside spoiler", () => {
  expect(snap("||ping [@u](https://matrix.to/#/@u:example.org)||")).toMatchInlineSnapshot(`
    "paragraph
      spoiler
        text "ping "
        mention meta="@u:example.org"
          text "@u""
  `);
});

test("codeblock keeps raw content", () => {
  expect(snap("```ts\nconst x = 1\n```")).toMatchInlineSnapshot(`
    "codeblock meta="ts"
      text "\\nconst x = 1\\n""
  `);
});

test("blockquote strips line markers", () => {
  expect(snap("> first\n> *second*")).toMatchInlineSnapshot(`
    "blockquote depth=1
      text "first\\n"
      italic
        text "second""
  `);
});

test("mixed document", () => {
  expect(snap("# title\n\nbody `code`\n-# aside")).toMatchInlineSnapshot(`
    "heading depth=1
      text "title"
    paragraph
      text "body "
      code
        text "code"
    subtext
      text "aside""
  `);
});

test("escape strips the backslash", () => {
  expect(snap("\\*literal\\*")).toMatchInlineSnapshot(`
    "paragraph
      text "*literal"
      text "*""
  `);
});

const CORPUS = [
  "",
  "hello world",
  "one\ntwo\n\nthree",
  "# title\n\nbody text\n-# aside\n> quoted",
  "**bold** *ital* _em_ __u__ ~~s~~ ||sp||",
  "***x*** ___y___ **_z_**",
  "*a [b*](https://example.com) `code` \\* https://example.com.",
  "||ping [@u](https://matrix.to/#/@u:example.org)||\n> *quoted* `q`",
  "```ts\nconst x = 1\n```\ntext\n```\nunclosed",
  "|||x||| ~~~y~~~ |||| `` `a` ``",
  "> **a\n> b**\n-# small https://example.com\n#### not a heading",
  "*a _b* c_ *a**b* a__b__c call __init__ here",
];

function assertInvariants(src: string, ranges: Range[]) {
  for (const [i, range] of ranges.entries()) {
    expect(range.start).toBeGreaterThanOrEqual(0);
    expect(range.end).toBeGreaterThan(range.start);
    expect(range.end).toBeLessThanOrEqual(src.length);

    const prev = ranges[i - 1];
    if (prev) {
      expect(
        prev.start < range.start || (prev.start === range.start && prev.end >= range.end),
      ).toBe(true);
    }

    for (const other of ranges.slice(i + 1)) {
      const disjoint = other.start >= range.end;
      const contained = other.start >= range.start && other.end <= range.end;
      expect(disjoint || contained).toBe(true);
    }
  }
}

test.each(CORPUS)("invariants hold for %j", (src) => {
  assertInvariants(src, parse(src));
});
