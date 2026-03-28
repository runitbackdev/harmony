import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/react";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import type { EmojiResult, EmojiListRef } from "./emoji";

type EmojiListProps = SuggestionProps<EmojiResult> & {
  getReferenceClientRect: (() => DOMRect) | null;
};

const EmojiList = forwardRef<EmojiListRef, EmojiListProps>(
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
        if (item) command(item);
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
        data-scope="emoji-suggestions"
        data-part="root"
        role="listbox"
        aria-label="Emoji suggestions"
      >
        {items.map((item, index) => (
          <button
            type="button"
            key={item.id}
            ref={
              index === selectedIndex ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined
            }
            role="option"
            aria-selected={index === selectedIndex}
            data-scope="emoji-suggestions"
            data-part="item"
            data-state={index === selectedIndex ? "selected" : undefined}
            onClick={() => selectItem(index)}
          >
            <span data-scope="emoji-suggestions" data-part="preview">
              {item.native}
            </span>
            <span data-scope="emoji-suggestions" data-part="name">
              :{item.shortcode}:
            </span>
          </button>
        ))}
      </div>
    );
  },
);

EmojiList.displayName = "EmojiList";

export default EmojiList;
