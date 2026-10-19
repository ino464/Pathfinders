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
  addChildren: null
}));

vi.mock("../lib/graph-data", () => ({
  getExpansionInputs: async () => fake.inputs,
  addChildren: (...args) => fake.addChildren(...args)
}));

vi.mock("../lib/groq", () => ({
  requestCompletion: (...args) => fake.completion(...args)
}));

const {
  CHILD_COUNT,
  INSTRUCTION,
  MODEL,
  RATE_LIMIT_EXPANSIONS,
  RATE_LIMIT_WINDOW_MS,
  TIMEOUT_MS,
  expandNode
} = await import("../lib/expand");

const NOW = Date.parse("2026-10-18T12:00:00Z");

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

// Root R with one child A, both created well before NOW.
function smallGraph() {
  return {
    nodes: [
      node("R", "Root prompt", "2026-10-18T10:00:00Z"),
      node("A", "Idea A", "2026-10-18T10:00:01Z")
    ],
    edges: [edge("R", "A")],
    preferences: []
  };
}

function ideas(count = CHILD_COUNT) {
  return Array.from(
    { length: count },
    (_, i) => `Idea ${i + 1}`
  );
}

function answerWith(value) {
  return vi.fn(async () =>
    typeof value === "string" ? value : JSON.stringify(value)
  );
}

async function expectStatus(promise, status) {
  await expect(promise).rejects.toMatchObject({ status });
}

describe("expandNode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.inputs = smallGraph();
    fake.completion = answerWith({ ideas: ideas() });
    fake.addChildren = vi.fn(async () => ({
      nodes: [],
      edges: []
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("writes the ideas as children and returns them", async () => {
    const result = await expandNode("s1", "A");

    expect(result).toEqual({ nodes: [], edges: [] });
    expect(fake.addChildren).toHaveBeenCalledWith(
      "s1",
      "A",
      ideas()
    );
  });

  test("sends the assembled context and ends on the instruction", async () => {
    await expandNode("s1", "A");

    expect(fake.completion).toHaveBeenCalledWith(
      [
        { role: "user", content: "Root prompt" },
        { role: "assistant", content: "Idea A" },
        { role: "user", content: INSTRUCTION }
      ],
      { model: MODEL, timeoutMs: TIMEOUT_MS }
    );
  });

  test("ends on the instruction when the target is the root", async () => {
    await expandNode("s1", "R");

    const [messages] = fake.completion.mock.calls[0];
    expect(messages).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "user", content: INSTRUCTION }
    ]);
  });

  test("trims each idea before it is written", async () => {
    fake.completion = answerWith({
      ideas: ideas().map((idea) => `  ${idea}\n`)
    });

    await expandNode("s1", "A");

    expect(fake.addChildren.mock.calls[0][2]).toEqual(ideas());
  });

  test.each([
    ["prose", "Here are some ideas: one, two, three"],
    ["an empty answer", ""],
    ["JSON without ideas", { suggestions: ideas() }],
    ["too few ideas", { ideas: ideas(CHILD_COUNT - 1) }],
    ["too many ideas", { ideas: ideas(CHILD_COUNT + 1) }],
    [
      "an empty idea",
      { ideas: [...ideas(CHILD_COUNT - 1), " "] }
    ],
    [
      "a non-string idea",
      { ideas: [...ideas(CHILD_COUNT - 1), 7] }
    ]
  ])(
    "rejects %s with 502 and writes nothing",
    async (_, value) => {
      fake.completion = answerWith(value);

      await expectStatus(expandNode("s1", "A"), 502);
      expect(fake.addChildren).not.toHaveBeenCalled();
    }
  );

  test("answers 404 for a node that is not in the session", async () => {
    await expectStatus(expandNode("s1", "missing"), 404);
    expect(fake.completion).not.toHaveBeenCalled();
  });

  test("answers 404 for a deleted node", async () => {
    fake.inputs.nodes[1].deleted_at = "2026-10-18T11:00:00Z";

    await expectStatus(expandNode("s1", "A"), 404);
    expect(fake.completion).not.toHaveBeenCalled();
  });

  test("answers 504 when Groq times out", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    fake.completion = vi.fn(async () => {
      throw timeout;
    });

    await expectStatus(expandNode("s1", "A"), 504);
    expect(fake.addChildren).not.toHaveBeenCalled();
  });

  test("answers 502 when the Groq request fails", async () => {
    fake.completion = vi.fn(async () => {
      throw new Error("Groq answered 500");
    });

    await expectStatus(expandNode("s1", "A"), 502);
    expect(fake.addChildren).not.toHaveBeenCalled();
  });
});

describe("rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fake.completion = answerWith({ ideas: ideas() });
    fake.addChildren = vi.fn(async () => ({
      nodes: [],
      edges: []
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // A root plus the children of `expansions` earlier expansions,
  // each created `ageMs` before NOW.
  function graphWithExpansions(expansions, ageMs) {
    const createdAt = new Date(NOW - ageMs).toISOString();
    const graph = {
      nodes: [node("R", "Root prompt", createdAt)],
      edges: [],
      preferences: []
    };
    for (let i = 0; i < expansions * CHILD_COUNT; i++) {
      graph.nodes.push(node(`C${i}`, `Child ${i}`, createdAt));
      graph.edges.push(edge("R", `C${i}`));
    }
    return graph;
  }

  test("allows the last expansion inside the limit", async () => {
    fake.inputs = graphWithExpansions(
      RATE_LIMIT_EXPANSIONS - 1,
      0
    );

    await expandNode("s1", "R");

    expect(fake.addChildren).toHaveBeenCalled();
  });

  test("answers 429 once the limit is reached", async () => {
    fake.inputs = graphWithExpansions(RATE_LIMIT_EXPANSIONS, 0);

    await expectStatus(expandNode("s1", "R"), 429);
    expect(fake.completion).not.toHaveBeenCalled();
  });

  test("ignores children created before the window", async () => {
    fake.inputs = graphWithExpansions(
      RATE_LIMIT_EXPANSIONS,
      RATE_LIMIT_WINDOW_MS + 1000
    );

    await expandNode("s1", "R");

    expect(fake.addChildren).toHaveBeenCalled();
  });
});
