import { afterEach, describe, expect, test, vi } from "vitest";
import { requestExpansion } from "../lib/expand-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestExpansion", () => {
  test("posts the selected node and returns the saved graph pieces", async () => {
    const result = {
      nodes: [{ id: "child-1" }],
      edges: [{ id: "edge-1" }]
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => result
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestExpansion("session-1", "node-1")
    ).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledWith("/api/expand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        nodeId: "node-1"
      })
    });
  });

  test("uses the server error message when expansion is rejected", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      json: async () => ({
        error: "The model did not answer in time."
      })
    }));

    await expect(
      requestExpansion("session-1", "node-1")
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
      requestExpansion("session-1", "node-1")
    ).rejects.toThrow("The expansion failed.");
  });
});
