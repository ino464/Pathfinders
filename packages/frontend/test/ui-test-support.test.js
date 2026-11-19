import { expect, test } from "vitest";
import { recordGuest } from "../ui-test/support.js";

test("reports an error when the guest ID cannot be recorded", async () => {
  const notice = {
    textContent: async () =>
      "You are using Pathfinders as a guest"
  };

  await expect(recordGuest(notice)).rejects.toThrow(
    "Could not find the guest user ID"
  );
});
