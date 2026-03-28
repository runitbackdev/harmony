import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { ReactRenderer } from "@tiptap/react";
import Mention from "@tiptap/extension-mention";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/react";
import { PluginKey } from "@tiptap/pm/state";
import type {
  SuggestionOptions,
  SuggestionProps,
  SuggestionKeyDownProps,
} from "@tiptap/suggestion";
import type { MemberSummary } from "@harmony/protocol";

export const mentionSuggestionPluginKey = new PluginKey("mentionSuggestion");

type MentionListRef = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

type MentionListProps = SuggestionProps<MemberSummary> & {
  getReferenceClientRect: (() => DOMRect) | null;
};

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command, getReferenceClientRect }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const { floatingStyles, refs } = useFloating({
      placement: "bottom-start",
      middleware: [offset(8), flip(), shift({ padding: 8 })],
      whileElementsMounted: autoUpdate,
    });

    useEffect(() => {
      if (getReferenceClientRect) {
        refs.setPositionReference({
          getBoundingClientRect: getReferenceClientRect,
        });
      }
    }, [getReferenceClientRect, refs]);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command({ id: item.userId, label: item.displayName ?? item.userId });
        }
      },
      [items, command],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }: SuggestionKeyDownProps) {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) return null;

    return (
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="mention-suggestions"
        role="listbox"
        aria-label="User suggestions"
      >
        {items.map((item, index) => (
          <button
            type="button"
            key={item.userId}
            role="option"
            aria-selected={index === selectedIndex}
            className={`mention-suggestion-item${index === selectedIndex ? " is-selected" : ""}`}
            onClick={() => selectItem(index)}
          >
            {item.displayName ?? item.userId}
          </button>
        ))}
      </div>
    );
  },
);

MentionList.displayName = "MentionList";

type GetMembers = (roomId: string) => Promise<MemberSummary[]>;

export function createMentionSuggestion(
  roomId: string,
  getMembers: GetMembers,
): Partial<SuggestionOptions<MemberSummary>> {
  return {
    pluginKey: mentionSuggestionPluginKey,
    char: "@",
    allowSpaces: true,

    async items({ query }) {
      const members = await getMembers(roomId);
      const q = query.toLowerCase();
      if (!q) return members.slice(0, 10);
      return members
        .filter(
          (m) => m.displayName?.toLowerCase().includes(q) || m.userId.toLowerCase().includes(q),
        )
        .slice(0, 10);
    },

    render() {
      let renderer: ReactRenderer<MentionListRef>;

      return {
        onStart(props) {
          renderer = new ReactRenderer(MentionList, {
            props: {
              ...props,
              getReferenceClientRect: props.clientRect,
            },
            editor: props.editor,
          });

          document.body.appendChild(renderer.element);
        },

        onUpdate(props) {
          renderer.updateProps({
            ...props,
            getReferenceClientRect: props.clientRect,
          });
        },

        onKeyDown(props) {
          if (props.event.key === "Escape") {
            renderer.destroy();
            return true;
          }
          return renderer.ref?.onKeyDown(props) ?? false;
        },

        onExit() {
          renderer.destroy();
        },
      };
    },
  };
}

export function createMentionExtension(roomId: string, getMembers: GetMembers) {
  return Mention.configure({
    HTMLAttributes: { class: "mention" },
    suggestion: createMentionSuggestion(roomId, getMembers),
    renderHTML({ options, node }) {
      const userId = node.attrs.id as string;
      const label = (node.attrs.label as string) ?? userId;
      return [
        "a",
        {
          ...options.HTMLAttributes,
          href: `https://matrix.to/#/${userId}`,
          "data-mention-id": userId,
        },
        `@${label}`,
      ];
    },
  });
}
