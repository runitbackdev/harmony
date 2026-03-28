import { useMemo, useCallback } from "react";
import { Extension } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { baseExtensions, editorAttributes } from "./extensions";
import { createEmojiExtension } from "./emoji";
import { isSuggestionActive } from "./suggestion-active";
import "./composer.css";

export type EditTarget = {
  eventId?: string;
  transactionId?: string;
};

type EditComposerProps = {
  target: EditTarget;
  content: string;
  onEdit: (target: EditTarget, body: string, formattedBody: string) => void;
  onCancel: () => void;
};

export function EditComposer({ target, content, onEdit, onCancel }: EditComposerProps) {
  const emojiExtension = useMemo(() => createEmojiExtension(), []);

  const onEditRef = useCallback(onEdit, [onEdit]);
  const onCancelRef = useCallback(onCancel, [onCancel]);

  const editKeysExtension = useMemo(
    () =>
      Extension.create({
        name: "editKeys",
        addKeyboardShortcuts() {
          return {
            Escape: () => {
              onCancelRef();
              return true;
            },
            Enter: ({ editor }) => {
              if (isSuggestionActive(editor.state)) return false;
              const body = editor.getText().trim();
              if (!body) return true;
              onEditRef(target, body, editor.getHTML());
              return true;
            },
          };
        },
      }),
    [target, onEditRef, onCancelRef],
  );

  const editor = useEditor({
    content,
    extensions: [
      ...baseExtensions,
      Placeholder.configure({ placeholder: "Editing message..." }),
      emojiExtension,
      editKeysExtension,
    ],
    editorProps: {
      attributes: { ...editorAttributes, "aria-label": "Edit message" },
    },
    onCreate: ({ editor }) => {
      editor.commands.focus("end");
    },
  });

  return <EditorContent editor={editor} />;
}
