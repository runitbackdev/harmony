import { defineExtension } from "lexical";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryExtension } from "@lexical/history";
import { AutoFocusExtension } from "@lexical/extension";
import { TailwindExtension } from "@lexical/tailwind";
import { MarkdownExtension } from "./extensions";

const composerExtension = defineExtension({
  name: "Composer",
  namespace: "@harmony",
  dependencies: [HistoryExtension, AutoFocusExtension, MarkdownExtension, TailwindExtension],
});
const placeholderText = "Enter some rich text...";
const contentEditable = (
  <ContentEditable
    aria-placeholder={placeholderText}
    placeholder={<div className="editor-placeholder">{placeholderText}</div>}
  />
);

export function Composer() {
  return (
    <LexicalExtensionComposer extension={composerExtension} contentEditable={null}>
      {contentEditable}
    </LexicalExtensionComposer>
  );
}
