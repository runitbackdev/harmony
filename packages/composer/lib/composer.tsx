import { useRef, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from "react";
import type { Ref } from "react";
import { useAnimationCue } from "@harmony/primitives";
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

export type ComposerHandle = {
  focus: () => void;
};

type ComposerProps = {
  roomId: string;
  getMembers: (roomId: string) => Promise<MemberSummary[]>;
  onSend: (body: string, formattedBody: string) => void;
};

export const Composer = forwardRef(function Composer(
  { roomId, getMembers, onSend }: ComposerProps,
  ref: Ref<ComposerHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const keymapCompartment = useMemo(() => new Compartment(), []);
  const completionCompartment = useMemo(() => new Compartment(), []);
  const [sending, fireSend] = useAnimationCue(rootRef);

  const handleSend = useCallback(
    async (body: string) => {
      fireSend();
      onSend(body, (await markdownToHtml(body)) ?? body);
    },
    [onSend, fireSend],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
  }));

  return (
    <div
      ref={rootRef}
      data-scope="composer"
      data-part="root"
      data-state={sending ? "sending" : undefined}
    >
      <div ref={containerRef} className="cm-composer flex-1 min-w-0" />
      <div data-scope="composer" data-part="toolbar">
        <EmojiPickerButton onSelect={handleEmojiSelect} />
      </div>
    </div>
  );
});
