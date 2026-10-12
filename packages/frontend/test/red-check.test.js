import { expect, test } from "vitest";

test("fails on purpose to verify that CI goes red", () => {
  expect(1 + 1).toBe(3);
});
