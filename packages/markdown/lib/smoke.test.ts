import { expect, test } from "vitest";
import type { Range } from "./types.ts";

test("Range contract typechecks", () => {
  const range: Range = { type: "spoiler", start: 0, end: 9 };
  expect(range.end).toBeGreaterThan(range.start);
});
