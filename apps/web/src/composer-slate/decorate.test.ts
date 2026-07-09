import { expect, test } from "vitest";
import { createEditor, type Descendant } from "slate";
import { buildDoc, pointOffset, VOID_CHAR } from "./doc";
import { decorations } from "./use-decorate";
import { classifyCaret } from "./keymap";
import { withHarmony } from "./with-harmony";

function paragraph(...children: Descendant[]) {
  return { type: "paragraph" as const, children } as Descendant;
}

function mention() {
  return {
    type: "mention" as const,
    name: "u",
    userId: "@u:x.org",
    children: [{ text: "" }] as [{ text: "" }],
  };
}

test("buildDoc joins blocks with newlines and substitutes voids", () => {
  const doc = buildDoc([
    paragraph({ text: "one" }),
    paragraph({ text: "" }, mention(), { text: " two" }),
  ]);

  expect(doc.text).toBe(`one\n${VOID_CHAR} two`);
  expect(doc.segments.get("0.0")).toEqual({ start: 0, len: 3 });
  expect(doc.segments.get("1.0")).toEqual({ start: 4, len: 0 });
  expect(doc.segments.get("1.2")).toEqual({ start: 5, len: 4 });
});

test("pointOffset maps points through voids", () => {
  const doc = buildDoc([paragraph({ text: "" }, mention(), { text: "abc" })]);
  expect(pointOffset(doc, { path: [0, 2], offset: 2 })).toBe(3);
});

test("decoration spanning a void clips per text node", () => {
  const doc = buildDoc([paragraph({ text: "**a" }, mention(), { text: "b**" })]);

  expect(decorations(doc, [0, 0])).toEqual([
    { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 3 }, bold: true },
    { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 2 }, marker: true },
  ]);
  expect(decorations(doc, [0, 2])).toEqual([
    { anchor: { path: [0, 2], offset: 0 }, focus: { path: [0, 2], offset: 3 }, bold: true },
    { anchor: { path: [0, 2], offset: 1 }, focus: { path: [0, 2], offset: 3 }, marker: true },
  ]);
});

test("heading decoration carries depth", () => {
  const doc = buildDoc([paragraph({ text: "## hey" })]);
  expect(decorations(doc, [0, 0])).toEqual([
    { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 6 }, heading: 2 },
    { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 3 }, marker: true },
  ]);
});

test("multi-block fence decorates middle lines as codeblock", () => {
  const doc = buildDoc([
    paragraph({ text: "```ts" }),
    paragraph({ text: "const x = 1" }),
    paragraph({ text: "```" }),
  ]);
  expect(decorations(doc, [1, 0])).toEqual([
    { anchor: { path: [1, 0], offset: 0 }, focus: { path: [1, 0], offset: 11 }, codeblock: true },
  ]);
});

function editorWith(children: Descendant[], anchor: { path: number[]; offset: number }) {
  const editor = withHarmony(createEditor());
  editor.children = children;
  editor.selection = { anchor, focus: anchor };
  return editor;
}

test("caret on unclosed opening fence classifies open-fence", () => {
  const editor = editorWith([paragraph({ text: "```ts" })], { path: [0, 0], offset: 5 });
  expect(classifyCaret(editor)).toBe("open-fence");
});

test("caret inside closed fence classifies in-fence", () => {
  const editor = editorWith(
    [paragraph({ text: "```" }), paragraph({ text: "code" }), paragraph({ text: "```" })],
    { path: [1, 0], offset: 4 },
  );
  expect(classifyCaret(editor)).toBe("in-fence");
});

test("caret after closed fence classifies outside", () => {
  const editor = editorWith(
    [
      paragraph({ text: "```" }),
      paragraph({ text: "x" }),
      paragraph({ text: "```" }),
      paragraph({ text: "after" }),
    ],
    { path: [3, 0], offset: 5 },
  );
  expect(classifyCaret(editor)).toBe("outside");
});

test("caret in plain text classifies outside", () => {
  const editor = editorWith([paragraph({ text: "hello" })], { path: [0, 0], offset: 3 });
  expect(classifyCaret(editor)).toBe("outside");
});
