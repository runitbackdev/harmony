import type { BaseEditor } from "slate";
import type { ReactEditor } from "slate-react";
import type { HistoryEditor } from "slate-history";

export interface ParagraphElement {
  type: "paragraph";
  children: InlineDescendant[];
}

export interface MentionElement {
  type: "mention";
  userId: string;
  name: string;
  children: [{ text: "" }];
}

export interface EmojiElement {
  type: "emoji";
  shortcode: string;
  unicode?: string;
  mxc?: string;
  children: [{ text: "" }];
}

export type InlineDescendant = CustomText | MentionElement | EmojiElement;

export interface CustomText {
  text: string;
  marker?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  spoiler?: boolean;
  code?: boolean;
  codeblock?: boolean;
  blockquote?: boolean;
  subtext?: boolean;
  heading?: 1 | 2 | 3;
  link?: boolean;
  autolink?: boolean;
  mention?: boolean;
}

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor;
    Element: ParagraphElement | MentionElement | EmojiElement;
    Text: CustomText;
  }
}
