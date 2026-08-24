import type { ListDiff } from "./types.generated";

export type { ListDiff };

export function applyListDiff<T>(draft: T[], diff: ListDiff<T>) {
  switch (diff.op) {
    case "append":
      draft.push(...diff.values);
      break;
    case "clear":
      draft.length = 0;
      break;
    case "push_front":
      draft.unshift(diff.value);
      break;
    case "push_back":
      draft.push(diff.value);
      break;
    case "pop_front":
      draft.shift();
      break;
    case "pop_back":
      draft.pop();
      break;
    case "insert":
      draft.splice(diff.index, 0, diff.value);
      break;
    case "set":
      draft[diff.index] = diff.value;
      break;
    case "remove":
      draft.splice(diff.index, 1);
      break;
    case "truncate":
      draft.length = diff.length;
      break;
    case "reset":
      draft.length = 0;
      draft.push(...diff.values);
      break;
  }
}
