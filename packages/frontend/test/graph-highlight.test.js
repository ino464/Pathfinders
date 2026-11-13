import { describe, expect, test } from "vitest";
import { highlightSelection } from "../lib/graph-highlight";

function edge(source, target) {
  return { id: `${source}-${target}`, source, target };
}

// root -> a, b, c; a -> a1; b -> b1; a1 and b1 -> m (a merge);
// m -> m1; c -> c1
const EDGES = [
  edge("root", "a"),
  edge("root", "b"),
  edge("root", "c"),
  edge("a", "a1"),
  edge("b", "b1"),
  edge("a1", "m"),
  edge("b1", "m"),
  edge("m", "m1"),
  edge("c", "c1")
];

function sorted(set) {
  return [...set].sort();
}

describe("highlightSelection", () => {
  test("returns null when nothing is selected", () => {
    expect(highlightSelection(EDGES, [])).toBeNull();
  });

  test("keeps a node's ancestors and direct children", () => {
    const { nodeIds, edgeIds } = highlightSelection(EDGES, [
      "a"
    ]);

    expect(sorted(nodeIds)).toEqual(["a", "a1", "root"]);
    expect(sorted(edgeIds)).toEqual(["a-a1", "root-a"]);
  });

  test("follows every parent of a merged node to the root", () => {
    const { nodeIds, edgeIds } = highlightSelection(EDGES, [
      "m"
    ]);

    expect(sorted(nodeIds)).toEqual([
      "a",
      "a1",
      "b",
      "b1",
      "m",
      "m1",
      "root"
    ]);
    expect(edgeIds.has("a1-m")).toBe(true);
    expect(edgeIds.has("b1-m")).toBe(true);
    expect(edgeIds.has("m-m1")).toBe(true);
    expect(edgeIds.has("root-c")).toBe(false);
  });

  test("joins the paths of two nodes on different levels", () => {
    const { nodeIds, edgeIds } = highlightSelection(EDGES, [
      "c",
      "a1"
    ]);

    expect(sorted(nodeIds)).toEqual([
      "a",
      "a1",
      "c",
      "c1",
      "m",
      "root"
    ]);
    expect(sorted(edgeIds)).toEqual([
      "a-a1",
      "a1-m",
      "c-c1",
      "root-a",
      "root-c"
    ]);
  });

  test("does not keep a grandchild", () => {
    const { nodeIds } = highlightSelection(EDGES, ["a1"]);

    expect(nodeIds.has("m")).toBe(true);
    expect(nodeIds.has("m1")).toBe(false);
  });
});
