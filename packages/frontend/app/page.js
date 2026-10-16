import { CurrentUser } from "./current-user";
import { SessionGraph } from "./session-graph";

export default async function Home({ searchParams }) {
  const { auth_error: authError } = await searchParams;

  return (
    <main>
      <h1>Pathfinders</h1>
      <p>Next.js frontend is ready for development.</p>
      <SessionGraph />
      {authError && (
        <p role="alert">Sign-in failed: {authError}</p>
      )}
      <CurrentUser />
    </main>
  );
}
