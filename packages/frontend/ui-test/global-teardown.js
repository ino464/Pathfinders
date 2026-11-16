/* global process */
import { readFile, rm } from "node:fs/promises";
import { createAdminClient } from "./support.js";

async function readGuestIds(file) {
  if (!file) return [];
  const text = await readFile(file, "utf8").catch(() => "");
  return text.split("\n").filter(Boolean);
}

// Deleting the sessions removes their nodes, edges and preferences
// by cascade. Deleting the nodes first can fail: the
// nodes_touch_session trigger updates the session row while it
// still points at a deleted root node, so the
// sessions_root_node_id_fkey check fails.
async function deleteUserAndData(admin, userId) {
  const rows = await admin
    .from("sessions")
    .delete()
    .eq("user_id", userId);
  if (rows.error) return rows.error;

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
