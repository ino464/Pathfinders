import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from "vitest";

const fake = vi.hoisted(() => ({
  inputs: null,
  completion: null,
  addChildren: vi.fn()
}));

vi.mock("../lib/graph-data", () => ({
  getExpansionInputs: async () => fake.inputs,
  addChildren: (...args) => fake.addChildren(...args)
}));

vi.mock("../lib/groq", () => ({
  requestCompletion: (...args) => fake.completion(...args)
}));

const {
  CHAT_INSTRUCTION,
  MODEL,
  OUTLINE_INTRO,
  TIMEOUT_MS,
  buildOutline,
  buildSystemMessage,
  chatAboutNodes
} = await import("../lib/chat");

const node = (id, content, createdAt, deletedAt = null) => ({
  id,
  content,
  status: "pending",
  created_at: createdAt,
  deleted_at: deletedAt
});

const edge = (parent, child) => ({
  parent_node_id: parent,
  child_node_id: child
});

const pref = (id, content, createdAt) => ({
  id,
  content,
  created_at: createdAt
});

function graph() {
  return {
    nodes: [
      node("R", "Plan a trip", "2026-10-18T10:00:00Z"),
      node("A", "Visit in spring", "2026-10-18T10:00:01Z"),
      node("B", "Go to Kyoto", "2026-10-18T10:00:02Z"),
      node("C", "Stay in hostels", "2026-10-18T10:00:03Z"),
      node("X", "Other branch", "2026-10-18T10:00:04Z")
    ],
    edges: [
      edge("R", "A"),
      edge("A", "B"),
      edge("R", "C"),
      edge("R", "X")
    ],
    preferences: []
  };
}

function answerWith(text) {
  return vi.fn(async () => text);
}

async function expectStatus(promise, status) {
  await expect(promise).rejects.toMatchObject({ status });
}

beforeEach(() => {
  fake.inputs = graph();
  fake.completion = answerWith("Kyoto is lovely then.");
  fake.addChildren.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chatAboutNodes", () => {
  test("returns the trimmed reply", async () => {
    fake.completion = answerWith("  Kyoto is lovely then.\n");

    const result = await chatAboutNodes(
      "s1",
      ["B"],
      [],
      "Why?"
    );

    expect(result).toEqual({ reply: "Kyoto is lovely then." });
  });

  test("asks Groq for free text with the chat model", async () => {
    await chatAboutNodes("s1", ["B"], [], "Why?");

    expect(fake.completion.mock.calls[0][1]).toEqual({
      model: MODEL,
      timeoutMs: TIMEOUT_MS,
      responseFormat: "text"
    });
  });

  test("a second turn sends the outline, the earlier turns and the new message in that order", async () => {
    const history = [
      { role: "user", content: "Is spring busy?" },
      { role: "assistant", content: "Yes, very." }
    ];

    await chatAboutNodes("s1", ["B"], history, "Then when?");

    const messages = fake.completion.mock.calls[0][0];
    expect(messages).toEqual([
      { role: "system", content: CHAT_INSTRUCTION },
      {
        role: "user",
        content: [
          OUTLINE_INTRO,
          "Starting prompt: Plan a trip",
          "- Visit in spring",
          "- Go to Kyoto (selected)"
        ].join("\n")
      },
      { role: "user", content: "Is spring busy?" },
      { role: "assistant", content: "Yes, very." },
      { role: "user", content: "Then when?" }
    ]);
  });

  test("sends only role and content from each history turn", async () => {
    await chatAboutNodes(
      "s1",
      ["B"],
      [{ role: "user", content: "Hi", extra: "x" }],
      "Why?"
    );

    expect(fake.completion.mock.calls[0][0][2]).toEqual({
      role: "user",
      content: "Hi"
    });
  });

  test("writes nothing to the graph", async () => {
    await chatAboutNodes("s1", ["B"], [], "Why?");

    expect(fake.addChildren).not.toHaveBeenCalled();
  });

  test("puts the preferences in the system message", async () => {
    fake.inputs.preferences = [
      pref("P1", "Keep it cheap", "2026-10-18T10:00:05Z")
    ];

    await chatAboutNodes("s1", ["B"], [], "Why?");

    expect(fake.completion.mock.calls[0][0][0]).toEqual({
      role: "system",
      content: buildSystemMessage(fake.inputs.preferences)
    });
  });

  test("answers 404 for a node that is not in the session", async () => {
    await expectStatus(
      chatAboutNodes("s1", ["missing"], [], "Why?"),
      404
    );
    expect(fake.completion).not.toHaveBeenCalled();
  });

  test("answers 404 for a deleted node", async () => {
    fake.inputs.nodes[2] = node(
      "B",
      "Go to Kyoto",
      "2026-10-18T10:00:02Z",
      "2026-10-18T11:00:00Z"
    );

    await expectStatus(
      chatAboutNodes("s1", ["B"], [], "Why?"),
      404
    );
  });

  test("answers 504 when Groq times out", async () => {
    fake.completion = vi.fn(async () => {
      const err = new Error("timed out");
      err.name = "TimeoutError";
      throw err;
    });

    await expectStatus(
      chatAboutNodes("s1", ["B"], [], "Why?"),
      504
    );
  });

  test("answers 502 when the Groq request fails", async () => {
    fake.completion = vi.fn(async () => {
      throw new Error("Groq answered 500");
    });

    await expectStatus(
      chatAboutNodes("s1", ["B"], [], "Why?"),
      502
    );
  });

  test("answers 502 for an empty reply", async () => {
    fake.completion = answerWith("   ");

    await expectStatus(
      chatAboutNodes("s1", ["B"], [], "Why?"),
      502
    );
  });
});

