import { describe, expect, test } from "vitest";
import {
  FLAGS,
  NODE_STATUSES,
  nextFlagStatus
} from "../lib/node-status";

describe("nextFlagStatus", () => {
  test.each(["accepted", "rejected"])(
    "sets %s on a node with no flag",
    (clicked) => {
      expect(nextFlagStatus("pending", clicked)).toBe(clicked);
    }
  );

  test.each(["accepted", "rejected"])(
    "clears %s when it is clicked again",
    (status) => {
      expect(nextFlagStatus(status, status)).toBe("pending");
    }
  );

  test("switches from one flag to the other", () => {
    expect(nextFlagStatus("accepted", "rejected")).toBe(
      "rejected"
    );
    expect(nextFlagStatus("rejected", "accepted")).toBe(
      "accepted"
    );
  });
});

describe("FLAGS", () => {
  test("names a flag for every status except pending", () => {
    expect(Object.keys(FLAGS).sort()).toEqual(
      NODE_STATUSES.filter((s) => s !== "pending").sort()
    );
  });
});
