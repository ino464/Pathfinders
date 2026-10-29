import { CurrentUser } from "./current-user";
import { SessionGraph } from "./session-graph";
import {
  getLatestSession,
  getSessionGraph
} from "../lib/graph-data";

export default async function Home() {
  const session = await getLatestSession();
  const graph = session
    ? await getSessionGraph(session.id)
    : { nodes: [], edges: [] };

  return (
    <main>
      <h1>Pathfinders</h1>
      {session ? (
        <SessionGraph graph={graph} />
      ) : (
        <p role="status">
          No brainstorming session yet. Create one to start
          expanding ideas.
        </p>
      )}
      <CurrentUser />
    </main>
  );
}
