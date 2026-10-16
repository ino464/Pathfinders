import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({
  client: null,
  finishGuestMerge: null
}));

vi.mock("../lib/supabase-server", () => ({
  createClient: async () => fake.client
}));

vi.mock("../lib/guest-merge", () => ({
  finishGuestMerge: () => fake.finishGuestMerge()
}));

const { GET } = await import("../app/auth/callback/route");

function fakeClient({ exchangeError = null, verifyError = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      exchangeCodeForSession: async (code) => {
        calls.push(["exchangeCodeForSession", code]);
        return { error: exchangeError };
      },
      verifyOtp: async (params) => {
        calls.push(["verifyOtp", params]);
        return { error: verifyError };
      }
    }
  };
}

async function callback(query) {
  const response = await GET(
    new Request(`http://localhost:3000/auth/callback${query}`)
  );
  return new URL(response.headers.get("location"));
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    fake.client = fakeClient();
    fake.finishGuestMerge = vi.fn(async () => ({ merged: false }));
  });

  test("exchanges the code, finishes any merge and goes home", async () => {
    const location = await callback("?code=abc");

    expect(fake.client.calls).toEqual([
      ["exchangeCodeForSession", "abc"]
    ]);
    expect(fake.finishGuestMerge).toHaveBeenCalledOnce();
    expect(location.href).toBe("http://localhost:3000/");
  });

  test("follows a safe next path", async () => {
    const location = await callback("?code=abc&next=/set-password");

    expect(location.href).toBe("http://localhost:3000/set-password");
  });

  test("ignores a next that points at another site", async () => {
    const location = await callback("?code=abc&next=//evil.example");

    expect(location.href).toBe("http://localhost:3000/");
  });

  test("ignores a next that is a full URL", async () => {
    const location = await callback(
      "?code=abc&next=https://evil.example"
    );

    expect(location.href).toBe("http://localhost:3000/");
  });

  test("verifies a token hash link", async () => {
    await callback("?token_hash=th&type=email_change");

    expect(fake.client.calls).toEqual([
      ["verifyOtp", { type: "email_change", token_hash: "th" }]
    ]);
  });

  test("reports a link with no code or token", async () => {
    const location = await callback("");

    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("auth_error")).toBe(
      "Missing code or token in the link."
    );
    expect(fake.finishGuestMerge).not.toHaveBeenCalled();
  });

  test("reports a failed code exchange without merging", async () => {
    fake.client = fakeClient({
      exchangeError: new Error("invalid flow state")
    });

    const location = await callback("?code=abc");

    expect(location.searchParams.get("auth_error")).toBe(
      "invalid flow state"
    );
    expect(fake.finishGuestMerge).not.toHaveBeenCalled();
  });

  test("explains a Google account that already has an account", async () => {
    const location = await callback(
      "?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user"
    );

    expect(fake.client.calls).toEqual([]);
    expect(location.searchParams.get("auth_error")).toContain(
      "I already have an account"
    );
  });

  test("passes on other provider errors", async () => {
    const location = await callback(
      "?error=access_denied&error_description=User+cancelled"
    );

    expect(location.searchParams.get("auth_error")).toBe(
      "User cancelled"
    );
  });

  test("reports a failed merge", async () => {
    fake.finishGuestMerge = vi.fn(async () => {
      throw new Error("update failed");
    });

    const location = await callback("?code=abc");

    expect(location.searchParams.get("auth_error")).toBe(
      "update failed"
    );
  });
});
