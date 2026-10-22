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
    expect(fake.expand).toHaveBeenCalledWith(SESSION, NODE);
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
  test.todo(
    "case 7: answers 400 for a direction that is not a string or is over 500 characters, without expanding"
  );
  test.todo(
    "rule 6: accepts a direction of 500 characters after trimming surrounding spaces"
  );
  test.todo(
    "rule 7: expands a request with no instruction field as one with an empty direction"
  );
});
