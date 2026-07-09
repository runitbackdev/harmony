import type { KeyboardEvent } from "react";
import { Editor, Path, Range, Transforms } from "slate";
import { buildDoc, pointOffset } from "./doc";

interface KeymapOptions {
  editor: Editor;
  onSubmit: () => void;
  onCancel?: () => void;
  isTypeaheadOpen?: () => boolean;
}

export function createKeyDownHandler({
  editor,
  onSubmit,
  onCancel,
  isTypeaheadOpen,
}: KeymapOptions) {
  return (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      const marker = markerFor(event);
      if (marker) {
        event.preventDefault();
        wrapSelection(editor, marker);
        return;
      }
    }

    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key === "Tab" && classifyCaret(editor) !== "outside") {
      event.preventDefault();
      editor.insertText("  ");
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      if (isTypeaheadOpen?.()) return;
      event.preventDefault();
      handleEnter(editor, onSubmit);
    }
  };
}

function markerFor(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  if (event.shiftKey) {
    if (key === "x") return "~~";
    if (key === "s") return "||";
    return undefined;
  }
  if (key === "b") return "**";
  if (key === "i") return "*";
  if (key === "u") return "__";
  if (key === "e") return "`";
  return undefined;
}

function wrapSelection(editor: Editor, marker: string) {
  const { selection } = editor;
  if (!selection) return;

  if (Range.isCollapsed(selection)) {
    editor.insertText(marker + marker);
    Transforms.move(editor, { distance: marker.length, reverse: true });
    return;
  }

  const ref = Editor.rangeRef(editor, selection, { affinity: "inward" });
  const [start, end] = Range.edges(selection);
  Transforms.insertText(editor, marker, { at: end });
  Transforms.insertText(editor, marker, { at: start });
  if (ref.current) Transforms.select(editor, ref.current);
  ref.unref();
}

function handleEnter(editor: Editor, onSubmit: () => void) {
  switch (classifyCaret(editor)) {
    case "open-fence": {
      editor.insertBreak();
      if (editor.selection) {
        const block = [editor.selection.anchor.path[0]!];
        Transforms.insertNodes(
          editor,
          { type: "paragraph", children: [{ text: "```" }] },
          { at: Path.next(block) },
        );
      }
      return;
    }
    case "in-fence":
      editor.insertBreak();
      return;
    case "outside":
      onSubmit();
  }
}

export function classifyCaret(editor: Editor) {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return "outside";

  const doc = buildDoc(editor.children);
  const offset = pointOffset(doc, selection.anchor);
  if (offset === undefined) return "outside";

  for (const range of doc.ranges) {
    if (range.type !== "codeblock") continue;

    const closed = doc.ranges.some(
      (r) => r.type === "syntax" && r.end === range.end && r.start > range.start,
    );
    const inside =
      offset >= range.start && (offset < range.end || (!closed && offset === range.end));
    if (!inside) continue;

    const lineEnd = doc.text.indexOf("\n", range.start);
    const onOpeningLine = lineEnd === -1 || offset <= lineEnd;
    return onOpeningLine && !closed ? "open-fence" : "in-fence";
  }

  return "outside";
}
