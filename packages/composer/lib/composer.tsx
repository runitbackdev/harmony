import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { Spoiler } from "./spoiler";
import "./composer.css";

type ComposerProps = {
  onSend: (body: string, formattedBody: string) => void;
};

export function Composer({ onSend }: ComposerProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Underline,
      Placeholder.configure({ placeholder: "Send a message..." }),
      Typography,
      Spoiler,
    ],
    editorProps: {
      attributes: {
        class: "composer rich-text",
        "aria-label": "Message composer",
      },
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
