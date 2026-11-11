import { describe, expect, test } from "vitest";
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  exportFileName,
  serializeSession
} from "../lib/session-export";

const EXPORTED_AT = "2026-11-11T12:00:00.000Z";

function node(id, minute, deleted = false, status = "pending") {
  return {
    id,
    content: `idea ${id}`,
    status,
    created_at: `2026-11-01T10:${String(minute).padStart(2, "0")}:00+00:00`,
    deleted_at: deleted ? "2026-11-02T10:00:00+00:00" : null
  };
}

function edge(parent, child) {
  return { parent_node_id: parent, child_node_id: child };
}

// root -> b, c; d has two parents (b and c), which is a merge;
// e -> f is a pruned branch; g has parents b and the pruned e.
function sampleInputs() {
  return {
    session: {
      id: "s1",
      title: "Trip ideas",
      root_node_id: "a"
    },
    nodes: [
      node("d", 3),
      node("a", 0),
      node("c", 2, false, "rejected"),
      node("b", 1, false, "accepted"),
      node("e", 4, true),
      node("f", 5, true),
      node("g", 6)
    ],
    edges: [
      edge("a", "b"),
      edge("a", "c"),
      edge("c", "d"),
      edge("b", "d"),
      edge("a", "e"),
      edge("e", "f"),
      edge("e", "g"),
      edge("b", "g")
    ],
    preferences: [
      {
        id: "p2",
        content: "Under $500",
        created_at: "2026-11-01T11:00:00+00:00"
      },
      {
        id: "p1",
        content: "No flights",
        created_at: "2026-11-01T09:00:00+00:00"
      }
    ]
  };
}

describe("serializeSession", () => {
  test("names the format, version and export time", () => {
    const file = serializeSession(sampleInputs(), EXPORTED_AT);

    expect(file.format).toBe(EXPORT_FORMAT);
    expect(file.version).toBe(EXPORT_VERSION);
    expect(file.exportedAt).toBe(EXPORTED_AT);
    expect(file.session).toEqual({
      title: "Trip ideas",
      rootNodeId: "a"
    });
  });

  test("keeps both edges into a merged node", () => {
    const file = serializeSession(sampleInputs(), EXPORTED_AT);

    expect(file.edges.filter((e) => e.childId === "d")).toEqual(
      [
        { parentId: "b", childId: "d" },
        { parentId: "c", childId: "d" }
      ]
    );
  });

  test("leaves out a pruned branch and its edges", () => {
    const file = serializeSession(sampleInputs(), EXPORTED_AT);
    const ids = file.nodes.map((n) => n.id);

    expect(ids).not.toContain("e");
    expect(ids).not.toContain("f");
    expect(
      file.edges.some(
        (e) =>
          ["e", "f"].includes(e.parentId) ||
          ["e", "f"].includes(e.childId)
      )
    ).toBe(false);
  });

  test("keeps a child whose other parent is still live", () => {
    const file = serializeSession(sampleInputs(), EXPORTED_AT);

    expect(file.nodes.map((n) => n.id)).toContain("g");
    expect(file.edges.filter((e) => e.childId === "g")).toEqual(
      [{ parentId: "b", childId: "g" }]
    );
  });

  test("writes the whole graph in creation order", () => {
    const file = serializeSession(sampleInputs(), EXPORTED_AT);

    expect(file.nodes).toEqual([
      {
        id: "a",
        content: "idea a",
        status: "pending",
        createdAt: "2026-11-01T10:00:00+00:00"
      },
      {
        id: "b",
        content: "idea b",
        status: "accepted",
        createdAt: "2026-11-01T10:01:00+00:00"
      },
      {
        id: "c",
        content: "idea c",
        status: "rejected",
        createdAt: "2026-11-01T10:02:00+00:00"
      },
      {
        id: "d",
        content: "idea d",
        status: "pending",
        createdAt: "2026-11-01T10:03:00+00:00"
      },
      {
        id: "g",
        content: "idea g",
        status: "pending",
        createdAt: "2026-11-01T10:06:00+00:00"
      }
    ]);
    expect(file.edges).toEqual([
      { parentId: "a", childId: "b" },
      { parentId: "a", childId: "c" },
      { parentId: "b", childId: "d" },
      { parentId: "b", childId: "g" },
      { parentId: "c", childId: "d" }
    ]);
  });

  test("writes preferences in creation order without ids", () => {
    const file = serializeSession(sampleInputs(), EXPORTED_AT);

    expect(file.preferences).toEqual([
      {
        content: "No flights",
        createdAt: "2026-11-01T09:00:00+00:00"
      },
      {
        content: "Under $500",
        createdAt: "2026-11-01T11:00:00+00:00"
      }
    ]);
  });

  test("sets rootNodeId to null when the root is pruned", () => {
    const inputs = sampleInputs();
    inputs.nodes = inputs.nodes.map((n) =>
      n.id === "a" ? { ...n, deleted_at: "2026-11-02" } : n
    );

    const file = serializeSession(inputs, EXPORTED_AT);

    expect(file.session.rootNodeId).toBeNull();
    expect(file.nodes.map((n) => n.id)).not.toContain("a");
  });

  test("keeps a missing title as null", () => {
    const inputs = sampleInputs();
    inputs.session = { ...inputs.session, title: null };

    expect(
      serializeSession(inputs, EXPORTED_AT).session.title
    ).toBeNull();
  });

  test("exports an empty session", () => {
    const file = serializeSession(
      {
        session: {
          id: "s1",
          title: "Empty",
          root_node_id: null
        },
        nodes: [],
        edges: [],
        preferences: []
      },
      EXPORTED_AT
    );

    expect(file.session.rootNodeId).toBeNull();
    expect(file.nodes).toEqual([]);
    expect(file.edges).toEqual([]);
    expect(file.preferences).toEqual([]);
  });
});

describe("exportFileName", () => {
  test.each([
    ["Trip ideas", "trip-ideas.pathfinders.json"],
    ["  What's next?! ", "what-s-next.pathfinders.json"],
    [null, "session.pathfinders.json"],
    ["!!!", "session.pathfinders.json"]
  ])("names %j as %s", (title, name) => {
    expect(exportFileName(title)).toBe(name);
  });

  test("keeps the name short", () => {
    const name = exportFileName("a ".repeat(100));
    expect(name.length).toBeLessThanOrEqual(
      60 + ".pathfinders.json".length
    );
    expect(name).not.toMatch(/-\.pathfinders/);
  });
});
