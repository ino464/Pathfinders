import { afterEach, describe, expect, test, vi } from "vitest";
import { requestBrainstorm } from "../lib/expand-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(result) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => result
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock) {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("requestBrainstorm", () => {
  test("posts the selected nodes and returns the saved graph pieces", async () => {
    const result = {
      nodes: [{ id: "child-1" }],
      edges: [{ id: "edge-1" }]
    };
    const fetchMock = stubFetch(result);

    await expect(
      requestBrainstorm("session-1", ["node-1"])
    ).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledWith("/api/expand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        nodeIds: ["node-1"]
      })
    });
  });

  test("sends two nodes and a trimmed instruction", async () => {
    const fetchMock = stubFetch({ nodes: [], edges: [] });

    await requestBrainstorm(
      "session-1",
      ["node-1", "node-2"],
      "  something spicy "
    );

    expect(sentBody(fetchMock)).toEqual({
      sessionId: "session-1",
      nodeIds: ["node-1", "node-2"],
      instruction: "something spicy"
    });
  });

  test("leaves out an empty instruction", async () => {
    const fetchMock = stubFetch({ nodes: [], edges: [] });

    await requestBrainstorm("session-1", ["node-1"], "   ");

    expect(sentBody(fetchMock)).not.toHaveProperty(
      "instruction"
    );
  });

  test("uses the server error message when the brainstorm is refused", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      json: async () => ({
        error: "The model did not answer in time."
      })
    }));

    await expect(
      requestBrainstorm("session-1", ["node-1"])
    ).rejects.toThrow("The model did not answer in time.");
  });

  test("uses a generic message when an error response is not JSON", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      json: async () => {
        throw new Error("not JSON");
      }
    }));

    await expect(
      requestBrainstorm("session-1", ["node-1"])
    ).rejects.toThrow("The expansion failed.");
  });
});
