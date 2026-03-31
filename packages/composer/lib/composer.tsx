import { useRef, useEffect, useCallback, useMemo } from "react";
import { placeholder } from "@codemirror/view";
import { autocompletion } from "@codemirror/autocomplete";
import {
  Compartment,
  EditorState,
  EditorView,
  baseExtensions,
  sendKeymap,
  createMentionSource,
} from "./editor";
import { emojiCompletionSource } from "./emoji-source";
import { markdownToHtml } from "./md-to-html";
import EmojiPickerButton from "./emoji-picker";
import type { MemberSummary } from "@harmony/protocol";
import "./composer.css";

type ComposerProps = {
  roomId: string;
  getMembers: (roomId: string) => Promise<MemberSummary[]>;
  onSend: (body: string, formattedBody: string) => void;
};

export function Composer({ roomId, getMembers, onSend }: ComposerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const keymapCompartment = useMemo(() => new Compartment(), []);
  const completionCompartment = useMemo(() => new Compartment(), []);

  const handleSend = useCallback(
    async (body: string) => onSend(body, (await markdownToHtml(body)) ?? body),
    [onSend],
  );

  const mentionSource = useMemo(
    () => createMentionSource(roomId, getMembers),
    [roomId, getMembers],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        extensions: [
          ...baseExtensions,
          placeholder("Send a message..."),
          keymapCompartment.of(sendKeymap({ onSend: handleSend })),
          completionCompartment.of(
            autocompletion({
              override: [emojiCompletionSource, mentionSource],
              icons: false,
            }),
          ),
          EditorView.contentAttributes.of({
            role: "textbox",
            "aria-multiline": "true",
            "aria-label": "Message composer",
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [roomId]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: keymapCompartment.reconfigure(sendKeymap({ onSend: handleSend })),
    });
  }, [handleSend, keymapCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: completionCompartment.reconfigure(
        autocompletion({
          override: [emojiCompletionSource, mentionSource],
          icons: false,
        }),
      ),
    });
  }, [mentionSource, completionCompartment]);

  const handleEmojiSelect = useCallback((emoji: { native?: string }) => {
    const view = viewRef.current;
    if (!view || !emoji.native) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({ changes: { from, to, insert: emoji.native } });
    view.focus();
  }, []);

  return (
    <div data-scope="composer" data-part="root">
      <div ref={containerRef} className="cm-composer flex-1 min-w-0" />
      <div data-scope="composer" data-part="toolbar">
        <EmojiPickerButton onSelect={handleEmojiSelect} />
      </div>
    </div>
  );
}
