import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from "vitest";

const fake = vi.hoisted(() => {
  class ChatError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  return { ChatError, chat: null, user: null };
});

vi.mock("../lib/supabase-server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        fake.user
          ? { data: { user: fake.user }, error: null }
          : {
              data: { user: null },
              error: new Error("Auth session missing!")
            }
    }
  })
}));

vi.mock("../lib/chat", () => ({
  ChatError: fake.ChatError,
  chatAboutNodes: (...args) => fake.chat(...args)
}));

const { POST } = await import("../app/api/chat/route");

const SESSION = "11111111-1111-4111-8111-111111111111";
const NODE = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function post(body) {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      body:
        typeof body === "string" ? body : JSON.stringify(body)
    })
  );
}

function valid(overrides = {}) {
  return {
    sessionId: SESSION,
    nodeIds: [NODE],
    history: [],
    message: "Why this idea?",
    ...overrides
  };
}

function turns(count) {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Turn ${i + 1}`
  }));
}

async function expect400(body, error) {
  const response = await post(body);
  expect(response.status).toBe(400);
  if (error) {
    expect(await response.json()).toEqual({ error });
  }
  expect(fake.chat).not.toHaveBeenCalled();
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    fake.user = { id: "user-1" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.chat = vi.fn(async () => ({ reply: "Because." }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("answers 200 with the reply", async () => {
    const history = turns(2);
    const response = await post(valid({ history }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: "Because."
    });
    expect(fake.chat).toHaveBeenCalledWith(
      SESSION,
      [NODE],
      history,
      "Why this idea?"
    );
  });

  test("accepts two node ids", async () => {
    const response = await post(
      valid({ nodeIds: [NODE, OTHER] })
    );

    expect(response.status).toBe(200);
    expect(fake.chat.mock.calls[0][1]).toEqual([NODE, OTHER]);
  });

  test("treats a missing history as no earlier turns", async () => {
    const body = valid();
    delete body.history;

    await post(body);

    expect(fake.chat.mock.calls[0][2]).toEqual([]);
  });

  test("cuts the history to the last 10 turns", async () => {
    const history = turns(14);

    await post(valid({ history }));

    expect(fake.chat.mock.calls[0][2]).toEqual(
      history.slice(-10)
    );
  });

  test("does not refuse a bad turn that the cut drops", async () => {
    const history = [
      { role: "system", content: "Old" },
      ...turns(10)
    ];

    const response = await post(valid({ history }));

    expect(response.status).toBe(200);
    expect(fake.chat.mock.calls[0][2]).toEqual(turns(10));
  });

  test("sends only role and content from each turn", async () => {
    await post(
      valid({
        history: [{ role: "user", content: "Hi", id: "x" }]
      })
    );

    expect(fake.chat.mock.calls[0][2]).toEqual([
      { role: "user", content: "Hi" }
    ]);
  });

  test("trims the message", async () => {
    await post(valid({ message: "  Why?  " }));

    expect(fake.chat.mock.calls[0][3]).toBe("Why?");
  });

  test("answers 401 when nobody is signed in", async () => {
    fake.user = null;

    const response = await post(valid());

    expect(response.status).toBe(401);
    expect(fake.chat).not.toHaveBeenCalled();
  });

  test("refuses a body that is not JSON", async () => {
    await expect400(
      "not json",
      "The request body must be JSON."
    );
  });

  test("refuses a sessionId that is not a UUID", async () => {
    await expect400(
      valid({ sessionId: "abc" }),
      "sessionId must be a UUID."
    );
  });

  test.each([
    ["missing", undefined],
    ["empty", []],
    ["three ids", [NODE, OTHER, SESSION]],
    ["not a UUID", ["abc"]],
    ["a single string", NODE]
  ])("refuses nodeIds that are %s", async (_, nodeIds) => {
    await expect400(
      valid({ nodeIds }),
      "nodeIds must be a list of one or two UUIDs."
    );
  });

  test("refuses a repeated node id", async () => {
    await expect400(
      valid({ nodeIds: [NODE, NODE.toUpperCase()] }),
      "nodeIds must not repeat a node."
    );
  });

  test("refuses a history that is not a list", async () => {
    await expect400(
      valid({ history: "hello" }),
      "history must be a list of turns."
    );
  });

  test.each([["system"], ["tool"], [undefined]])(
    "refuses a turn with the role %s",
    async (role) => {
      await expect400(
        valid({ history: [{ role, content: "Hi" }] }),
        "Each history turn must have the role user or assistant."
      );
    }
  );

  test("refuses a turn that is not an object", async () => {
    await expect400(
      valid({ history: ["Hi"] }),
      "Each history turn must have the role user or assistant."
    );
  });

  test("refuses a turn without string content", async () => {
    await expect400(
      valid({ history: [{ role: "user", content: 5 }] }),
      "Each history turn must have string content."
    );
  });

  test("refuses a turn over 4000 characters", async () => {
    await expect400(
      valid({
        history: [
          { role: "assistant", content: "a".repeat(4001) }
        ]
      }),
      "Each history turn must be at most 4000 characters."
    );
  });

  test("accepts a turn of exactly 4000 characters", async () => {
    const response = await post(
      valid({
        history: [
          { role: "assistant", content: "a".repeat(4000) }
        ]
      })
    );

    expect(response.status).toBe(200);
  });

  test.each([
    ["missing", undefined],
    ["blank", "   "],
    ["not a string", 42]
  ])("refuses a message that is %s", async (_, message) => {
    await expect400(
      valid({ message }),
      "message must be a non-empty string."
    );
  });

  test("refuses a message over 2000 characters", async () => {
    await expect400(
      valid({ message: "a".repeat(2001) }),
      "message must be at most 2000 characters."
    );
  });

  test.each([
    [404, "Node not found in this session."],
    [429, "Too many chat messages. Try again later."],
    [502, "The model request failed."],
    [504, "The model did not answer in time."]
  ])(
    "passes a ChatError %i through",
    async (status, message) => {
      fake.chat = vi.fn(async () => {
        throw new fake.ChatError(status, message);
      });

      const response = await post(valid());

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: message });
    }
  );

  test("answers 500 for an unexpected error", async () => {
    fake.chat = vi.fn(async () => {
      throw new Error("boom");
    });

    const response = await post(valid());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "The chat reply failed."
    });
  });
});
