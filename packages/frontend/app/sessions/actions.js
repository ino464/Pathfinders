"use server";

import { redirect } from "next/navigation";
import { createSession } from "../../lib/graph-data";

const MAX_IDEA_LENGTH = 500;
const MAX_TITLE_LENGTH = 60;

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
