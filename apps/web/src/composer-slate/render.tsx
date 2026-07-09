import {
  useFocused,
  useSelected,
  type RenderElementProps,
  type RenderLeafProps,
} from "slate-react";
import { cn } from "@/ui/utils";
import {
  Emoji,
  HEADING_STYLES,
  InlineCode,
  MENTION_CHIP_STYLES,
  Spoiler,
  Underline,
} from "@/ui/message_content";
import type { EmojiElement, MentionElement } from "./types";

function renderElement(props: RenderElementProps) {
  switch (props.element.type) {
    case "mention":
      return <MentionNode {...props} element={props.element} />;
    case "emoji":
      return <EmojiNode {...props} element={props.element} />;
    default:
      return <div {...props.attributes}>{props.children}</div>;
  }
}

function renderLeaf({ attributes, children, leaf }: RenderLeafProps) {
  let content = children;
  if (leaf.bold) content = <strong>{content}</strong>;
  if (leaf.italic) content = <em>{content}</em>;
  if (leaf.underline) content = <Underline>{content}</Underline>;
  if (leaf.strikethrough) content = <del>{content}</del>;
  if (leaf.code) content = <InlineCode>{content}</InlineCode>;
  if (leaf.spoiler) content = <Spoiler forceRevealed>{content}</Spoiler>;

  return (
    <span
      {...attributes}
      className={cn(
        leaf.marker && "opacity-40",
        leaf.heading && HEADING_STYLES[leaf.heading],
        leaf.subtext && "text-xs text-sub",
        leaf.blockquote && "text-sub",
        leaf.codeblock && "font-mono text-[0.8125rem]",
        (leaf.link || leaf.autolink || leaf.mention) && "text-link underline underline-offset-2",
      )}
    >
      {content}
    </span>
  );
}

function MentionNode({
  attributes,
  children,
  element,
}: RenderElementProps & { element: MentionElement }) {
  const selected = useSelected();
  const focused = useFocused();
  const active = selected && focused;

  return (
    <span
      {...attributes}
      contentEditable={false}
      data-mx-mention="user"
      className={cn(MENTION_CHIP_STYLES, active && "ring-2 ring-accent")}
    >
      @{element.name}
      {children}
    </span>
  );
}

function EmojiNode({
  attributes,
  children,
  element,
}: RenderElementProps & { element: EmojiElement }) {
  const selected = useSelected();
  const focused = useFocused();
  const active = selected && focused;

  return (
    <span
      {...attributes}
      contentEditable={false}
      className={cn(active && "ring-2 ring-accent rounded")}
    >
      <Emoji char={element.unicode ?? `:${element.shortcode}:`} />
      {children}
    </span>
  );
}

export { renderElement, renderLeaf };
