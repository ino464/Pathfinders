import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from "vitest";

const fake = vi.hoisted(() => {
  class ExpandError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  return { ExpandError, expand: null };
});

vi.mock("../lib/expand", () => ({
  ExpandError: fake.ExpandError,
  expandNode: (...args) => fake.expand(...args)
}));

const { POST } = await import("../app/api/expand/route");

const SESSION = "11111111-1111-4111-8111-111111111111";
const NODE = "22222222-2222-4222-8222-222222222222";

function post(body) {
  return POST(
    new Request("http://localhost/api/expand", {
      method: "POST",
      body:
        typeof body === "string" ? body : JSON.stringify(body)
    })
  );
}

describe("POST /api/expand", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fake.expand = vi.fn(async () => ({
      nodes: [{ id: "c1" }],
      edges: [{ id: "e1" }]
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("answers 201 with the new children", async () => {
    const response = await post({
      sessionId: SESSION,
      nodeId: NODE
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      nodes: [{ id: "c1" }],
      edges: [{ id: "e1" }]
    });
    expect(fake.expand).toHaveBeenCalledWith(SESSION, NODE, "");
  });

  test("answers 400 when the body is not JSON", async () => {
    const response = await post("not json");

    expect(response.status).toBe(400);
    expect(fake.expand).not.toHaveBeenCalled();
  });

  test.each([
    ["a missing nodeId", { sessionId: SESSION }],
    [
      "a session id that is not a UUID",
      { sessionId: "s1", nodeId: NODE }
    ],
    [
      "a node id that is not a string",
      { sessionId: SESSION, nodeId: 7 }
    ]
  ])("answers 400 for %s", async (_, body) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(fake.expand).not.toHaveBeenCalled();
  });

  test("answers with the status and message of an expand error", async () => {
    fake.expand = vi.fn(async () => {
      throw new fake.ExpandError(429, "Too many expansions.");
    });

    const response = await post({
      sessionId: SESSION,
      nodeId: NODE
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "Too many expansions."
    });
  });

  test("answers 500 without details for any other error", async () => {
    fake.expand = vi.fn(async () => {
      throw new Error("secret detail");
    });

    const response = await post({
      sessionId: SESSION,
      nodeId: NODE
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "The expansion failed."
    });
  });
});

describe("POST /api/expand direction (#52)", () => {
  beforeEach(() => {
    fake.expand = vi.fn(async () => ({ nodes: [], edges: [] }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each([
    ["a number", 7],
    ["an object", { text: "cheaper options" }],
    ["an array", ["cheaper options"]],
    ["a boolean", true],
    [
      "a string of 501 characters after trimming",
      `  ${"a".repeat(501)}  `
    ]
  ])(
    "case 7: answers 400 for a direction that is %s, without expanding",
    async (_, instruction) => {
      const response = await post({
        sessionId: SESSION,
        nodeId: NODE,
        instruction
      });

      expect(response.status).toBe(400);
      expect(fake.expand).not.toHaveBeenCalled();
    }
  );

  test("rule 8: passes a direction of exactly 500 characters after trimming", async () => {
    const direction = "a".repeat(500);

    const response = await post({
      sessionId: SESSION,
      nodeId: NODE,
      instruction: `   ${direction}   `
    });

    expect(response.status).toBe(201);
    expect(fake.expand).toHaveBeenCalledWith(
      SESSION,
      NODE,
      direction
    );
  });

  test.each([
    ["a missing", {}],
    ["a null", { instruction: null }],
    ["a blank", { instruction: "   " }]
  ])(
    "rule 9: passes an empty direction for %s instruction",
    async (_, extra) => {
      const response = await post({
        sessionId: SESSION,
        nodeId: NODE,
        ...extra
      });

      expect(response.status).toBe(201);
      expect(fake.expand).toHaveBeenCalledWith(
        SESSION,
        NODE,
        ""
      );
    }
  );

  test("passes the trimmed direction to the expansion", async () => {
    const response = await post({
      sessionId: SESSION,
      nodeId: NODE,
      instruction: "  cheaper options  "
    });

    expect(response.status).toBe(201);
    expect(fake.expand).toHaveBeenCalledWith(
      SESSION,
      NODE,
      "cheaper options"
    );
  });
});
