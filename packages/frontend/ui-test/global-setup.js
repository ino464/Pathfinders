/* global process */
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { createAdminClient, loadEnv } from "./support.js";

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export default async function globalSetup() {
  loadEnv();
  const admin = createAdminClient();
  const runId = randomUUID().slice(0, 8);
  const email = `ui-test-${runId}@example.com`;
  const password = `ui-test-${randomUUID()}`;
  const sessionTitle = `Returning user idea ${runId}`;

  const { user } = unwrap(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })
  );

  const session = unwrap(
    await admin
      .from("sessions")
      .insert({ user_id: user.id, title: sessionTitle })
      .select()
      .single()
  );
  const rootNode = unwrap(
    await admin
      .from("nodes")
      .insert({ session_id: session.id, content: sessionTitle })
      .select()
      .single()
  );
  unwrap(
    await admin
      .from("sessions")
      .update({ root_node_id: rootNode.id })
      .eq("id", session.id)
  );

  const guestFile = join(
    tmpdir(),
    `pathfinders-ui-${runId}.txt`
  );
  await writeFile(guestFile, "");

  process.env.UI_TEST_USER_ID = user.id;
  process.env.UI_TEST_EMAIL = email;
  process.env.UI_TEST_PASSWORD = password;
  process.env.UI_TEST_SESSION_TITLE = sessionTitle;
  process.env.UI_TEST_GUEST_FILE = guestFile;
}
