import { useCallback, useEffect, useMemo, useState } from "react";
import { Editor, Transforms } from "slate";
import { Editable, ReactEditor, Slate } from "slate-react";
import { emitMatrixHtml } from "@harmony/markdown";
import { htmlToMarkdown } from "@/composer/html-to-md";
import { makeEditor } from "./composer";
import { useDecorate } from "./use-decorate";
import { createKeyDownHandler } from "./keymap";
import { renderElement, renderLeaf } from "./render";
import { serialize, deserialize } from "./serialize";
import { emojiSource, TypeaheadPopover, useTypeahead } from "./typeahead";
import "@/composer/composer.css";

export type EditTarget = {
  eventId?: string;
  transactionId?: string;
};

type EditComposerProps = {
  target: EditTarget;
  content: string;
  markdownSource?: string;
  onEdit: (target: EditTarget, body: string, formattedBody: string) => void;
  onCancel: () => void;
};

export function EditComposer({
  target,
  content,
  markdownSource,
  onEdit,
  onCancel,
}: EditComposerProps) {
  const original = useMemo(
    () => markdownSource ?? htmlToMarkdown(content),
    [markdownSource, content],
  );
  const [editor] = useState(makeEditor);
  const decorate = useDecorate(editor);
  const sources = useMemo(() => [emojiSource()], []);
  const typeahead = useTypeahead(editor, sources);

  const handleSave = useCallback(() => {
    const body = serialize(editor.children).trim();
    if (body === original || !body) return onCancel();
    onEdit(target, body, emitMatrixHtml(body) ?? body);
  }, [editor, original, onEdit, onCancel, target]);

  const onKeyDown = createKeyDownHandler({
    editor,
    onSubmit: handleSave,
    onCancel,
    isTypeaheadOpen: () => typeahead.isOpen,
  });

  useEffect(() => {
    Transforms.select(editor, Editor.end(editor, []));
    ReactEditor.focus(editor);
  }, [editor]);

  return (
    <div>
      <div data-scope="composer" data-part="root">
        <Slate editor={editor} initialValue={deserialize(original)} onChange={typeahead.onChange}>
          <Editable
            decorate={decorate}
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            onKeyDown={(event) => {
              typeahead.onKeyDown(event);
              if (!event.defaultPrevented) onKeyDown(event);
            }}
            placeholder="Editing message..."
            aria-label="Edit message"
            className="flex-1 min-w-0 outline-none"
          />
          <TypeaheadPopover editor={editor} typeahead={typeahead} />
        </Slate>
      </div>
      <span className="text-data text-sub mt-1 block">
        press escape to{" "}
        <button
          type="button"
          className="bg-transparent border-none p-0 text-data text-link cursor-pointer hover:underline"
          onClick={onCancel}
        >
          cancel
        </button>{" "}
        · enter to{" "}
        <button
          type="button"
          className="bg-transparent border-none p-0 text-data text-link cursor-pointer hover:underline"
          onClick={handleSave}
        >
          save
        </button>
      </span>
    </div>
  );
}
