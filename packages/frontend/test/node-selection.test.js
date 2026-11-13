import { describe, expect, test } from "vitest";
import {
  MAX_SELECTED,
  nextSelection,
  sameSelection
} from "../lib/node-selection";

describe("nextSelection", () => {
  test("a plain click selects only that node", () => {
    expect(nextSelection([], "a", false)).toEqual(["a"]);
    expect(nextSelection(["a", "b"], "c", false)).toEqual([
      "c"
    ]);
  });

  test("an additive click adds a second node", () => {
    expect(nextSelection(["a"], "b", true)).toEqual(["a", "b"]);
  });

  test("an additive click on a selected node removes it", () => {
    expect(nextSelection(["a", "b"], "a", true)).toEqual(["b"]);
    expect(nextSelection(["a"], "a", true)).toEqual([]);
  });

  test("a third additive click replaces the selection", () => {
    expect(MAX_SELECTED).toBe(2);
    expect(nextSelection(["a", "b"], "c", true)).toEqual(["c"]);
  });

  test("an additive click with nothing selected selects the node", () => {
    expect(nextSelection([], "a", true)).toEqual(["a"]);
  });
});

describe("sameSelection", () => {
  test("compares ids in order", () => {
    expect(sameSelection(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameSelection(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameSelection(["a"], ["a", "b"])).toBe(false);
    expect(sameSelection([], [])).toBe(true);
  });
});
