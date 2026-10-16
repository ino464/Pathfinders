"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";
import { AuthChoice } from "./auth-choice";
import { GuestUpgrade } from "./guest-upgrade";

export function CurrentUser() {
  const { user, loading, signOut } = useAuth();
  const [error, setError] = useState(null);

  if (loading) return <p>Loading…</p>;
  if (!user) return <AuthChoice />;

  async function handleSignOut() {
    setError(null);
    try {
      await signOut();
    } catch (err) {
      setError(err.message);
    }
  }

  if (user.is_anonymous) {
    return (
      <div>
        <p>
          You are using Pathfinders as a guest (
          <code data-testid="user-id">{user.id}</code>).
        </p>
        <GuestUpgrade />
      </div>
    );
  }

  return (
    <div>
      <p>
        Signed in as <span data-testid="user-email">{user.email}</span>
      </p>
      <button type="button" onClick={handleSignOut}>
        Sign out
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