describe("buildOutline", () => {
  test("lists both selected nodes and their shared ancestors once", () => {
    const { nodes, edges } = graph();

    expect(buildOutline(nodes, edges, ["B", "C"])).toBe(
      [
        OUTLINE_INTRO,
        "Starting prompt: Plan a trip",
        "- Visit in spring",
        "- Go to Kyoto (selected)",
        "- Stay in hostels (selected)"
      ].join("\n")
    );
  });

  test("marks the starting prompt when it is selected", () => {
    const { nodes, edges } = graph();

    expect(buildOutline(nodes, edges, ["R"])).toBe(
      [
        OUTLINE_INTRO,
        "Starting prompt: Plan a trip (selected)"
      ].join("\n")
    );
  });

  test("lists a node with two parents once, after both", () => {
    const { nodes, edges } = graph();
    nodes.push(
      node("M", "Spring in Kyoto", "2026-10-18T10:00:05Z")
    );
    edges.push(edge("B", "M"), edge("C", "M"));

    expect(buildOutline(nodes, edges, ["M"])).toBe(
      [
        OUTLINE_INTRO,
        "Starting prompt: Plan a trip",
        "- Visit in spring",
        "- Go to Kyoto",
        "- Stay in hostels",
        "- Spring in Kyoto (selected)"
      ].join("\n")
    );
  });

  test("collapses whitespace inside node content", () => {
    const nodes = [
      node("R", "Plan\n  a   trip", "2026-10-18T10:00:00Z")
    ];

    expect(buildOutline(nodes, [], ["R"])).toBe(
      [
        OUTLINE_INTRO,
        "Starting prompt: Plan a trip (selected)"
      ].join("\n")
    );
  });
});

describe("buildSystemMessage", () => {
  test("is only the chat instruction without preferences", () => {
    expect(buildSystemMessage([])).toBe(CHAT_INSTRUCTION);
  });

  test("adds the preferences after the instruction, oldest first", () => {
    const preferences = [
      pref("P2", "Nothing greasy", "2026-10-18T10:00:06Z"),
      pref("P1", "Keep it cheap", "2026-10-18T10:00:05Z")
    ];

    expect(buildSystemMessage(preferences)).toBe(
      [
        CHAT_INSTRUCTION,
        [
          "The user set these preferences for the whole session:",
          "- Keep it cheap",
          "- Nothing greasy",
          "Follow all of them in every reply."
        ].join("\n")
      ].join("\n\n")
    );
    expect(preferences.map((p) => p.id)).toEqual(["P2", "P1"]);
  });
});
