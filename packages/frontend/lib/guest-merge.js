/* global process */
import "server-only";
import { cookies } from "next/headers";
import { createClient } from "./supabase-server";
import { createAdminClient } from "./supabase-admin";

export const MERGE_COOKIE = "pf_merge_from";
const MERGE_TOKEN_MAX_AGE_SECONDS = 60 * 60;

function rememberMergeToken(cookieStore, token) {
  cookieStore.set(MERGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MERGE_TOKEN_MAX_AGE_SECONDS
  });
}

function forgetMergeToken(cookieStore) {
  cookieStore.delete(MERGE_COOKIE);
}

async function getSignedInUser(supabase) {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

async function requireAccount() {
  const supabase = await createClient();
  const account = await getSignedInUser(supabase);
  if (!account || account.is_anonymous) {
    throw new Error("Sign in to an account before merging.");
  }
  return account;
}

export async function startGuestMerge() {
  const supabase = await createClient();
  const user = await getSignedInUser(supabase);
  if (!user?.is_anonymous) {
    throw new Error(
      "Only a guest can carry work into an account."
    );
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (session?.user?.id !== user.id) {
    throw new Error("Could not read the guest session.");
  }

  const cookieStore = await cookies();
  rememberMergeToken(cookieStore, session.access_token);
}

export async function finishGuestMerge() {
  const cookieStore = await cookies();
  const guestToken = cookieStore.get(MERGE_COOKIE)?.value;
  if (!guestToken) return { merged: false, movedSessions: 0 };

  const account = await requireAccount();

  const admin = createAdminClient();
  const {
    data: { user: guest },
    error: guestError
  } = await admin.auth.getUser(guestToken);
  if (guestError) {
    forgetMergeToken(cookieStore);
    throw new Error(
      "The guest session expired before its work could be moved."
    );
  }
  if (!guest.is_anonymous || guest.id === account.id) {
    forgetMergeToken(cookieStore);
    return { merged: false, movedSessions: 0 };
  }

  const { data: moved, error: moveError } = await admin
    .from("sessions")
    .update({ user_id: account.id })
    .eq("user_id", guest.id)
    .select("id");
  if (moveError) throw moveError;
  forgetMergeToken(cookieStore);

  const { error: deleteError } =
    await admin.auth.admin.deleteUser(guest.id);
  if (deleteError) throw deleteError;

  return { merged: true, movedSessions: moved.length };
}
