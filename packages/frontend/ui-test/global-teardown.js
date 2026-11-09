/* global process */
import { readFile, rm } from "node:fs/promises";
import { createAdminClient } from "./support.js";

async function readGuestIds(file) {
  if (!file) return [];
  const text = await readFile(file, "utf8").catch(() => "");
  return text.split("\n").filter(Boolean);
}

async function deleteUserAndData(admin, userId) {
  const { data: sessions, error } = await admin
    .from("sessions")
    .select("id")
    .eq("user_id", userId);
  if (error) return error;

  const sessionIds = sessions.map((session) => session.id);
  if (sessionIds.length > 0) {
    const preferences = await admin
      .from("preferences")
      .delete()
      .in("session_id", sessionIds);
    if (preferences.error) return preferences.error;

    const nodes = await admin
      .from("nodes")
      .delete()
      .in("session_id", sessionIds);
    if (nodes.error) return nodes.error;

    const rows = await admin
      .from("sessions")
      .delete()
      .in("id", sessionIds);
    if (rows.error) return rows.error;
  }

  const user = await admin.auth.admin.deleteUser(userId);
  return user.error;
}

export default async function globalTeardown() {
  const admin = createAdminClient();
  const guestFile = process.env.UI_TEST_GUEST_FILE;
  const ids = [
    process.env.UI_TEST_USER_ID,
    ...(await readGuestIds(guestFile))
  ].filter(Boolean);

  const failures = [];
  for (const id of new Set(ids)) {
    const error = await deleteUserAndData(admin, id);
    if (error) failures.push(`${id}: ${error.message}`);
  }
  if (guestFile) await rm(guestFile, { force: true });

  if (failures.length > 0) {
    throw new Error(
      `Could not delete UI test users:\n${failures.join("\n")}`
    );
  }
}
