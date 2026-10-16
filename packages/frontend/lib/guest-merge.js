/* global process */
import "server-only";
import { cookies } from "next/headers";
import { createClient } from "./supabase-server";
import { createAdminClient } from "./supabase-admin";

export const MERGE_COOKIE = "pf_merge_from";

export async function startGuestMerge() {
  const supabase = await createClient();

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user?.is_anonymous) {
    throw new Error("Only a guest can carry work into an account.");
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (session?.user?.id !== user.id) {
    throw new Error("Could not read the guest session.");
  }

  const cookieStore = await cookies();
  cookieStore.set(MERGE_COOKIE, session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600
  });
}

export async function finishGuestMerge() {
  const cookieStore = await cookies();
  const guestToken = cookieStore.get(MERGE_COOKIE)?.value;
  if (!guestToken) return { merged: false, movedSessions: 0 };
  cookieStore.delete(MERGE_COOKIE);

  const supabase = await createClient();
  const {
    data: { user: account },
    error: accountError
  } = await supabase.auth.getUser();
  if (accountError) throw accountError;
  if (!account || account.is_anonymous) {
    throw new Error("Sign in to an account before merging.");
  }

  const admin = createAdminClient();
  const {
    data: { user: guest },
    error: guestError
  } = await admin.auth.getUser(guestToken);
  if (guestError) throw guestError;
  if (!guest.is_anonymous || guest.id === account.id) {
    return { merged: false, movedSessions: 0 };
  }

  const { data: moved, error: moveError } = await admin
    .from("sessions")
    .update({ user_id: account.id })
    .eq("user_id", guest.id)
    .select("id");
  if (moveError) throw moveError;

  const { error: deleteError } = await admin.auth.admin.deleteUser(
    guest.id
  );
  if (deleteError) throw deleteError;

  return { merged: true, movedSessions: moved.length };
}
