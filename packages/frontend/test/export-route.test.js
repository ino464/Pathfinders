import { beforeEach, describe, expect, test, vi } from "vitest";

const fake = vi.hoisted(() => ({
  session: null,
  getExpansionInputs: null
}));

vi.mock("../lib/graph-data", () => ({
  getSession: async () => fake.session,
  getExpansionInputs: (...args) =>
    fake.getExpansionInputs(...args)
}));

const { GET } =
  await import("../app/sessions/[id]/export/route");

const SESSION = "11111111-1111-4111-8111-111111111111";

function get(id) {
  return GET(
    new Request(`http://localhost/sessions/${id}/export`),
    { params: Promise.resolve({ id }) }
  );
}

describe("GET /sessions/[id]/export", () => {
  beforeEach(() => {
    fake.session = {
      id: SESSION,
      title: "Trip ideas",
      root_node_id: "a"
    };
    fake.getExpansionInputs = vi.fn(async () => ({
      nodes: [
        {
          id: "a",
          content: "root",
          status: "pending",
          created_at: "2026-11-01T10:00:00+00:00",
          deleted_at: null
        }
      ],
      edges: [],
      preferences: []
    }));
  });

  test("returns 404 for an id that is not a UUID", async () => {
    const response = await get("not-a-uuid");

    expect(response.status).toBe(404);
    expect(fake.getExpansionInputs).not.toHaveBeenCalled();
  });

  test("returns 404 when the session is not the user's", async () => {
    fake.session = null;

    const response = await get(SESSION);

    expect(response.status).toBe(404);
    expect(fake.getExpansionInputs).not.toHaveBeenCalled();
  });

  test("downloads the session as a JSON file", async () => {
    const response = await get(SESSION);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json"
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="trip-ideas.pathfinders.json"'
    );
    expect(fake.getExpansionInputs).toHaveBeenCalledWith(
      SESSION
    );

    const file = await response.json();
    expect(file.format).toBe("pathfinders-session");
    expect(file.session).toEqual({
      title: "Trip ideas",
      rootNodeId: "a"
    });
    expect(file.nodes.map((n) => n.id)).toEqual(["a"]);
  });
});
