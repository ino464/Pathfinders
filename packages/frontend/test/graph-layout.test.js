import { describe, expect, test } from "vitest";
import {
  NODE_WIDTH,
  estimateHeight,
  layoutGraph
} from "../lib/graph-layout.js";

// Builds a graph in the shape getSessionGraph returns, with every
// stored position at the origin.
function sessionGraph(contents, edgePairs) {
  return {
    nodes: Object.entries(contents).map(([id, content]) => ({
      id,
      position: { x: 0, y: 0 },
      data: { content, status: "pending" }
    })),
    edges: edgePairs.map(([source, target]) => ({
      id: `${source}-${target}`,
      source,
      target
    }))
  };
}

function box(node) {
  return {
    left: node.position.x,
    right: node.position.x + NODE_WIDTH,
    top: node.position.y,
    bottom: node.position.y + estimateHeight(node.data.content)
  };
}

function overlaps(a, b) {
  return (
    a.left < b.right &&
    b.left < a.right &&
    a.top < b.bottom &&
    b.top < a.bottom
  );
}

function byId(result) {
  return Object.fromEntries(
    result.nodes.map((node) => [node.id, node])
  );
}

const long =
  "Create a visual progress board that tracks completed " +
  "topics and upcoming tasks, updating it daily.";

describe("layoutGraph", () => {
  test("returns an empty graph unchanged", () => {
    expect(layoutGraph({ nodes: [], edges: [] })).toEqual({
      nodes: [],
      edges: []
    });
  });

  test("places no two nodes on top of each other", () => {
    const graph = sessionGraph(
      {
        R: "Root",
        A: long,
        B: "Short",
        C: long,
        A1: long,
        A2: "Short",
        A3: long,
        C1: "Short"
      },
      [
        ["R", "A"],
        ["R", "B"],
        ["R", "C"],
        ["A", "A1"],
        ["A", "A2"],
        ["A", "A3"],
        ["C", "C1"]
      ]
    );

    const nodes = layoutGraph(graph).nodes;

    for (const a of nodes) {
      for (const b of nodes) {
        if (a.id === b.id) continue;
        expect(
          overlaps(box(a), box(b)),
          `${a.id}/${b.id}`
        ).toBe(false);
      }
    }
  });

  test("places each child to the right of its parent", () => {
    const graph = sessionGraph(
      { R: "Root", A: "A", B: "B", A1: "A1" },
      [
        ["R", "A"],
        ["R", "B"],
        ["A", "A1"]
      ]
    );

    const nodes = byId(layoutGraph(graph));

    for (const { source, target } of graph.edges) {
      expect(nodes[target].position.x).toBeGreaterThan(
        nodes[source].position.x + NODE_WIDTH
      );
    }
  });

  test("places a merged node to the right of both parents", () => {
    const graph = sessionGraph(
      { R: "Root", A: "A", B: "B", M: "Merged" },
      [
        ["R", "A"],
        ["R", "B"],
        ["A", "M"],
        ["B", "M"]
      ]
    );

    const nodes = byId(layoutGraph(graph));

    expect(nodes.M.position.x).toBeGreaterThan(
      nodes.A.position.x + NODE_WIDTH
    );
    expect(nodes.M.position.x).toBeGreaterThan(
      nodes.B.position.x + NODE_WIDTH
    );
  });

  test("keeps ids, data and edges, and replaces positions", () => {
    const graph = sessionGraph({ R: "Root", A: "A" }, [
      ["R", "A"]
    ]);

    const result = layoutGraph(graph);

    expect(result.edges).toBe(graph.edges);
    expect(result.nodes.map((n) => n.id)).toEqual(["R", "A"]);
    expect(result.nodes[1].data).toEqual(graph.nodes[1].data);
    expect(result.nodes[1].position).not.toEqual({
      x: 0,
      y: 0
    });
  });
});

describe("estimateHeight", () => {
  test("gives longer text a taller node", () => {
    expect(estimateHeight(long)).toBeGreaterThan(
      estimateHeight("Short")
    );
  });

  test("gives empty or missing text one line", () => {
    expect(estimateHeight("")).toBe(estimateHeight("a"));
    expect(estimateHeight(undefined)).toBe(estimateHeight("a"));
  });
});
