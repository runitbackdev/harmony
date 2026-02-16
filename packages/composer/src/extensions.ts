import { defineExtension } from "lexical";
import { RichTextExtension } from "@lexical/rich-text";
import { ListExtension } from "@lexical/list";
import { LinkExtension } from "@lexical/link";
import { HorizontalRuleExtension } from "@lexical/extension";
import {
  CODE,
  registerMarkdownShortcuts,
  TRANSFORMERS,
} from "@lexical/markdown";

export const MarkdownExtension = defineExtension({
  name: "MarkdownShortcuts",
  namespace: "@harmony",

  dependencies: [
    RichTextExtension,
    ListExtension,
    LinkExtension,
    HorizontalRuleExtension,
  ],

  register: (editor) => {
    return registerMarkdownShortcuts(
      editor,
      TRANSFORMERS.filter((transformer) => transformer != CODE),
    );
  },
});
