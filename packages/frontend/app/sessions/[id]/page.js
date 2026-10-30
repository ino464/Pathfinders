import Link from "next/link";
import { notFound } from "next/navigation";
import { CurrentUser } from "../../current-user";
import { SessionGraph } from "../../session-graph";
import {
  getSession,
  getSessionGraph
} from "../../../lib/graph-data";

// a session id is a uuid, anything else is not found
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// shows one session's canvas, or a 404 if it isn't yours
export default async function SessionPage({ params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  // null if missing, deleted, or someone else's
  const session = await getSession(id);
  if (!session) notFound();

  const graph = await getSessionGraph(session.id);

  return (
    <main>
      <Link href="/">All sessions</Link>
      <h1>{session.title ?? "Untitled session"}</h1>
      {/* key resets the canvas for a new session */}
      <SessionGraph
        key={session.id}
        graph={graph}
        sessionId={session.id}
      />
      <CurrentUser />
    </main>
  );
}
