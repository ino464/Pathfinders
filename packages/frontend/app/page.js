import Link from "next/link";
import { CurrentUser } from "./current-user";
import { listSessions } from "../lib/graph-data";

export default async function Home() {
  const sessions = await listSessions();

  return (
    <main>
      <h1>Pathfinders</h1>
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
            </li>
          ))}
        </ul>
      )}
      <CurrentUser />
    </main>
  );
}
