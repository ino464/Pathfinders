import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const fake = vi.hoisted(() => ({
  claims: null,
  refreshedCookie: null
}));

vi.mock("../lib/supabase-env", () => ({
  supabaseUrl: "http://127.0.0.1:54321",
  supabasePublishableKey: "publishable"
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url, _key, { cookies }) => ({
    auth: {
      getClaims: async () => {
        if (fake.refreshedCookie) {
          cookies.setAll([fake.refreshedCookie], {});
        }
        return {
          data: fake.claims ? { claims: fake.claims } : null
        };
      }
    }
  })
}));

const { proxy } = await import("../proxy");

async function visit(path) {
  return proxy(new NextRequest(`http://localhost:3000${path}`));
}

function redirectedTo(response) {
  const location = response.headers.get("location");
  return location && new URL(location).pathname;
}

describe("proxy", () => {
  beforeEach(() => {
    fake.claims = null;
    fake.refreshedCookie = null;
  });

  test("sends a visitor with no session to /login", async () => {
    const response = await visit("/");

    expect(response.status).toBe(307);
    expect(redirectedTo(response)).toBe("/login");
  });

  test("protects other app pages too", async () => {
    const response = await visit("/set-password");

    expect(redirectedTo(response)).toBe("/login");
  });

  test("shows /login to a visitor with no session", async () => {
    const response = await visit("/login");

    expect(redirectedTo(response)).toBeNull();
  });

  test("lets a signed-in user open the app", async () => {
    fake.claims = { sub: "user-1" };

    const response = await visit("/");

    expect(redirectedTo(response)).toBeNull();
  });

  test("sends a signed-in user from /login to the app", async () => {
    fake.claims = { sub: "user-1", is_anonymous: true };

    const response = await visit("/login");

    expect(redirectedTo(response)).toBe("/");
  });

  test("leaves the auth callback and API routes alone", async () => {
    expect(
      redirectedTo(await visit("/auth/callback?code=abc"))
    ).toBeNull();
    expect(
      redirectedTo(await visit("/api/auth/merge/finish"))
    ).toBeNull();
  });

  test("keeps refreshed session cookies on a redirect", async () => {
    fake.claims = { sub: "user-1" };
    fake.refreshedCookie = {
      name: "sb-access",
      value: "new-token",
      options: { path: "/" }
    };

    const response = await visit("/login");

    expect(redirectedTo(response)).toBe("/");
    expect(response.cookies.get("sb-access")?.value).toBe(
      "new-token"
    );
  });
});
