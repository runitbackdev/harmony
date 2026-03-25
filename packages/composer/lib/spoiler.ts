import { Mark, markInputRule, markPasteRule } from "@tiptap/core";

const SPOILER_INPUT_REGEX = /\|\|([^|]+)\|\|$/;
const SPOILER_PASTE_REGEX = /\|\|([^|]+)\|\|/g;

export const Spoiler = Mark.create({
  name: "spoiler",

  exitable: true,

  parseHTML() {
    return [{ tag: "span[data-mx-spoiler]" }];
  },

  renderHTML() {
    return ["span", { "data-mx-spoiler": "" }, 0];
  },

  addInputRules() {
    return [markInputRule({ find: SPOILER_INPUT_REGEX, type: this.type })];
  },

  addPasteRules() {
    return [markPasteRule({ find: SPOILER_PASTE_REGEX, type: this.type })];
  },
});
