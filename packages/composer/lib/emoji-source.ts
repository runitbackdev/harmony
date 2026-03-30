import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { searchEmoji, findByShortcode } from "./emoji";
import { EditorView } from "@codemirror/view";

export function emojiCompletionSource(
  context: CompletionContext,
): Promise<CompletionResult | null> | null {
  const match = context.matchBefore(/:[a-zA-Z0-9_+-]*/);
  if (!match || match.text.length < 2) return null;

  const query = match.text.slice(1);
  return searchEmoji(query).then((results) => {
    if (!results.length) return null;
    return {
      from: match.from,
      options: results.map((e) => ({
        label: `:${e.shortcode}:`,
        displayLabel: `${e.native} :${e.shortcode}:`,
        apply: e.native,
        type: "emoji",
      })),
      filter: false,
    };
  });
}

export function emojiShortcodeReplace() {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== ":") return false;

    const line = view.state.doc.lineAt(from);
    const before = line.text.slice(0, from - line.from);
    const match = /:([a-zA-Z0-9_+-]+)$/.exec(before);
    if (!match) return false;

    const shortcode = match[1];
    const colonStart = from - match[0].length;

    void findByShortcode(shortcode).then((emoji) => {
      if (!emoji) return;
      view.dispatch({
        changes: { from: colonStart, to: to, insert: emoji.native },
      });
    });

    return false;
  });
}
