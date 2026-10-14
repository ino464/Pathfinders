import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({ client: null }));

vi.mock("../lib/supabase-server", () => ({
  createClient: async () => fake.client
}));

const { createSession, getSessionGraph, addNode } =
  await import("../lib/graph-data");

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
