"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addPreference,
  createSession,
  deleteSession,
  removePreference,
  renameSession
} from "../../lib/graph-data";

const MAX_IDEA_LENGTH = 500;
const MAX_TITLE_LENGTH = 60;
const MAX_PREFERENCE_LENGTH = 200;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// a uuid field from a form, or null if it isn't a uuid
function readUuid(formData, name) {
  const id = String(formData.get(name) ?? "");
  return UUID.test(id) ? id : null;
}

// makes a session from the opening idea and opens its canvas
export async function createSessionAction(formData) {
  const idea = String(formData.get("idea") ?? "").trim();

  // the browser checks this too, but the server can't trust it
  if (idea === "" || idea.length > MAX_IDEA_LENGTH) return;

  // the idea is the root node, its start is the session title
  const { session } = await createSession(
    idea,
    idea.slice(0, MAX_TITLE_LENGTH)
  );

  // redirect throws, so keep it outside any try/catch
  redirect(`/sessions/${session.id}`);
}

// renames a session and reloads the list
export async function renameSessionAction(formData) {
  const id = readUuid(formData, "id");
  const title = String(formData.get("title") ?? "").trim();
  if (!id || title === "" || title.length > MAX_TITLE_LENGTH) {
    return;
  }

  await renameSession(id, title);
  revalidatePath("/");
}

// soft deletes a session and reloads the list
export async function deleteSessionAction(formData) {
  const id = readUuid(formData, "id");
  if (!id) return;

  await deleteSession(id);
  revalidatePath("/");
}

// adds a preference to a session and reloads its page
export async function addPreferenceAction(formData) {
  const sessionId = readUuid(formData, "sessionId");
  const content = String(formData.get("content") ?? "").trim();
  if (
    !sessionId ||
    content === "" ||
    content.length > MAX_PREFERENCE_LENGTH
  ) {
    return;
  }

  await addPreference(sessionId, content);
  revalidatePath(`/sessions/${sessionId}`);
}

// removes a preference from a session and reloads its page
export async function removePreferenceAction(formData) {
  const sessionId = readUuid(formData, "sessionId");
  const id = readUuid(formData, "id");
  if (!sessionId || !id) return;

  await removePreference(id);
  revalidatePath(`/sessions/${sessionId}`);
}
