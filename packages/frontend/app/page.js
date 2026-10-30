import Link from "next/link";
import { CurrentUser } from "./current-user";
import { listSessions } from "../lib/graph-data";
import {
  createSessionAction,
  deleteSessionAction,
  renameSessionAction
} from "./sessions/actions";

export default async function Home() {
  const sessions = await listSessions();

  return (
    <main>
      <h1>Pathfinders</h1>
      <form action={createSessionAction}>
        <label htmlFor="idea">Opening idea</label>
        <input id="idea" name="idea" required maxLength={500} />
        <button type="submit">Start brainstorming</button>
      </form>

      {sessions.length === 0 ? (
        <p role="status">
          No brainstorming session yet. Create one to start
          expanding ideas.
        </p>
      ) : (
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>
              <Link href={`/sessions/${session.id}`}>
                {session.title ?? "Untitled session"}
              </Link>
              <form action={renameSessionAction}>
                <input
                  type="hidden"
                  name="id"
                  value={session.id}
                />
                <input
                  name="title"
                  aria-label="New title"
                  defaultValue={session.title ?? ""}
                  required
                  maxLength={60}
                />
                <button type="submit">Rename</button>
              </form>
              <form action={deleteSessionAction}>
                <input
                  type="hidden"
                  name="id"
                  value={session.id}
                />
                <button type="submit">Delete</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <CurrentUser />
    </main>
  );
}
