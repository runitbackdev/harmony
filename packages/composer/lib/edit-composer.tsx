import { useRef, useEffect, useCallback, useMemo } from "react";
import { placeholder } from "@codemirror/view";
import { autocompletion } from "@codemirror/autocomplete";
import { Compartment, EditorState, EditorView, baseExtensions, editKeymap } from "./editor";
import { emojiCompletionSource } from "./emoji-source";
import { markdownToHtml } from "./md-to-html";
import { htmlToMarkdown } from "./html-to-md";
import "./composer.css";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const keymapCompartment = useMemo(() => new Compartment(), []);
  const originalBody = useRef(markdownSource ?? htmlToMarkdown(content));

  const handleEdit = useCallback(
    async (body: string) => {
      if (body === originalBody.current) return onCancel();
      onEdit(target, body, (await markdownToHtml(body)) ?? body);
    },
    [onEdit, onCancel, target],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const initialDoc = markdownSource ?? htmlToMarkdown(content);
    const view = new EditorView({
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          ...baseExtensions,
          placeholder("Editing message..."),
          keymapCompartment.of(editKeymap({ onEdit: handleEdit, onCancel })),
          autocompletion({
            override: [emojiCompletionSource],
            icons: false,
          }),
          EditorView.contentAttributes.of({
            role: "textbox",
            "aria-multiline": "true",
            "aria-label": "Edit message",
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: keymapCompartment.reconfigure(editKeymap({ onEdit: handleEdit, onCancel })),
    });
  }, [handleEdit, onCancel, keymapCompartment]);

  return (
    <div>
      <div data-scope="composer" data-part="root">
        <div ref={containerRef} className="cm-composer flex-1 min-w-0" />
      </div>
      <span className="text-xs text-surface-500 mt-1 block">
        press escape to{" "}
        <button
          type="button"
          className="bg-transparent border-none p-0 text-xs text-primary-500 cursor-pointer hover:underline"
          onClick={onCancel}
        >
          cancel
        </button>{" "}
        · enter to{" "}
        <button
          type="button"
          className="bg-transparent border-none p-0 text-xs text-primary-500 cursor-pointer hover:underline"
          onClick={() => {
            const body = viewRef.current?.state.doc.toString().trim();
            if (body) void handleEdit(body);
          }}
        >
          save
        </button>
      </span>
    </div>
  );
}
