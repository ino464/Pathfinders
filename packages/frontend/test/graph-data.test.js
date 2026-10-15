import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({ client: null }));

vi.mock("../lib/supabase-server", () => ({
  createClient: async () => fake.client
}));

const {
  createSession,
  getSessionGraph,
  addNode,
  addEdge,
  updateNodeStatus,
  deleteSubtree
} = await import("../lib/graph-data");

function fakeClient({
  user = { id: "user-1" },
  results = {}
} = {}) {
  const calls = [];

  function from(table) {
    const call = { table, ops: [] };
    calls.push(call);
    const builder = {};
    for (const op of [
      "select",
      "insert",
      "update",
      "eq",
      "is",
      "in",
      "single"
    ]) {
      builder[op] = (...args) => {
        call.ops.push([op, ...args]);
        return builder;
      };
    }
    builder.then = (resolve, reject) => {
      const queue = results[table] ?? [];
      const next = queue.shift() ?? { data: null, error: null };
      return Promise.resolve(next).then(resolve, reject);
    };
    return builder;
  }

  return {
    calls,
    from,
    auth: {
      getUser: async () => ({ data: { user }, error: null })
    }
  };
}

describe("createSession", () => {
  beforeEach(() => {
    fake.client = fakeClient({
      results: {
        sessions: [
          {
            data: { id: "s1", root_node_id: null },
            error: null
          },
          {
            data: { id: "s1", root_node_id: "n1" },
            error: null
          }
        ],
        nodes: [
          {
            data: {
              id: "n1",
              session_id: "s1",
              content: "Root"
            },
            error: null
          }
        ]
      }
    });
  });

  test("creates the session and links its root node", async () => {
    const { session, rootNode } = await createSession(
      "Root",
      "My session"
    );

    expect(rootNode.id).toBe("n1");
    expect(session.root_node_id).toBe("n1");

    const [sessionInsert, nodeInsert, sessionUpdate] =
      fake.client.calls;
    expect(sessionInsert.ops[0]).toEqual([
      "insert",
      { user_id: "user-1", title: "My session" }
    ]);
    expect(nodeInsert.ops[0]).toEqual([
      "insert",
      { session_id: "s1", content: "Root" }
    ]);
    expect(sessionUpdate.ops.slice(0, 2)).toEqual([
      ["update", { root_node_id: "n1" }],
      ["eq", "id", "s1"]
    ]);
  });

  test("throws when nobody is signed in", async () => {
    fake.client = fakeClient({ user: null });
    await expect(createSession("Root")).rejects.toThrow(
      "Not signed in"
    );
  });

  test("throws the Supabase error when an insert fails", async () => {
    const failure = new Error("insert failed");
    fake.client = fakeClient({
      results: { sessions: [{ data: null, error: failure }] }
    });
    await expect(createSession("Root")).rejects.toBe(failure);
  });
});

describe("getSessionGraph", () => {
  test("returns live nodes and edges in React Flow shape", async () => {
    fake.client = fakeClient({
      results: {
        nodes: [
          {
            data: [
              {
                id: "r",
                content: "Root",
                status: "pending",
                position_x: 10,
                position_y: 20
              },
              {
                id: "a",
                content: "Idea A",
                status: "pending",
                position_x: null,
                position_y: null
              }
            ],
            error: null
          }
        ],
        edges: [
          {
            data: [
              {
                id: "e1",
                parent_node_id: "r",
                child_node_id: "a"
              },
              {
                id: "e2",
                parent_node_id: "a",
                child_node_id: "deleted"
              }
            ],
            error: null
          }
        ]
      }
    });

    const graph = await getSessionGraph("s1");

    expect(graph).toEqual({
      nodes: [
        {
          id: "r",
          position: { x: 10, y: 20 },
          data: { content: "Root", status: "pending" }
        },
        {
          id: "a",
          position: { x: 0, y: 0 },
          data: { content: "Idea A", status: "pending" }
        }
      ],
      edges: [{ id: "e1", source: "r", target: "a" }]
    });

    const nodesCall = fake.client.calls.find(
      (call) => call.table === "nodes"
    );
    expect(nodesCall.ops).toContainEqual([
      "eq",
      "session_id",
      "s1"
    ]);
    expect(nodesCall.ops).toContainEqual([
      "is",
      "deleted_at",
      null
    ]);
  });
});

describe("addNode", () => {
  test("inserts the node and returns it in React Flow shape", async () => {
    fake.client = fakeClient({
      results: {
        nodes: [
          {
            data: {
              id: "n2",
              content: "Idea",
              status: "pending",
              position_x: 5,
              position_y: 15
            },
            error: null
          }
        ]
      }
    });

    const node = await addNode("s1", "Idea", { x: 5, y: 15 });

    expect(node).toEqual({
      id: "n2",
      position: { x: 5, y: 15 },
      data: { content: "Idea", status: "pending" }
    });
    expect(fake.client.calls[0].ops[0]).toEqual([
      "insert",
      {
        session_id: "s1",
        content: "Idea",
        position_x: 5,
        position_y: 15
      }
    ]);
    expect(fake.client.calls[0].ops.map(([op]) => op)).toEqual([
      "insert",
      "select",
      "single"
    ]);
  });

  test("stores no position when none is given", async () => {
    fake.client = fakeClient({
      results: {
        nodes: [
          {
            data: {
              id: "n3",
              content: "Idea",
              status: "pending",
              position_x: null,
              position_y: null
            },
            error: null
          }
        ]
      }
    });

    await addNode("s1", "Idea");

    expect(fake.client.calls[0].ops[0]).toEqual([
      "insert",
      {
        session_id: "s1",
        content: "Idea",
        position_x: null,
        position_y: null
      }
    ]);
  });

  test("throws the Supabase error when the insert fails", async () => {
    const failure = new Error("insert failed");
    fake.client = fakeClient({
      results: { nodes: [{ data: null, error: failure }] }
    });
    await expect(addNode("s1", "Idea")).rejects.toBe(failure);
  });
});

