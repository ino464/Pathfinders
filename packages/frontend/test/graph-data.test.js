import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({ client: null }));

vi.mock("../lib/supabase-server", () => ({
  createClient: async () => fake.client
}));

const {
  createSession,
  listSessions,
  getLatestSession,
  getSessionGraph,
  getExpansionInputs,
  addChildren,
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
      "order",
      "limit",
      "maybeSingle",
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

  async function rpc(name, args) {
    calls.push({ rpc: name, args });
    const queue = results.rpc ?? [];
    return queue.shift() ?? { data: null, error: null };
  }

  return {
    calls,
    from,
    rpc,
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

describe("getLatestSession", () => {
  test("returns the most recently updated live session", async () => {
    const session = {
      id: "s2",
      title: "Latest ideas",
      root_node_id: "root-2"
    };
    fake.client = fakeClient({
      results: { sessions: [{ data: session, error: null }] }
    });

    await expect(getLatestSession()).resolves.toEqual(session);

    const [call] = fake.client.calls;
    expect(call).toMatchObject({ table: "sessions" });
    expect(call.ops).toEqual([
      ["select", "id, title, root_node_id"],
      ["is", "deleted_at", null],
      ["order", "updated_at", { ascending: false }],
      ["limit", 1],
      ["maybeSingle"]
    ]);
  });

  // Checks the query, live sessions only and newest first
  describe("listSessions", () => {
    test("returns live sessions, newest first", async () => {
      const sessions = [
        { id: "s2", title: "Newer", root_node_id: "n2" },
        { id: "s1", title: "Older", root_node_id: "n1" }
      ];
      fake.client = fakeClient({
        results: { sessions: [{ data: sessions, error: null }] }
      });

      await expect(listSessions()).resolves.toEqual(sessions);

      const [call] = fake.client.calls;
      expect(call).toMatchObject({ table: "sessions" });
      expect(call.ops).toEqual([
        ["select", "id, title, root_node_id, created_at"],
        ["is", "deleted_at", null],
        ["order", "created_at", { ascending: false }]
      ]);
    });
  });

  test("returns null when the user has no sessions", async () => {
    fake.client = fakeClient({
      results: { sessions: [{ data: null, error: null }] }
    });

    await expect(getLatestSession()).resolves.toBeNull();
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

describe("getExpansionInputs", () => {
  test("returns raw rows, deleted nodes included", async () => {
    const nodes = [
      {
        id: "r",
        content: "Root",
        status: "pending",
        created_at: "2026-01-01T00:00:01Z",
        deleted_at: null
      },
      {
        id: "a",
        content: "Idea A",
        status: "pending",
        created_at: "2026-01-01T00:00:02Z",
        deleted_at: "2026-01-02T00:00:00Z"
      }
    ];
    const edges = [{ parent_node_id: "r", child_node_id: "a" }];
    const preferences = [
      {
        id: "p",
        content: "Keep it cheap",
        created_at: "2026-01-01T00:00:03Z"
      }
    ];
    fake.client = fakeClient({
      results: {
        nodes: [{ data: nodes, error: null }],
        edges: [{ data: edges, error: null }],
        preferences: [{ data: preferences, error: null }]
      }
    });

    const inputs = await getExpansionInputs("s1");

    expect(inputs).toEqual({ nodes, edges, preferences });
    for (const call of fake.client.calls) {
      expect(call.ops).toContainEqual([
        "eq",
        "session_id",
        "s1"
      ]);
      expect(call.ops.map(([op]) => op)).not.toContain("is");
    }
  });

  test("throws the Supabase error when a read fails", async () => {
    const failure = new Error("read failed");
    fake.client = fakeClient({
      results: { preferences: [{ data: null, error: failure }] }
    });
    await expect(getExpansionInputs("s1")).rejects.toBe(
      failure
    );
  });
});

describe("addChildren", () => {
  test("calls add_children and returns React Flow shapes", async () => {
    fake.client = fakeClient({
      results: {
        rpc: [
          {
            data: {
              nodes: [
                {
                  id: "c1",
                  content: "Child",
                  status: "pending",
                  position_x: null,
                  position_y: null
                }
              ],
              edges: [
                {
                  id: "e1",
                  parent_node_id: "p",
                  child_node_id: "c1"
                }
              ]
            },
            error: null
          }
        ]
      }
    });

    const children = await addChildren("s1", "p", ["Child"]);

    expect(children).toEqual({
      nodes: [
        {
          id: "c1",
          position: { x: 0, y: 0 },
          data: { content: "Child", status: "pending" }
        }
      ],
      edges: [{ id: "e1", source: "p", target: "c1" }]
    });
    expect(fake.client.calls).toEqual([
      {
        rpc: "add_children",
        args: {
          p_session_id: "s1",
          p_parent_node_id: "p",
          p_contents: ["Child"]
        }
      }
    ]);
  });

  test("throws the Supabase error when the call fails", async () => {
    const failure = new Error("rpc failed");
    fake.client = fakeClient({
      results: { rpc: [{ data: null, error: failure }] }
    });
    await expect(
      addChildren("s1", "p", ["Child"])
    ).rejects.toBe(failure);
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
      "Status must be one of pending, accepted, rejected"
    );
    expect(fake.client.calls).toHaveLength(0);
  });

  test.each(["neutral", "ACCEPTED", " accepted", undefined])(
    "rejects the status %j without calling the database",
    async (status) => {
      fake.client = fakeClient();
      await expect(
        updateNodeStatus("n1", status)
      ).rejects.toThrow("Status must be one of");
      expect(fake.client.calls).toHaveLength(0);
    }
  );

  test.each(["pending", "accepted", "rejected"])(
    "accepts the status %s",
    async (status) => {
      fake.client = fakeClient({
        results: {
          nodes: [
            {
              data: {
                id: "n1",
                content: "Idea",
                status,
                position_x: null,
                position_y: null
              },
              error: null
            }
          ]
        }
      });
      const node = await updateNodeStatus("n1", status);
      expect(node.data.status).toBe(status);
    }
  );
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
