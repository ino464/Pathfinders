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
  TWO_NODE_INSTRUCTION,
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

const part4 = (...contents) =>
  [
    "The user set these preferences for the whole session:",
    ...contents.map((c) => `- ${c}`),
    "Every new idea must follow all of them, even where the ideas above do not. Keep the answer format above."
  ].join("\n");

const pref = (id, content, createdAt) => ({
  id,
  content,
  created_at: createdAt
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
      ["A"],
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

    expect(fake.addChildren).toHaveBeenCalledWith(
      "s1",
      ["A"],
      [...ideas(CHILD_COUNT - 1), longest]
    );
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

// Issue #73: the user selects two nodes and the new ideas
// become children of both.
describe("expandNode from two nodes (#73)", () => {
  // R → A and R → B, A → "Child of A", B → "Child of B", and
  // one child "Shared child" that has both A and B as parents.
  function twoSiblingGraph() {
    return {
      nodes: [
        node("R", "Root prompt", "2026-10-18T10:00:00Z"),
        node("A", "Idea A", "2026-10-18T10:00:01Z"),
        node("B", "Idea B", "2026-10-18T10:00:02Z"),
        node("AC", "Child of A", "2026-10-18T10:00:03Z"),
        node("BC", "Child of B", "2026-10-18T10:00:04Z"),
        node("S", "Shared child", "2026-10-18T10:00:05Z")
      ],
      edges: [
        edge("R", "A"),
        edge("R", "B"),
        edge("A", "AC"),
        edge("B", "BC"),
        edge("A", "S"),
        edge("B", "S")
      ],
      preferences: []
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.inputs = twoSiblingGraph();
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

  test("writes the ideas as children of both nodes", async () => {
    await expandNode("s1", ["A", "B"]);

    expect(fake.addChildren).toHaveBeenCalledWith(
      "s1",
      ["A", "B"],
      ideas()
    );
  });

  test("sends the union of both branches as context", async () => {
    await expandNode("s1", ["A", "B"]);

    const [messages] = fake.completion.mock.calls[0];
    expect(messages.slice(0, 3)).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "assistant", content: "Idea A" },
      { role: "assistant", content: "Idea B" }
    ]);
    expect(messages).toHaveLength(4);
    expect(messages[3].role).toBe("user");
  });

  test("lists the children of both nodes once in the do-not-repeat part", async () => {
    await expandNode("s1", ["A", "B"]);

    const [messages] = fake.completion.mock.calls[0];
    expect(messages[3].content).toContain(
      part2("Child of A", "Child of B", "Shared child")
    );
  });

  test("ends on the two-node instruction for two nodes, the base one for one", async () => {
    await expandNode("s1", ["A", "B"]);
    await expandNode("s1", ["A"]);

    const [two, one] = fake.completion.mock.calls.map(
      ([messages]) => messages.at(-1).content
    );
    expect(two.startsWith(TWO_NODE_INSTRUCTION)).toBe(true);
    expect(one.startsWith(BASE_INSTRUCTION)).toBe(true);
  });

  test("a list of one id behaves as a single id", async () => {
    await expandNode("s1", "A");
    await expandNode("s1", ["A"]);

    const [single, listed] = fake.completion.mock.calls;
    expect(listed).toEqual(single);
    expect(fake.addChildren.mock.calls[1]).toEqual(
      fake.addChildren.mock.calls[0]
    );
  });

  test("answers 404 when one node is not in the session", async () => {
    // A node from another session is not in this session's
    // nodes, so it is the same as a missing one.
    await expectStatus(expandNode("s1", ["A", "missing"]), 404);
    expect(fake.completion).not.toHaveBeenCalled();
    expect(fake.addChildren).not.toHaveBeenCalled();
  });

  test("answers 404 when one node is deleted", async () => {
    fake.inputs.nodes[2].deleted_at = "2026-10-18T11:00:00Z";

    await expectStatus(expandNode("s1", ["A", "B"]), 404);
    expect(fake.completion).not.toHaveBeenCalled();
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

  const twoPreferences = () => [
    pref("P2", "Nothing greasy", "2026-10-18T09:00:02Z"),
    pref("P1", "Keep it cheap", "2026-10-18T09:00:01Z")
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

  test("case 12: adds the preferences after part 1, oldest first", () => {
    expect(buildInstruction([], "", twoPreferences())).toBe(
      `${BASE_INSTRUCTION}\n\n${part4("Keep it cheap", "Nothing greasy")}`
    );
  });

  test("case 13: puts the preferences last, after the direction", () => {
    expect(
      buildInstruction(
        twoChildren(),
        "cheaper options",
        twoPreferences()
      )
    ).toBe(
      `${BASE_INSTRUCTION}\n\n` +
        `${part2("Child one", "Child two")}\n\n` +
        `${part3("cheaper options")}\n\n` +
        part4("Keep it cheap", "Nothing greasy")
    );
  });

  test("rule 12: leaves part 4 out when there are no preferences", () => {
    expect(buildInstruction([], "", [])).toBe(BASE_INSTRUCTION);
  });

  test("rule 12: orders preferences with the same created_at by id", () => {
    const preferences = [
      pref("P2", "Second", "2026-10-18T09:00:00Z"),
      pref("P1", "First", "2026-10-18T09:00:00Z")
    ];

    expect(buildInstruction([], "", preferences)).toBe(
      `${BASE_INSTRUCTION}\n\n${part4("First", "Second")}`
    );
  });

  test("rule 5: collapses whitespace runs in a preference to one space", () => {
    const preferences = [
      pref("P1", "No\n- cars  at\tall", "2026-10-18T09:00:00Z")
    ];

    expect(buildInstruction([], "", preferences)).toBe(
      `${BASE_INSTRUCTION}\n\n${part4("No - cars at all")}`
    );
  });

  test("does not change the caller's preference array", () => {
    const preferences = twoPreferences();

    buildInstruction([], "", preferences);

    expect(preferences.map((p) => p.id)).toEqual(["P2", "P1"]);
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
        const match = section.match(
          /```text\r?\n([\s\S]*?)\r?\n```/
        );
        return match[1].replace(/\r\n/g, "\n");
      });

    test("the doc has four part blocks", () => {
      expect(blocks).toHaveLength(4);
    });

    test("BASE_INSTRUCTION equals the part 1 block", () => {
      expect(BASE_INSTRUCTION).toBe(blocks[0]);
    });

    test("builds the same text as the doc for children, a direction and preferences", () => {
      const [first, second, third, fourth] = blocks;
      const repeatLines = (block, placeholder, contents) =>
        block
          .split("\n")
          .flatMap((line) =>
            line.includes(placeholder)
              ? contents.map((c) =>
                  line.replace(placeholder, c)
                )
              : [line]
          )
          .join("\n");
      const expected = [
        first,
        repeatLines(second, "{child}", [
          "Child one",
          "Child two"
        ]),
        third.replace("{direction}", "cheaper options"),
        repeatLines(fourth, "{preference}", [
          "Keep it cheap",
          "Nothing greasy"
        ])
      ].join("\n\n");

      expect(
        buildInstruction(
          twoChildren(),
          "cheaper options",
          twoPreferences()
        )
      ).toBe(expected);
    });
  });
});

// Issue #73: with two selected nodes, Part 1 is replaced by a
// text that does not say "build on the last message". Parts 2 to
// 4 are unchanged.
describe("buildInstruction for two nodes (#73)", () => {
  test("is only the two-node text with no children and no direction", () => {
    expect(buildInstruction([], "", [], 2)).toBe(
      TWO_NODE_INSTRUCTION
    );
  });

  test("a count of one gives the base text", () => {
    expect(buildInstruction([], "", [], 1)).toBe(
      BASE_INSTRUCTION
    );
  });

  test("differs from the base text", () => {
    expect(TWO_NODE_INSTRUCTION).not.toBe(BASE_INSTRUCTION);
  });

  test("keeps parts 2 and 3 after the two-node text", () => {
    const children = [
      node("C1", "Child one", "2026-10-18T10:00:01Z")
    ];

    expect(
      buildInstruction(children, "cheaper options", [], 2)
    ).toBe(
      `${TWO_NODE_INSTRUCTION}\n\n${part2("Child one")}\n\n` +
        part3("cheaper options")
    );
  });

  test("matches the block in docs/expansion-instruction.md", () => {
    const doc = readFileSync(
      new URL(
        "../../../docs/expansion-instruction.md",
        import.meta.url
      ),
      "utf8"
    );
    const match = doc.match(
      /^### Two selected nodes[\s\S]*?```text\r?\n([\s\S]*?)\r?\n```/m
    );

    expect(match).not.toBeNull();
    expect(TWO_NODE_INSTRUCTION).toBe(
      match[1].replace(/\r\n/g, "\n")
    );
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

  test("#102: the trailing message carries the preference text", async () => {
    fake.inputs = {
      ...graphWithGrandchildren(),
      preferences: [
        pref(
          "P1",
          "Nothing that greasy, maybe dessert?",
          "2026-10-18T09:00:00Z"
        )
      ]
    };

    await expandNode("s1", "A");

    const [messages] = fake.completion.mock.calls[0];
    expect(messages[0]).toEqual({
      role: "system",
      content: "Nothing that greasy, maybe dessert?"
    });
    expect(messages.at(-1)).toEqual({
      role: "user",
      content:
        `${BASE_INSTRUCTION}\n\n${part2("Idea B")}\n\n` +
        part4("Nothing that greasy, maybe dessert?")
    });
  });

  test("rule 11: never passes the direction to addChildren", async () => {
    fake.inputs = smallGraph();

    await expandNode("s1", "A", "cheaper options");

    expect(fake.addChildren).toHaveBeenCalledTimes(1);
    expect(fake.addChildren).toHaveBeenCalledWith(
      "s1",
      ["A"],
      ideas()
    );
  });
});
