import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { baseExtensions, editorAttributes } from "./extensions";
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
  const editor = useEditor({
    content,
    extensions: [...baseExtensions, Placeholder.configure({ placeholder: "Editing message..." })],
    editorProps: {
      attributes: { ...editorAttributes, "aria-label": "Edit message" },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape") {
          onCancel();
          return true;
        }

        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          const body = editor?.getText().trim();
          if (!body) return true;
          onEdit(target, body, editor!.getHTML());
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor }) => {
      editor.commands.focus("end");
    },
  });

  return <EditorContent editor={editor} />;
}
