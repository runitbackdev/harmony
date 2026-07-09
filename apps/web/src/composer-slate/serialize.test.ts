import { expect, test } from "vitest";
import { createEditor, Editor } from "slate";
import { withHarmony } from "./with-harmony";
import { deserialize, serialize } from "./serialize";

const MENTION_MSG = "hey [@Ethan](https://matrix.to/#/@ethan:example.org) look";

test("round-trips plain text", () => {
  expect(serialize(deserialize("hello world"))).toBe("hello world");
});

test("round-trips multi-line text", () => {
  expect(serialize(deserialize("one\ntwo\n\nfour"))).toBe("one\ntwo\n\nfour");
});

test("round-trips mentions", () => {
  expect(serialize(deserialize(MENTION_MSG))).toBe(MENTION_MSG);
});

test("empty string is one empty paragraph", () => {
  expect(deserialize("")).toEqual([{ type: "paragraph", children: [{ text: "" }] }]);
});

test("deserialize extracts mention elements", () => {
  expect(deserialize(MENTION_MSG)).toEqual([
    {
      type: "paragraph",
      children: [
        { text: "hey " },
        {
          type: "mention",
          name: "Ethan",
          userId: "@ethan:example.org",
          children: [{ text: "" }],
        },
        { text: " look" },
      ],
    },
  ]);
});

test("mentions at line edges get text padding", () => {
  const [line] = deserialize("[@a](https://matrix.to/#/@a:x.org)");
  expect(line).toEqual({
    type: "paragraph",
    children: [
      { text: "" },
      { type: "mention", name: "a", userId: "@a:x.org", children: [{ text: "" }] },
      { text: "" },
    ],
  });
});

test("adjacent mentions get text between", () => {
  const [line] = deserialize(
    "[@a](https://matrix.to/#/@a:x.org)[@b](https://matrix.to/#/@b:x.org)",
  );
  const children = "children" in line! ? line.children : [];
  expect(children).toHaveLength(5);
  expect(children[2]).toEqual({ text: "" });
});

test("emoji serializes unicode or shortcode", () => {
  const doc = [
    {
      type: "paragraph" as const,
      children: [
        { text: "" },
        {
          type: "emoji" as const,
          shortcode: "wave",
          unicode: "👋",
          children: [{ text: "" }] as [{ text: "" }],
        },
        { text: " " },
        { type: "emoji" as const, shortcode: "custom", children: [{ text: "" }] as [{ text: "" }] },
        { text: "" },
      ],
    },
  ];
  expect(serialize(doc)).toBe("👋 :custom:");
});

test("deserialized documents are already slate-normal", () => {
  const editor = withHarmony(createEditor());
  editor.children = deserialize(MENTION_MSG + "\n[@a](https://matrix.to/#/@a:x.org)");
  const before = JSON.stringify(editor.children);
  Editor.normalize(editor, { force: true });
  expect(JSON.stringify(editor.children)).toBe(before);
});
