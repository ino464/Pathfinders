import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({
  cookies: null,
  client: null,
  admin: null
}));

vi.mock("next/headers", () => ({
  cookies: async () => fake.cookies
}));

vi.mock("../lib/supabase-server", () => ({
  createClient: async () => fake.client
}));

vi.mock("../lib/supabase-admin", () => ({
  createAdminClient: () => fake.admin
}));

const { MERGE_COOKIE, startGuestMerge, finishGuestMerge } =
  await import("../lib/guest-merge");

const guest = { id: "guest-1", is_anonymous: true };
const account = { id: "account-1", is_anonymous: false };

function fakeCookies(initial = {}) {
  const values = new Map(Object.entries(initial));
  const sets = [];
  return {
    values,
    sets,
    get: (name) =>
      values.has(name) ? { name, value: values.get(name) } : undefined,
    set: (name, value, options) => {
      sets.push({ name, value, options });
      values.set(name, value);
    },
    delete: (name) => values.delete(name)
  };
}

function fakeClient({ user, userError = null, session = null }) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: userError }),
      getSession: async () => ({ data: { session } })
    }
  };
}

function fakeAdmin({
  tokens = {},
  moved = [],
  moveError = null,
  deleteError = null
} = {}) {
  const log = [];
  return {
    log,
    auth: {
      getUser: async (token) => {
        log.push(["getUser", token]);
        const user = tokens[token];
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: new Error("invalid JWT") };
      },
      admin: {
        deleteUser: async (id) => {
          log.push(["deleteUser", id]);
          return { error: deleteError };
        }
      }
    },
    from: (table) => {
      const ops = [];
      const builder = {
        update: (values) => {
          ops.push(["update", values]);
          return builder;
        },
        eq: (column, value) => {
          ops.push(["eq", column, value]);
          return builder;
        },
        select: async (columns) => {
          ops.push(["select", columns]);
          log.push(["from", table, ops]);
          return { data: moveError ? null : moved, error: moveError };
        }
      };
      return builder;
    }
  };
}

describe("startGuestMerge", () => {
  beforeEach(() => {
    fake.cookies = fakeCookies();
  });

  test("saves the guest access token in a short lived httpOnly cookie", async () => {
    fake.client = fakeClient({
      user: guest,
      session: { access_token: "guest-token", user: guest }
    });

    await startGuestMerge();

    expect(fake.cookies.sets).toEqual([
      {
        name: MERGE_COOKIE,
        value: "guest-token",
        options: {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/",
          maxAge: 600
        }
      }
    ]);
  });

  test("refuses when the signed in user is not a guest", async () => {
    fake.client = fakeClient({
      user: account,
      session: { access_token: "account-token", user: account }
    });

    await expect(startGuestMerge()).rejects.toThrow(
      "Only a guest can carry work into an account."
    );
    expect(fake.cookies.sets).toEqual([]);
  });

  test("refuses when nobody is signed in", async () => {
    fake.client = fakeClient({ user: null });

    await expect(startGuestMerge()).rejects.toThrow(
      "Only a guest can carry work into an account."
    );
  });

  test("passes on an error from Supabase", async () => {
    fake.client = fakeClient({
      user: null,
      userError: new Error("Auth session missing")
    });

    await expect(startGuestMerge()).rejects.toThrow(
      "Auth session missing"
    );
  });

  test("refuses when the session does not belong to the verified user", async () => {
    fake.client = fakeClient({
      user: guest,
      session: { access_token: "other-token", user: { id: "someone-else" } }
    });

    await expect(startGuestMerge()).rejects.toThrow(
      "Could not read the guest session."
    );
    expect(fake.cookies.sets).toEqual([]);
  });
});

describe("finishGuestMerge", () => {
  beforeEach(() => {
    fake.cookies = fakeCookies({ [MERGE_COOKIE]: "guest-token" });
    fake.client = fakeClient({ user: account });
    fake.admin = fakeAdmin({
      tokens: { "guest-token": guest },
      moved: [{ id: "s1" }, { id: "s2" }]
    });
  });

  test("does nothing when no merge was started", async () => {
    fake.cookies = fakeCookies();

    await expect(finishGuestMerge()).resolves.toEqual({
      merged: false,
      movedSessions: 0
    });
    expect(fake.admin.log).toEqual([]);
  });

  test("moves the guest's sessions to the account, then deletes the guest", async () => {
    await expect(finishGuestMerge()).resolves.toEqual({
      merged: true,
      movedSessions: 2
    });

    expect(fake.admin.log).toEqual([
      ["getUser", "guest-token"],
      [
        "from",
        "sessions",
        [
          ["update", { user_id: "account-1" }],
          ["eq", "user_id", "guest-1"],
          ["select", "id"]
        ]
      ],
      ["deleteUser", "guest-1"]
    ]);
    expect(fake.cookies.values.has(MERGE_COOKIE)).toBe(false);
  });

  test("refuses when the signed in user is still a guest", async () => {
    fake.client = fakeClient({ user: guest });

    await expect(finishGuestMerge()).rejects.toThrow(
      "Sign in to an account before merging."
    );
    expect(fake.admin.log).toEqual([]);
    expect(fake.cookies.values.has(MERGE_COOKIE)).toBe(false);
  });

  test("refuses a guest token Supabase does not accept", async () => {
    fake.admin = fakeAdmin({ tokens: {} });

    await expect(finishGuestMerge()).rejects.toThrow("invalid JWT");
    expect(fake.admin.log).toEqual([["getUser", "guest-token"]]);
  });

  test("skips when the token user is not a guest", async () => {
    fake.admin = fakeAdmin({
      tokens: { "guest-token": { id: "other", is_anonymous: false } }
    });

    await expect(finishGuestMerge()).resolves.toEqual({
      merged: false,
      movedSessions: 0
    });
    expect(fake.admin.log).toEqual([["getUser", "guest-token"]]);
  });

  test("skips when the guest and the account are the same user", async () => {
    fake.client = fakeClient({ user: { id: "guest-1", is_anonymous: false } });

    await expect(finishGuestMerge()).resolves.toEqual({
      merged: false,
      movedSessions: 0
    });
    expect(fake.admin.log).toEqual([["getUser", "guest-token"]]);
  });

  test("keeps the guest when moving the sessions fails", async () => {
    fake.admin = fakeAdmin({
      tokens: { "guest-token": guest },
      moveError: new Error("update failed")
    });

    await expect(finishGuestMerge()).rejects.toThrow("update failed");
    expect(fake.admin.log.map(([step]) => step)).toEqual([
      "getUser",
      "from"
    ]);
  });
});
