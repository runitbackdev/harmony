import { expect, test } from "vitest";
import { parse } from "./parse.ts";
import { printRanges } from "./debug.ts";

function snap(src: string) {
  return printRanges(src, parse(src));
}

test("bold", () => {
  expect(snap("**bold**")).toMatchInlineSnapshot(`
    "paragraph 0..8 "**bold**"
    bold 0..8 "**bold**"
    syntax 0..2 "**"
    syntax 6..8 "**""
  `);
});

test("italic star", () => {
  expect(snap("*italic*")).toMatchInlineSnapshot(`
    "paragraph 0..8 "*italic*"
    italic 0..8 "*italic*"
    syntax 0..1 "*"
    syntax 7..8 "*""
  `);
});

test("italic underscore", () => {
  expect(snap("_italic_")).toMatchInlineSnapshot(`
    "paragraph 0..8 "_italic_"
    italic 0..8 "_italic_"
    syntax 0..1 "_"
    syntax 7..8 "_""
  `);
});

test("underline", () => {
  expect(snap("__underline__")).toMatchInlineSnapshot(`
    "paragraph 0..13 "__underline__"
    underline 0..13 "__underline__"
    syntax 0..2 "__"
    syntax 11..13 "__""
  `);
});

test("strikethrough", () => {
  expect(snap("~~strike~~")).toMatchInlineSnapshot(`
    "paragraph 0..10 "~~strike~~"
    strikethrough 0..10 "~~strike~~"
    syntax 0..2 "~~"
    syntax 8..10 "~~""
  `);
});

test("spoiler", () => {
  expect(snap("||spoiler||")).toMatchInlineSnapshot(`
    "paragraph 0..11 "||spoiler||"
    spoiler 0..11 "||spoiler||"
    syntax 0..2 "||"
    syntax 9..11 "||""
  `);
});

test("unclosed bold is literal", () => {
  expect(snap("**unclosed")).toMatchInlineSnapshot(`"paragraph 0..10 "**unclosed""`);
});

test("space-flanked star cannot open", () => {
  expect(snap("* spaced *")).toMatchInlineSnapshot(`"paragraph 0..10 "* spaced *""`);
});

test("star pairs intraword", () => {
  expect(snap("a*b*c")).toMatchInlineSnapshot(`
    "paragraph 0..5 "a*b*c"
    italic 1..4 "*b*"
    syntax 1..2 "*"
    syntax 3..4 "*""
  `);
});

test("underscore never pairs intraword", () => {
  expect(snap("a_b_c")).toMatchInlineSnapshot(`"paragraph 0..5 "a_b_c""`);
});

test("double underscore pairs intraword like discord", () => {
  expect(snap("a__b__c")).toMatchInlineSnapshot(`
    "paragraph 0..7 "a__b__c"
    underline 1..6 "__b__"
    syntax 1..3 "__"
    syntax 4..6 "__""
  `);
});

test("dunder underlines like discord", () => {
  expect(snap("call __init__ here")).toMatchInlineSnapshot(`
    "paragraph 0..18 "call __init__ here"
    underline 5..13 "__init__"
    syntax 5..7 "__"
    syntax 11..13 "__""
  `);
});

test("spoiler pairs intraword", () => {
  expect(snap("a||b||c")).toMatchInlineSnapshot(`
    "paragraph 0..7 "a||b||c"
    spoiler 1..6 "||b||"
    syntax 1..3 "||"
    syntax 4..6 "||""
  `);
});

test("strikethrough pairs intraword", () => {
  expect(snap("a~~b~~c")).toMatchInlineSnapshot(`
    "paragraph 0..7 "a~~b~~c"
    strikethrough 1..6 "~~b~~"
    syntax 1..3 "~~"
    syntax 4..6 "~~""
  `);
});

test("triple underscore is underline plus italic", () => {
  expect(snap("___x___")).toMatchInlineSnapshot(`
    "paragraph 0..7 "___x___"
    underline 0..7 "___x___"
    syntax 0..2 "__"
    italic 2..5 "_x_"
    syntax 2..3 "_"
    syntax 4..5 "_"
    syntax 5..7 "__""
  `);
});

test("triple star is bold plus italic", () => {
  expect(snap("***x***")).toMatchInlineSnapshot(`
    "paragraph 0..7 "***x***"
    bold 0..7 "***x***"
    syntax 0..2 "**"
    italic 2..5 "*x*"
    syntax 2..3 "*"
    syntax 4..5 "*"
    syntax 5..7 "**""
  `);
});

test("bold containing italic", () => {
  expect(snap("**_x_**")).toMatchInlineSnapshot(`
    "paragraph 0..7 "**_x_**"
    bold 0..7 "**_x_**"
    syntax 0..2 "**"
    italic 2..5 "_x_"
    syntax 2..3 "_"
    syntax 4..5 "_"
    syntax 5..7 "**""
  `);
});

test("nested same-char emphasis", () => {
  expect(snap("**a *b* c**")).toMatchInlineSnapshot(`
    "paragraph 0..11 "**a *b* c**"
    bold 0..11 "**a *b* c**"
    syntax 0..2 "**"
    italic 4..7 "*b*"
    syntax 4..5 "*"
    syntax 6..7 "*"
    syntax 9..11 "**""
  `);
});

test("single tilde is literal", () => {
  expect(snap("~x~")).toMatchInlineSnapshot(`"paragraph 0..3 "~x~""`);
});

