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

const { POST } = await import("../app/api/chat/route");

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_A2 = "44444444-4444-4444-8444-444444444444";
const ROOT_A = "22222222-2222-4222-8222-222222222222";
const ROOT_A2 = "55555555-5555-4555-8555-555555555555";

function rlsClient({ user, visibleSessions, turnCount = 0 }) {
  const calls = [];
  const rows = {
    nodes: [
      {
        id: ROOT_A,
        session_id: SESSION_A,
        content: "Plan a trip",
        status: "pending",
        created_at: "2026-11-01T00:00:00Z",
        deleted_at: null
      },
      {
        id: ROOT_A2,
        session_id: SESSION_A2,
        content: "Start a garden",
        status: "pending",
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
      "eq",
      "gt"
    ]) {
      builder[op] = (...args) => {
        call.ops.push([op, ...args]);
        return builder;
      };
    }
    builder.then = (resolve, reject) => {
      let result;
      if (table === "chat_turns") {
        result = call.ops.some(([op]) => op === "insert")
          ? { data: null, error: null }
          : { count: turnCount, error: null };
      } else {
        const sessionId = call.ops.find(
          ([op, column]) =>
            op === "eq" && column === "session_id"
        )?.[2];
        result = {
          data: visibleSessions.includes(sessionId)
            ? rows[table].filter(
                (r) => r.session_id === sessionId
              )
            : [],
          error: null
        };
      }
      return Promise.resolve(result).then(resolve, reject);
    };
    return builder;
  }

  async function rpc(name, args) {
    calls.push({ rpc: name, args });
    return { data: null, error: null };
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
    new Request("http://localhost/api/chat", {
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

describe("POST /api/chat with the real chat function", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.groq = vi.fn(async () => "Spring is a good time.");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("writes only a chat turn, never nodes or edges", async () => {
    fake.client = rlsClient({
      user: { id: "user-a" },
      visibleSessions: [SESSION_A]
    });

    const response = await post({
      sessionId: SESSION_A,
      nodeIds: [ROOT_A],
      history: [],
      message: "When should I go?"
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: "Spring is a good time."
    });
    expect(writes(fake.client)).toEqual([
      {
        table: "chat_turns",
        ops: [["insert", { session_id: SESSION_A }]]
      }
    ]);
  });

  test("a second turn sends the outline, the earlier turns and the new message in order", async () => {
    fake.client = rlsClient({
      user: { id: "user-a" },
      visibleSessions: [SESSION_A]
    });

    await post({
      sessionId: SESSION_A,
      nodeIds: [ROOT_A],
      history: [
        { role: "user", content: "When should I go?" },
        { role: "assistant", content: "Spring is a good time." }
      ],
      message: "Why spring?"
    });

    const messages = fake.groq.mock.calls[0][0];
    expect(messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "user",
      "assistant",
      "user"
    ]);
    expect(messages[1].content).toContain(
      "Starting prompt: Plan a trip (selected)"
    );
    expect(messages.slice(2).map((m) => m.content)).toEqual([
      "When should I go?",
      "Spring is a good time.",
      "Why spring?"
    ]);
    expect(fake.groq.mock.calls[0][1].responseFormat).toBe(
      "text"
    );
  });

  test("answers 429 in another session once the user reached the limit", async () => {
    fake.client = rlsClient({
      user: { id: "user-a" },
      visibleSessions: [SESSION_A, SESSION_A2],
      turnCount: 30
    });

    const response = await post({
      sessionId: SESSION_A2,
      nodeIds: [ROOT_A2],
      message: "What should I plant?"
    });

    expect(response.status).toBe(429);
    expect(fake.groq).not.toHaveBeenCalled();
    expect(writes(fake.client)).toEqual([]);
  });

  test("answers 404 and writes nothing for another user's session", async () => {
    fake.client = rlsClient({
      user: { id: "user-b" },
      visibleSessions: []
    });

    const response = await post({
      sessionId: SESSION_A,
      nodeIds: [ROOT_A],
      message: "When should I go?"
    });

    expect(response.status).toBe(404);
    expect(fake.groq).not.toHaveBeenCalled();
    expect(writes(fake.client)).toEqual([]);
  });

  test("answers 401 and reads nothing when nobody is signed in", async () => {
    fake.client = rlsClient({
      user: null,
      visibleSessions: []
    });

    const response = await post({
      sessionId: SESSION_A,
      nodeIds: [ROOT_A],
      message: "When should I go?"
    });

    expect(response.status).toBe(401);
    expect(fake.client.calls).toEqual([]);
  });
});
