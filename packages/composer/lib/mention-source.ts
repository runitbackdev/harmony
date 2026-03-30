import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { MemberSummary } from "@harmony/protocol";

type GetMembers = (roomId: string) => Promise<MemberSummary[]>;

export function createMentionSource(roomId: string, getMembers: GetMembers) {
  return async function mentionSource(
    context: CompletionContext,
  ): Promise<CompletionResult | null> {
    const match = context.matchBefore(/@\w*/);
    if (!match && !context.explicit) return null;

    const query = match ? match.text.slice(1).toLowerCase() : "";
    const members = await getMembers(roomId);

    const filtered = members
      .filter((m) => {
        if (!query) return true;
        const name = (m.displayName ?? m.userId).toLowerCase();
        return name.includes(query) || m.userId.toLowerCase().includes(query);
      })
      .slice(0, 10);

    return {
      from: match?.from ?? context.pos,
      options: filtered.map((m) => ({
        label: `@${m.displayName ?? m.userId}`,
        apply: `[@${m.displayName ?? m.userId}](https://matrix.to/#/${m.userId}) `,
        type: "mention",
        detail: m.userId,
      })),
      filter: false,
    };
  };
}
