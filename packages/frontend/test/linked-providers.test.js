import { describe, expect, test } from "vitest";
import { linkedProviders } from "../lib/linked-providers";

describe("linkedProviders", () => {
  test("names each linked provider", () => {
    const user = {
      identities: [
        { provider: "email" },
        { provider: "google" }
      ]
    };

    expect(linkedProviders(user)).toEqual([
      "Email and password",
      "Google"
    ]);
  });

  test("lists a provider once when it has two identities", () => {
    const user = {
      identities: [
        { provider: "google" },
        { provider: "google" }
      ]
    };

    expect(linkedProviders(user)).toEqual(["Google"]);
  });

  test("shows an unknown provider by its id", () => {
    const user = { identities: [{ provider: "github" }] };

    expect(linkedProviders(user)).toEqual(["github"]);
  });

  test.each([
    ["a guest", { identities: [] }],
    ["a user without identities", {}],
    ["no user", null]
  ])("returns no providers for %s", (_, user) => {
    expect(linkedProviders(user)).toEqual([]);
  });
});
