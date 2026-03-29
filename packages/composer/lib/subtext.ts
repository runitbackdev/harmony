import { Node, textblockTypeInputRule } from "@tiptap/core";

export const Subtext = Node.create({
  name: "subtext",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "small[data-subtext]" }];
  },

  renderHTML() {
    return ["small", { "data-subtext": "" }, 0];
  },

  addInputRules() {
    return [textblockTypeInputRule({ find: /^-#\s$/, type: this.type })];
  },
});
