import { readFileSync } from "node:fs";
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
  BASE_INSTRUCTION,
  CHILD_COUNT,
  MAX_IDEA_LENGTH,
  MODEL,
  RATE_LIMIT_EXPANSIONS,
  RATE_LIMIT_WINDOW_MS,
  TIMEOUT_MS,
  buildInstruction,
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

const part2 = (...contents) =>
  [
    "These ideas already branch from the last message, so do not repeat them:",
    ...contents.map((c) => `- ${c}`)
  ].join("\n");

const part3 = (direction) =>
  `The user wants this direction: ${direction}\n` +
  "Follow it, but keep the answer format above.";

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
        { role: "user", content: BASE_INSTRUCTION }
      ],
      { model: MODEL, timeoutMs: TIMEOUT_MS }
    );
  });

  test("ends on the instruction when the target is the root", async () => {
    await expandNode("s1", "R");

    const [messages] = fake.completion.mock.calls[0];
    expect(messages).toEqual([
      { role: "user", content: "Root prompt" },
      {
        role: "user",
        content: `${BASE_INSTRUCTION}\n\n${part2("Idea A")}`
      }
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
    ],
    [
      "an idea of 301 characters (case 8)",
      {
        ideas: [...ideas(CHILD_COUNT - 1), "x".repeat(301)]
      }
    ],
    [
      "two ideas equal ignoring case (case 8)",
      {
        ideas: [
          "Go hiking",
          "go hiking",
          ...ideas(CHILD_COUNT - 2)
        ]
      }
    ],
    [
      "two ideas equal ignoring case and surrounding whitespace",
      {
        ideas: [
          "Go hiking",
          " go HIKING ",
          ...ideas(CHILD_COUNT - 2)
        ]
      }
    ]
  ])(
    "rejects %s with 502 and writes nothing",
    async (_, value) => {
      fake.completion = answerWith(value);

      await expectStatus(expandNode("s1", "A"), 502);
      expect(fake.addChildren).not.toHaveBeenCalled();
    }
  );

  test("limits an idea to 300 characters", () => {
    expect(MAX_IDEA_LENGTH).toBe(300);
  });

  test("accepts an idea of exactly 300 characters after trimming", async () => {
    const longest = "x".repeat(300);
    fake.completion = answerWith({
      ideas: [...ideas(CHILD_COUNT - 1), `  ${longest}  `]
    });

    await expandNode("s1", "A");

    expect(fake.addChildren).toHaveBeenCalledWith("s1", "A", [
      ...ideas(CHILD_COUNT - 1),
      longest
    ]);
  });

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

describe("buildInstruction (#52)", () => {
  const twoChildren = () => [
    node("C1", "Child one", "2026-10-18T10:00:01Z"),
    node("C2", "Child two", "2026-10-18T10:00:02Z")
  ];

  test("case 1: is only part 1 with no children and no direction", () => {
    expect(buildInstruction([], "")).toBe(BASE_INSTRUCTION);
  });

  test("case 2: lists live children in created_at order", () => {
    const children = twoChildren().reverse();

    expect(buildInstruction(children, "")).toBe(
      `${BASE_INSTRUCTION}\n\n${part2("Child one", "Child two")}`
    );
  });

  test("case 3: leaves a deleted child out", () => {
    const children = twoChildren();
    children[0].deleted_at = "2026-10-18T11:00:00Z";

    expect(buildInstruction(children, "")).toBe(
      `${BASE_INSTRUCTION}\n\n${part2("Child two")}`
    );
  });

  test("case 3: drops part 2 when every child is deleted", () => {
    const children = twoChildren().map((c) => ({
      ...c,
      deleted_at: "2026-10-18T11:00:00Z"
    }));

    expect(buildInstruction(children, "")).toBe(
      BASE_INSTRUCTION
    );
  });

  test("case 4: adds the trimmed direction after part 1", () => {
    expect(buildInstruction([], "  cheaper options  ")).toBe(
      `${BASE_INSTRUCTION}\n\n${part3("cheaper options")}`
    );
  });

  test("case 5: puts part 1, the children and the direction in that order", () => {
    expect(
      buildInstruction(twoChildren(), "cheaper options")
    ).toBe(
      `${BASE_INSTRUCTION}\n\n` +
        `${part2("Child one", "Child two")}\n\n` +
        part3("cheaper options")
    );
  });

  test.each([
    ["an empty", ""],
    ["a blank", "   "]
  ])(
    "case 6: treats %s direction as no direction",
    (_, direction) => {
      expect(buildInstruction([], direction)).toBe(
        BASE_INSTRUCTION
      );
    }
  );

  test("case 10: lists the 20 newest of 25 live children, oldest first", () => {
    const children = Array.from({ length: 25 }, (_, i) =>
      node(
        `C${String(i).padStart(2, "0")}`,
        `Child ${i}`,
        new Date(NOW - (25 - i) * 1000).toISOString()
      )
    ).reverse();

    const expected = Array.from(
      { length: 20 },
      (_, i) => `Child ${i + 5}`
    );
    expect(buildInstruction(children, "")).toBe(
      `${BASE_INSTRUCTION}\n\n${part2(...expected)}`
    );
  });

  test("case 11: collapses a newline in child content to one space", () => {
    const children = [
      node("C1", "Walk\n- Drive", "2026-10-18T10:00:01Z")
    ];

    expect(buildInstruction(children, "")).toBe(
      `${BASE_INSTRUCTION}\n\n${part2("Walk - Drive")}`
    );
  });

  test("rule 4: orders children with the same created_at by id", () => {
    const at = "2026-10-18T10:00:01Z";
    const children = [
      node("b", "Second", at),
      node("a", "First", at)
    ];

    expect(buildInstruction(children, "")).toBe(
      `${BASE_INSTRUCTION}\n\n${part2("First", "Second")}`
    );
  });

  test("rule 4: breaks a created_at tie by id when choosing the 20 newest", () => {
    const at = "2026-10-18T10:00:01Z";
    const children = Array.from({ length: 21 }, (_, i) =>
      node(`C${String(i).padStart(2, "0")}`, `Child ${i}`, at)
    );

    const expected = Array.from(
      { length: 20 },
      (_, i) => `Child ${i + 1}`
    );
    expect(buildInstruction(children, "")).toBe(
      `${BASE_INSTRUCTION}\n\n${part2(...expected)}`
    );
  });

  test("rule 5: collapses whitespace runs in the direction to one space", () => {
    expect(
      buildInstruction([], "cheaper\n\n  options\tnow")
    ).toBe(
      `${BASE_INSTRUCTION}\n\n${part3("cheaper options now")}`
    );
  });

  test("rule 5: collapses whitespace runs in child content to one space", () => {
    const children = [
      node("C1", "Take   the\t\ttrain", "2026-10-18T10:00:01Z")
    ];

    expect(buildInstruction(children, "")).toBe(
      `${BASE_INSTRUCTION}\n\n${part2("Take the train")}`
    );
  });

  describe("decision 10: matches docs/expansion-instruction.md", () => {
    const doc = readFileSync(
      new URL(
        "../../../docs/expansion-instruction.md",
        import.meta.url
      ),
      "utf8"
    );

    const blocks = doc
      .split(/^### Part/m)
      .slice(1)
      .map((section) => {
        const match = section.match(/```text\n([\s\S]*?)\n```/);
        return match[1];
      });

    test("the doc has three part blocks", () => {
      expect(blocks).toHaveLength(3);
    });

    test("BASE_INSTRUCTION equals the part 1 block", () => {
      expect(BASE_INSTRUCTION).toBe(blocks[0]);
    });

    test("builds the same text as the doc for two children and a direction", () => {
      const [first, second, third] = blocks;
      const childLines = (contents) =>
        second
          .split("\n")
          .flatMap((line) =>
            line.includes("{child}")
              ? contents.map((c) => line.replace("{child}", c))
              : [line]
          )
          .join("\n");
      const expected = [
        first,
        childLines(["Child one", "Child two"]),
        third.replace("{direction}", "cheaper options")
      ].join("\n\n");

      expect(
        buildInstruction(twoChildren(), "cheaper options")
      ).toBe(expected);
    });
  });
});

describe("expandNode instruction (#52)", () => {
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

  function graphWithGrandchildren() {
    return {
      nodes: [
        node("R", "Root prompt", "2026-10-18T10:00:00Z"),
        node("A", "Idea A", "2026-10-18T10:00:01Z"),
        node("S", "Sibling S", "2026-10-18T10:00:02Z"),
        node("B", "Idea B", "2026-10-18T10:00:03Z"),
        node(
          "D",
          "Idea D",
          "2026-10-18T10:00:04Z",
          "2026-10-18T11:00:00Z"
        )
      ],
      edges: [
        edge("R", "A"),
        edge("R", "S"),
        edge("A", "B"),
        edge("A", "D")
      ],
      preferences: []
    };
  }

  test("rule 1: sends the context then one message listing the target's live children", async () => {
    fake.inputs = graphWithGrandchildren();

    await expandNode("s1", "A");

    const [messages] = fake.completion.mock.calls[0];
    expect(messages).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "assistant", content: "Idea A" },
      {
        role: "user",
        content: `${BASE_INSTRUCTION}\n\n${part2("Idea B")}`
      }
    ]);
  });

  test("rule 1: adds the direction to the same trailing message", async () => {
    fake.inputs = graphWithGrandchildren();

    await expandNode("s1", "A", "cheaper options");

    const [messages] = fake.completion.mock.calls[0];
    expect(messages).toHaveLength(3);
    expect(messages[2]).toEqual({
      role: "user",
      content:
        `${BASE_INSTRUCTION}\n\n${part2("Idea B")}\n\n` +
        part3("cheaper options")
    });
  });

  test("case 6: an empty direction sends the same message as none", async () => {
    fake.inputs = smallGraph();

    await expandNode("s1", "A", "");

    const [messages] = fake.completion.mock.calls[0];
    expect(messages.at(-1)).toEqual({
      role: "user",
      content: BASE_INSTRUCTION
    });
  });

  test("case 9: sends the root and then the part 1 message for a root target", async () => {
    fake.inputs = {
      nodes: [node("R", "Root prompt", "2026-10-18T10:00:00Z")],
      edges: [],
      preferences: []
    };

    await expandNode("s1", "R");

    const [messages] = fake.completion.mock.calls[0];
    expect(messages).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "user", content: BASE_INSTRUCTION }
    ]);
  });

  test("rule 11: never passes the direction to addChildren", async () => {
    fake.inputs = smallGraph();

    await expandNode("s1", "A", "cheaper options");

    expect(fake.addChildren).toHaveBeenCalledTimes(1);
    expect(fake.addChildren).toHaveBeenCalledWith(
      "s1",
      "A",
      ideas()
    );
  });
});
