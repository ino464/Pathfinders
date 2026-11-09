/* global process */
import { readFile, rm } from "node:fs/promises";
import { createAdminClient } from "./support.js";

async function readGuestIds(file) {
  if (!file) return [];
  const text = await readFile(file, "utf8").catch(() => "");
  return text.split("\n").filter(Boolean);
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
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) failures.push(`${id}: ${error.message}`);
  }
  if (guestFile) await rm(guestFile, { force: true });

  if (failures.length > 0) {
    throw new Error(
      `Could not delete UI test users:\n${failures.join("\n")}`
    );
  }
}
