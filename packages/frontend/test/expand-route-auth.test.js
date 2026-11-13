import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({ client: null, groq: null }));

vi.mock("../lib/supabase-server", () => ({
  createClient: async () => fake.client
}));

vi.mock("../lib/groq", () => ({
  requestCompletion: (...args) => fake.groq(...args)
}));

const { POST } = await import("../app/api/expand/route");

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const ROOT_A = "22222222-2222-4222-8222-222222222222";

function rlsClient({ user, visibleSessions }) {
  const calls = [];
  const rows = {
    nodes: [
      {
        id: ROOT_A,
        session_id: SESSION_A,
        content: "Plan a trip",
        status: "accepted",
        created_at: "2026-11-01T00:00:00Z",
        deleted_at: null
      }
    ],
    edges: [],
    preferences: []
  };

  function from(table) {
    const call = { table, ops: [] };
    calls.push(call);
    const builder = {};
    for (const op of [
      "select",
      "insert",
      "update",
      "delete",
      "eq"
    ]) {
      builder[op] = (...args) => {
        call.ops.push([op, ...args]);
        return builder;
      };
    }
    builder.then = (resolve, reject) => {
      const sessionFilter = call.ops.find(
        ([op, column]) => op === "eq" && column === "session_id"
      );
      const sessionId = sessionFilter?.[2];
      const data = visibleSessions.includes(sessionId)
        ? rows[table].filter((r) => r.session_id === sessionId)
        : [];
      return Promise.resolve({ data, error: null }).then(
        resolve,
        reject
      );
    };
    return builder;
  }

  async function rpc(name, args) {
    calls.push({ rpc: name, args });
    return {
      data: { nodes: [], edges: [] },
      error: null
    };
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

function post(body) {
  return POST(
    new Request("http://localhost/api/expand", {
      method: "POST",
      body: JSON.stringify(body)
    })
  );
}

function writes(client) {
  return client.calls.filter(
    (call) =>
      call.rpc ||
      call.ops?.some(([op]) =>
        ["insert", "update", "delete"].includes(op)
      )
  );
}

describe("POST /api/expand across users", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.groq = vi.fn(async () =>
      JSON.stringify({ ideas: ["One", "Two", "Three"] })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("answers 404 and writes nothing for another user's session", async () => {
    fake.client = rlsClient({
      user: { id: "user-b" },
      visibleSessions: []
    });

    const response = await post({
      sessionId: SESSION_A,
      nodeId: ROOT_A
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Node not found in this session."
    });
    expect(fake.groq).not.toHaveBeenCalled();
    expect(writes(fake.client)).toEqual([]);
  });

  test("expands the owner's own session", async () => {
    fake.client = rlsClient({
      user: { id: "user-a" },
      visibleSessions: [SESSION_A]
    });

    const response = await post({
      sessionId: SESSION_A,
      nodeId: ROOT_A
    });

    expect(response.status).toBe(201);
    expect(fake.groq).toHaveBeenCalledTimes(1);
    expect(writes(fake.client)).toEqual([
      {
        rpc: "add_children_to_parents",
        args: {
          p_session_id: SESSION_A,
          p_parent_node_ids: [ROOT_A],
          p_contents: ["One", "Two", "Three"]
        }
      }
    ]);
  });

  test("answers 401 and reads nothing when nobody is signed in", async () => {
    fake.client = rlsClient({
      user: null,
      visibleSessions: []
    });

    const response = await post({
      sessionId: SESSION_A,
      nodeId: ROOT_A
    });

    expect(response.status).toBe(401);
    expect(fake.client.calls).toEqual([]);
    expect(fake.groq).not.toHaveBeenCalled();
  });
});
