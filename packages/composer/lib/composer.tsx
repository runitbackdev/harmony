import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { baseExtensions, editorAttributes } from "./extensions";
import "./composer.css";

type ComposerProps = {
  onSend: (body: string, formattedBody: string) => void;
};

export function Composer({ onSend }: ComposerProps) {
  const editor = useEditor({
    extensions: [...baseExtensions, Placeholder.configure({ placeholder: "Send a message..." })],
    editorProps: {
      attributes: { ...editorAttributes, "aria-label": "Message composer" },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          const body = editor?.getText().trim();
          if (!body) return true;
          onSend(body, editor!.getHTML());
          editor?.commands.clearContent();
          return true;
        }
        return false;
      },
    },
  });

  return <EditorContent editor={editor} />;
}
