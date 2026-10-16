import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({
  start: null,
  finish: null
}));

vi.mock("../lib/guest-merge", () => ({
  startGuestMerge: () => fake.start(),
  finishGuestMerge: () => fake.finish()
}));

const { POST: start } = await import(
  "../app/api/auth/merge/start/route"
);
const { POST: finish } = await import(
  "../app/api/auth/merge/finish/route"
);

describe("merge routes", () => {
  beforeEach(() => {
    fake.start = vi.fn(async () => {});
    fake.finish = vi.fn(async () => ({
      merged: true,
      movedSessions: 3
    }));
  });

  test("start answers 204 when the token is saved", async () => {
    const response = await start();

    expect(response.status).toBe(204);
  });

  test("start answers 400 with the reason when it fails", async () => {
    fake.start = vi.fn(async () => {
      throw new Error("Only a guest can carry work into an account.");
    });

    const response = await start();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Only a guest can carry work into an account."
    });
  });

  test("finish returns the merge result", async () => {
    const response = await finish();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      merged: true,
      movedSessions: 3
    });
  });

  test("finish answers 400 with the reason when it fails", async () => {
    fake.finish = vi.fn(async () => {
      throw new Error("update failed");
    });

    const response = await finish();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "update failed" });
  });
});
