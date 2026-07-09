import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Editor, Node, Range, Text, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import type { MemberData } from "@harmony/harmony-bindings-web";
import { searchEmoji, findByShortcode } from "@/composer/emoji";
import { cn } from "@/ui/utils";

export interface TypeaheadOption {
  key: string;
  label: string;
  detail?: string;
  apply: (editor: Editor, target: Range) => void;
}

export interface TypeaheadSource {
  pattern: RegExp;
  load: (query: string) => Promise<TypeaheadOption[]>;
}

export function mentionSource(getMembers: () => Promise<MemberData[]>): TypeaheadSource {
  return {
    pattern: /@(\w*)$/,
    load: async (query) => {
      const members = await getMembers();
      return members
        .filter((m) => {
          if (!query) return true;
          const name = (m.displayName ?? m.userId).toLowerCase();
          return name.includes(query) || m.userId.toLowerCase().includes(query);
        })
        .slice(0, 10)
        .map((m) => {
          const name = m.displayName ?? m.userId;
          return {
            key: m.userId,
            label: `@${name}`,
            detail: m.userId,
            apply: (editor: Editor, target: Range) => {
              Transforms.select(editor, target);
              Transforms.insertNodes(editor, {
                type: "mention",
                userId: m.userId,
                name,
                children: [{ text: "" }],
              });
              Transforms.move(editor);
              editor.insertText(" ");
            },
          };
        });
    },
  };
}

export function emojiSource(): TypeaheadSource {
  return {
    pattern: /:([a-zA-Z0-9_+-]+)$/,
    load: async (query) => {
      const results = await searchEmoji(query);
      return results.map((e) => ({
        key: e.shortcode,
        label: `${e.native} :${e.shortcode}:`,
        apply: (editor: Editor, target: Range) => {
          Transforms.select(editor, target);
          editor.insertText(e.native);
        },
      }));
    },
  };
}

interface TypeaheadState {
  target: Range;
  source: TypeaheadSource;
  query: string;
}

export function useTypeahead(editor: Editor, sources: TypeaheadSource[]) {
  const [state, setState] = useState<TypeaheadState>();
  const [options, setOptions] = useState<TypeaheadOption[]>([]);
  const [active, setActive] = useState(0);

  const source = state?.source;
  const query = state?.query;

  useEffect(() => {
    if (!source || query === undefined) {
      setOptions([]);
      return;
    }

    let live = true;
    void source.load(query.toLowerCase()).then((loaded) => {
      if (!live) return;
      setOptions(loaded);
      setActive(0);
    });
    return () => {
      live = false;
    };
  }, [source, query]);

  const commit = useCallback(
    (option: TypeaheadOption) => {
      if (!state) return;
      option.apply(editor, state.target);
      setState(undefined);
      ReactEditor.focus(editor);
    },
    [editor, state],
  );

  const onChange = useCallback(() => {
    setState(detectTrigger(editor, sources));
  }, [editor, sources]);

  const isOpen = state !== undefined && options.length > 0;

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!isOpen) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : options.length - 1;
        setActive((current) => (current + step) % options.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        commit(options[active]!);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setState(undefined);
      }
    },
    [isOpen, options, active, commit],
  );

  return { state, options, active, isOpen, onChange, onKeyDown, commit };
}

function detectTrigger(editor: Editor, sources: TypeaheadSource[]): TypeaheadState | undefined {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection) || ReactEditor.isComposing(editor)) {
    return undefined;
  }

  const node = Node.get(editor, selection.anchor.path);
  if (!Text.isText(node)) return undefined;

  const before = node.text.slice(0, selection.anchor.offset);
  for (const source of sources) {
    const match = source.pattern.exec(before);
    if (!match) continue;
    return {
      source,
      query: match[1] ?? "",
      target: {
        anchor: { path: selection.anchor.path, offset: selection.anchor.offset - match[0].length },
        focus: selection.anchor,
      },
    };
  }
  return undefined;
}

interface PopoverProps {
  editor: Editor;
  typeahead: ReturnType<typeof useTypeahead>;
}

export function TypeaheadPopover({ editor, typeahead }: PopoverProps) {
  const { state, options, active, isOpen, commit } = typeahead;
  const [rect, setRect] = useState<DOMRect>();

  useEffect(() => {
    if (!state) {
      setRect(undefined);
      return;
    }
    try {
      setRect(ReactEditor.toDOMRange(editor, state.target).getBoundingClientRect());
    } catch {
      setRect(undefined);
    }
  }, [editor, state]);

  if (!isOpen || !rect) return null;

  return createPortal(
    <div
      className="fixed z-50 w-72 -translate-y-full rounded border border-line bg-surface py-1 shadow-lg"
      style={{ left: rect.left, top: rect.top - 6 }}
    >
      {options.map((option, i) => (
        <button
          key={option.key}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            commit(option);
          }}
          className={cn(
            "flex w-full items-baseline gap-2 px-2 py-1 text-left text-small",
            i === active && "bg-accent/20",
          )}
        >
          <span className="truncate">{option.label}</span>
          {option.detail && (
            <span className="ml-auto truncate text-data text-sub">{option.detail}</span>
          )}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function withShortcodeReplace(editor: Editor) {
  const { insertText } = editor;

  editor.insertText = (text, options) => {
    insertText(text, options);
    if (text !== ":" || ReactEditor.isComposing(editor)) return;

    const { selection } = editor;
    if (!selection || !Range.isCollapsed(selection)) return;
    const { path, offset } = selection.anchor;

    const node = Node.get(editor, path);
    if (!Text.isText(node)) return;

    const match = /:([a-zA-Z0-9_+-]+):$/.exec(node.text.slice(0, offset));
    if (!match) return;

    void findByShortcode(match[1]!).then((emoji) => {
      if (!emoji) return;
      try {
        Transforms.insertText(editor, emoji.native, {
          at: {
            anchor: { path, offset: offset - match[0].length },
            focus: { path, offset },
          },
        });
      } catch {
        return;
      }
    });
  };

  return editor;
}
