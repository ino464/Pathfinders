import { CurrentUser } from "./current-user";
import { SessionGraph } from "./session-graph";

export default function Home() {
  return (
    <main>
      <h1>Pathfinders</h1>
      <SessionGraph />
      <CurrentUser />
    </main>
  );
}
