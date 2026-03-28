import { useMemo, useCallback } from "react";
import { Extension } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { baseExtensions, editorAttributes } from "./extensions";
import { createMentionExtension } from "./mention";
import { createEmojiExtension } from "./emoji";
import { isSuggestionActive } from "./suggestion-active";
import EmojiPickerButton from "./emoji-picker";
import type { MemberSummary } from "@harmony/protocol";
import "./composer.css";

type ComposerProps = {
  roomId: string;
  getMembers: (roomId: string) => Promise<MemberSummary[]>;
  onSend: (body: string, formattedBody: string) => void;
};

export function Composer({ roomId, getMembers, onSend }: ComposerProps) {
  const mentionExtension = useMemo(
    () => createMentionExtension(roomId, getMembers),
    [roomId, getMembers],
  );

  const emojiExtension = useMemo(() => createEmojiExtension(), []);

  const onSendRef = useCallback(onSend, [onSend]);

  const sendExtension = useMemo(
    () =>
      Extension.create({
        name: "sendMessage",
        addKeyboardShortcuts() {
          return {
            Enter: ({ editor }) => {
              if (isSuggestionActive(editor.state)) return false;
              const body = editor.getText().trim();
              if (!body) return true;
              onSendRef(body, editor.getHTML());
              editor.commands.clearContent();
              return true;
            },
          };
        },
      }),
    [onSendRef],
  );

  const editor = useEditor({
    extensions: [
      ...baseExtensions,
      Placeholder.configure({ placeholder: "Send a message..." }),
      mentionExtension,
      emojiExtension,
      sendExtension,
    ],
    editorProps: {
      attributes: { ...editorAttributes, "aria-label": "Message composer" },
    },
    autofocus: true,
  });

  const handleEmojiSelect = useCallback(
    (emoji: { native?: string }) => {
      if (!editor || !emoji.native) return;
      editor.chain().focus().insertContent(emoji.native).run();
    },
    [editor],
  );

  return (
    <div data-scope="composer" data-part="root">
      <EditorContent editor={editor} className="flex-1 min-w-0" />
      <div data-scope="composer" data-part="toolbar">
        <EmojiPickerButton onSelect={handleEmojiSelect} />
      </div>
    </div>
  );
}
