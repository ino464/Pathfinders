import { SignIn } from "./sign-in";

export default async function LoginPage({ searchParams }) {
  const { auth_error: authError } = await searchParams;

  return (
    <main>
      <h1>Pathfinders</h1>
      {authError && (
        <p role="alert">Sign-in failed: {authError}</p>
      )}
      <SignIn />
    </main>
  );
}
