import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  useRef,
  type ClipboardEvent,
  type Ref,
} from "react";
import { createEditor, Editor, Transforms } from "slate";
import { Editable, ReactEditor, Slate, withReact } from "slate-react";
import { withHistory } from "slate-history";
import { Reply, X } from "lucide-react";
import { emitMatrixHtml } from "@harmony/markdown";
import type { MemberData, ReplyTarget } from "@harmony/harmony-bindings-web";
import { useAnimationCue } from "@/primitives";
import EmojiPickerButton from "@/composer/emoji-picker";
import { AttachmentChip, AttachmentPickerButton } from "@/composer/attachments";
import { withHarmony } from "./with-harmony";
import { useDecorate } from "./use-decorate";
import { createKeyDownHandler } from "./keymap";
import { renderElement, renderLeaf } from "./render";
import { serialize, deserialize } from "./serialize";
import {
  emojiSource,
  mentionSource,
  TypeaheadPopover,
  useTypeahead,
  withShortcodeReplace,
} from "./typeahead";
import "@/composer/composer.css";
import "@/composer/attachments.css";

export type ComposerHandle = {
  focus: () => void;
  addFiles: (files: File[]) => void;
};

type ComposerProps = {
  roomId: string;
  getMembers: (roomId: string) => Promise<MemberData[]>;
  onSend: (body: string, formattedBody: string, files: File[]) => void;
  replyTarget?: ReplyTarget | null;
  onCancelReply?: () => void;
  ref?: Ref<ComposerHandle>;
};

const MAX_ATTACHMENTS = 10;

export function makeEditor() {
  return withShortcodeReplace(withHarmony(withReact(withHistory(createEditor()))));
}

export function resetEditor(editor: Editor) {
  Transforms.delete(editor, {
    at: { anchor: Editor.start(editor, []), focus: Editor.end(editor, []) },
  });
}

export function extractFiles(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file) => file !== null);
  return files;
}

export function Composer({
  roomId,
  getMembers,
  onSend,
  replyTarget,
  onCancelReply,
  ref,
}: ComposerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [sending, fireSend] = useAnimationCue(rootRef);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [editor] = useState(makeEditor);
  const decorate = useDecorate(editor);
  const sources = useMemo(
    () => [mentionSource(() => getMembers(roomId)), emojiSource()],
    [roomId, getMembers],
  );
  const typeahead = useTypeahead(editor, sources);

  const addFiles = useCallback((files: File[]) => {
    setPendingFiles((prev) => [...prev, ...files].slice(0, MAX_ATTACHMENTS));
  }, []);

  const addFile = useCallback((file: File) => addFiles([file]), [addFiles]);

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(() => {
    const body = serialize(editor.children).trim();
    if (!body && pendingFiles.length === 0) return;

    fireSend();
    onSend(body, emitMatrixHtml(body) ?? body, pendingFiles);
    setPendingFiles([]);
    resetEditor(editor);
  }, [editor, onSend, fireSend, pendingFiles]);

  const onKeyDown = createKeyDownHandler({
    editor,
    onSubmit: handleSubmit,
    isTypeaheadOpen: () => typeahead.isOpen,
  });

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const files = extractFiles(event);
      if (files.length === 0) return;
      event.preventDefault();
      addFiles(files);
    },
    [addFiles],
  );

  const handleEmojiSelect = useCallback(
    (emoji: { native?: string }) => {
      if (!emoji.native) return;
      editor.insertText(emoji.native);
      ReactEditor.focus(editor);
    },
    [editor],
  );

  useEffect(() => {
    ReactEditor.focus(editor);
  }, [editor]);

  useImperativeHandle(ref, () => ({ focus: () => ReactEditor.focus(editor), addFiles }), [
    editor,
    addFiles,
  ]);

  return (
    <div className="flex flex-col gap-1.5">
      {replyTarget && (
        <ReplyBanner replyTarget={replyTarget} onCancel={onCancelReply ?? (() => {})} />
      )}
      {pendingFiles.length > 0 && (
        <div data-scope="composer" data-part="attachments">
          {pendingFiles.map((file, i) => (
            <AttachmentChip key={i} file={file} onRemove={() => removeFile(i)} />
          ))}
        </div>
      )}
      <div
        ref={rootRef}
        data-scope="composer"
        data-part="root"
        data-state={sending ? "sending" : undefined}
      >
        <AttachmentPickerButton onAttachment={addFile} />
        <Slate
          key={roomId}
          editor={editor}
          initialValue={deserialize("")}
          onChange={typeahead.onChange}
        >
          <Editable
            decorate={decorate}
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            onKeyDown={(event) => {
              typeahead.onKeyDown(event);
              if (!event.defaultPrevented) onKeyDown(event);
            }}
            onPaste={onPaste}
            placeholder="Send a message..."
            aria-label="Message composer"
            className="flex-1 min-w-0 outline-none"
          />
          <TypeaheadPopover editor={editor} typeahead={typeahead} />
        </Slate>
        <div data-scope="composer" data-part="toolbar">
          <EmojiPickerButton onSelect={handleEmojiSelect} />
        </div>
      </div>
    </div>
  );
}

function ReplyBanner({
  replyTarget,
  onCancel,
}: {
  replyTarget: ReplyTarget;
  onCancel: () => void;
}) {
  const name = replyTarget.senderName ?? replyTarget.sender ?? "unknown";
  const snippet = replyTarget.redacted
    ? "[deleted message]"
    : (replyTarget.body ?? "[unavailable]");

  return (
    <div
      data-scope="composer"
      data-part="reply-banner"
      className="flex items-center gap-2 rounded-md border-l-2 border-accent bg-soft px-3 py-1.5 text-data"
    >
      <Reply size={14} className="shrink-0 text-accent" />
      <div className="flex-1 min-w-0 truncate">
        <span className="text-sub">Replying to </span>
        <span className="font-medium text-ink">{name}</span>
        <span className="text-sub">: {snippet}</span>
      </div>
      <button
        type="button"
        aria-label="Cancel reply"
        onClick={onCancel}
        className="rounded p-1 text-sub hover:bg-soft hover:text-ink transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
