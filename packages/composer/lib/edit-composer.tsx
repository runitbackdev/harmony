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

  const handleEdit = useCallback(
    (body: string) => onEdit(target, body, markdownToHtml(body) ?? body),
    [onEdit, target],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: markdownSource ?? htmlToMarkdown(content),
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
  }, [content]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: keymapCompartment.reconfigure(editKeymap({ onEdit: handleEdit, onCancel })),
    });
  }, [handleEdit, onCancel, keymapCompartment]);

  return <div ref={containerRef} className="cm-composer" />;
}
