import type { Editor } from "slate";

export function withHarmony(editor: Editor) {
  const { isInline, isVoid } = editor;

  editor.isInline = (element) =>
    element.type === "mention" || element.type === "emoji" || isInline(element);

  editor.isVoid = (element) =>
    element.type === "mention" || element.type === "emoji" || isVoid(element);

  editor.insertData = (data) => {
    const text = data.getData("text/plain");
    if (!text) return;

    text.split(/\r?\n/).forEach((line, i) => {
      if (i > 0) editor.insertBreak();
      if (line) editor.insertText(line);
    });
  };

  return editor;
}