test("single pipe is literal", () => {
  expect(snap("|x|")).toMatchInlineSnapshot(`"paragraph 0..3 "|x|""`);
});

test("empty spoiler is literal", () => {
  expect(snap("||||")).toMatchInlineSnapshot(`"paragraph 0..4 "||||""`);
});

test("overlong pipe run takes leftmost pair like discord", () => {
  expect(snap("|||x|||")).toMatchInlineSnapshot(`
    "paragraph 0..7 "|||x|||"
    spoiler 0..6 "|||x||"
    syntax 0..2 "||"
    syntax 4..6 "||""
  `);
});

test("overlong tilde run takes leftmost pair like discord", () => {
  expect(snap("~~~x~~~")).toMatchInlineSnapshot(`
    "paragraph 0..7 "~~~x~~~"
    strikethrough 0..6 "~~~x~~"
    syntax 0..2 "~~"
    syntax 4..6 "~~""
  `);
});

test("italic containing code", () => {
  expect(snap("*a `code` b*")).toMatchInlineSnapshot(`
    "paragraph 0..12 "*a \`code\` b*"
    italic 0..12 "*a \`code\` b*"
    syntax 0..1 "*"
    code 3..9 "\`code\`"
    syntax 3..4 "\`"
    syntax 8..9 "\`"
    syntax 11..12 "*""
  `);
});

test("code hides delimiters", () => {
  expect(snap("`a **not** b`")).toMatchInlineSnapshot(`
    "paragraph 0..13 "\`a **not** b\`"
    code 0..13 "\`a **not** b\`"
    syntax 0..1 "\`"
    syntax 12..13 "\`""
  `);
});

test("escape kills the opener", () => {
  expect(snap("\\*not* italic")).toMatchInlineSnapshot(`
    "paragraph 0..13 "\\\\*not* italic"
    syntax 0..1 "\\\\""
  `);
});

test("delimiters cannot cross a label boundary", () => {
  expect(snap("*a [b*](https://example.com)")).toMatchInlineSnapshot(`
    "paragraph 0..28 "*a [b*](https://example.com)"
    link 3..28 meta="https://example.com" "[b*](https://example.com)"
    syntax 3..4 "["
    syntax 6..28 "](https://example.com)""
  `);
});

test("label containing italic", () => {
  expect(snap("[*em*](https://example.com)")).toMatchInlineSnapshot(`
    "paragraph 0..27 "[*em*](https://example.com)"
    link 0..27 meta="https://example.com" "[*em*](https://example.com)"
    syntax 0..1 "["
    italic 1..5 "*em*"
    syntax 1..2 "*"
    syntax 4..5 "*"
    syntax 5..27 "](https://example.com)""
  `);
});

test("spoiler containing mention", () => {
  expect(snap("||ping [@u](https://matrix.to/#/@u:example.org)||")).toMatchInlineSnapshot(`
    "paragraph 0..49 "||ping [@u](https://matrix.to/#/@u:example.org)||"
    spoiler 0..49 "||ping [@u](https://matrix.to/#/@u:example.org)||"
    syntax 0..2 "||"
    mention 7..47 meta="@u:example.org" "[@u](https://matrix.to/#/@u:example.org)"
    syntax 7..8 "["
    syntax 10..47 "](https://matrix.to/#/@u:example.org)"
    syntax 47..49 "||""
  `);
});

test("spoiler across newline in one paragraph", () => {
  expect(snap("||multi\nline||")).toMatchInlineSnapshot(`
    "paragraph 0..14 "||multi\\nline||"
    spoiler 0..14 "||multi\\nline||"
    syntax 0..2 "||"
    syntax 12..14 "||""
  `);
});

test("italic inside quote line", () => {
  expect(snap("> *quoted*")).toMatchInlineSnapshot(`
    "blockquote 0..10 depth=1 "> *quoted*"
    syntax 0..2 "> "
    italic 2..10 "*quoted*"
    syntax 2..3 "*"
    syntax 9..10 "*""
  `);
});

test("delimiters cannot cross quote lines", () => {
  expect(snap("> **a\n> b**")).toMatchInlineSnapshot(`
    "blockquote 0..11 depth=1 "> **a\\n> b**"
    syntax 0..2 "> "
    syntax 6..8 "> ""
  `);
});

test("unpaired inner delimiters stay literal", () => {
  expect(snap("*a**b*")).toMatchInlineSnapshot(`
    "paragraph 0..6 "*a**b*"
    italic 0..3 "*a*"
    syntax 0..1 "*"
    syntax 2..3 "*"
    italic 3..6 "*b*"
    syntax 3..4 "*"
    syntax 5..6 "*""
  `);
});

test("overlap resolves to first closed without crossing", () => {
  expect(snap("*a _b* c_")).toMatchInlineSnapshot(`
    "paragraph 0..9 "*a _b* c_"
    italic 0..6 "*a _b*"
    syntax 0..1 "*"
    syntax 5..6 "*""
  `);
});

test("large message parses quickly", () => {
  const src = "**bold** *ital* `code` ||sp|| plain https://example.com \n\n> quote\n".repeat(150);
  const started = Date.now();
  const ranges = parse(src);
  const elapsed = Date.now() - started;

  expect(ranges.length).toBeGreaterThan(1000);
  expect(elapsed).toBeLessThan(100);
});