describe("addEdge", () => {
  test("inserts the edge and returns it in React Flow shape", async () => {
    fake.client = fakeClient({
      results: {
        edges: [
          {
            data: [{ parent_node_id: "r", child_node_id: "a" }],
            error: null
          },
          {
            data: {
              id: "e2",
              parent_node_id: "a",
              child_node_id: "b"
            },
            error: null
          }
        ]
      }
    });

    const edge = await addEdge("s1", "a", "b");

    expect(edge).toEqual({
      id: "e2",
      source: "a",
      target: "b"
    });
    expect(fake.client.calls[1].ops.map(([op]) => op)).toEqual([
      "insert",
      "select",
      "single"
    ]);
    expect(fake.client.calls[1].ops[0]).toEqual([
      "insert",
      {
        session_id: "s1",
        parent_node_id: "a",
        child_node_id: "b"
      }
    ]);
  });

  test("allows a merge where a node gets a second parent", async () => {
    fake.client = fakeClient({
      results: {
        edges: [
          {
            data: [
              { parent_node_id: "r", child_node_id: "a" },
              { parent_node_id: "r", child_node_id: "b" },
              { parent_node_id: "a", child_node_id: "m" }
            ],
            error: null
          },
          {
            data: {
              id: "e4",
              parent_node_id: "b",
              child_node_id: "m"
            },
            error: null
          }
        ]
      }
    });

    const edge = await addEdge("s1", "b", "m");

    expect(edge).toEqual({
      id: "e4",
      source: "b",
      target: "m"
    });
  });

  test("refuses an edge that would create a loop", async () => {
    fake.client = fakeClient({
      results: {
        edges: [
          {
            data: [
              { parent_node_id: "r", child_node_id: "a" },
              { parent_node_id: "a", child_node_id: "b" }
            ],
            error: null
          }
        ]
      }
    });

    await expect(addEdge("s1", "b", "r")).rejects.toThrow(
      "loop"
    );
    expect(fake.client.calls).toHaveLength(1);
  });
});

describe("updateNodeStatus", () => {
  test("updates the status and returns the node", async () => {
    fake.client = fakeClient({
      results: {
        nodes: [
          {
            data: {
              id: "n1",
              content: "Idea",
              status: "accepted",
              position_x: null,
              position_y: null
            },
            error: null
          }
        ]
      }
    });

    const node = await updateNodeStatus("n1", "accepted");

    expect(node.data.status).toBe("accepted");
    expect(fake.client.calls[0].ops.slice(0, 2)).toEqual([
      ["update", { status: "accepted" }],
      ["eq", "id", "n1"]
    ]);
  });

  test("rejects an empty status without calling the database", async () => {
    fake.client = fakeClient();
    await expect(updateNodeStatus("n1", "  ")).rejects.toThrow(
      "non-empty"
    );
    expect(fake.client.calls).toHaveLength(0);
  });
});

describe("deleteSubtree", () => {
  function graph(nodeIds, edgePairs) {
    return fakeClient({
      results: {
        nodes: [
          { data: nodeIds.map((id) => ({ id })), error: null },
          { data: null, error: null }
        ],
        edges: [
          {
            data: edgePairs.map(([parent, child]) => ({
              parent_node_id: parent,
              child_node_id: child
            })),
            error: null
          }
        ]
      }
    });
  }

  function deletedIds() {
    const update = fake.client.calls.filter(
      (call) => call.table === "nodes"
    )[1];
    const inOp = update.ops.find(([op]) => op === "in");
    return [...inOp[2]].sort();
  }

  test("deletes the node and everything below it", async () => {
    fake.client = graph(
      ["r", "a", "b", "c"],
      [
        ["r", "a"],
        ["a", "b"],
        ["b", "c"]
      ]
    );

    await deleteSubtree("s1", "a");

    expect(deletedIds()).toEqual(["a", "b", "c"]);
  });

  test("keeps a merged node whose other parent is still alive", async () => {
    fake.client = graph(
      ["r", "a", "b", "m", "c"],
      [
        ["r", "a"],
        ["r", "b"],
        ["a", "m"],
        ["b", "m"],
        ["m", "c"]
      ]
    );

    await deleteSubtree("s1", "a");

    expect(deletedIds()).toEqual(["a"]);
  });

  test("deletes a merged node when both of its parents are deleted", async () => {
    fake.client = graph(
      ["r", "a", "x", "y", "m"],
      [
        ["r", "a"],
        ["a", "x"],
        ["a", "y"],
        ["x", "m"],
        ["y", "m"]
      ]
    );

    await deleteSubtree("s1", "a");

    expect(deletedIds()).toEqual(["a", "m", "x", "y"]);
  });

  test("ignores a parent that was already deleted", async () => {
    fake.client = graph(
      ["r", "a", "m"],
      [
        ["r", "a"],
        ["gone", "m"],
        ["a", "m"]
      ]
    );

    await deleteSubtree("s1", "a");

    expect(deletedIds()).toEqual(["a", "m"]);
  });

  test("throws when the node is not in the session", async () => {
    fake.client = graph(["r"], []);
    await expect(
      deleteSubtree("s1", "missing")
    ).rejects.toThrow("not found");
  });
});
