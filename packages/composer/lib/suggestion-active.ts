import type { EditorState } from "@tiptap/pm/state";
import { emojiSuggestionPluginKey } from "./emoji";
import { mentionSuggestionPluginKey } from "./mention";

export function isSuggestionActive(state: EditorState): boolean {
  const emoji = emojiSuggestionPluginKey.getState(state);
  if (emoji?.active) return true;

  const mention = mentionSuggestionPluginKey.getState(state);
  if (mention?.active) return true;

  return false;
}
