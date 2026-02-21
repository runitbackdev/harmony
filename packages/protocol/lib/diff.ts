export type ListDiff<T> =
  | { op: "append"; values: T[] }
  | { op: "clear" }
  | { op: "push_front"; value: T }
  | { op: "push_back"; value: T }
  | { op: "pop_front" }
  | { op: "pop_back" }
  | { op: "insert"; index: number; value: T }
  | { op: "set"; index: number; value: T }
  | { op: "remove"; index: number }
  | { op: "truncate"; length: number }
  | { op: "reset"; values: T[] };

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
