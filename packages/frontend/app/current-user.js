"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";
import { AuthChoice } from "./auth-choice";
import { GuestUpgrade } from "./guest-upgrade";
import { MergeNotice } from "./merge-notice";

function GuestView({ user }) {
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

function AccountView({ user }) {
  const { signOut } = useAuth();
  const [error, setError] = useState(null);

  async function handleSignOut() {
    setError(null);
    try {
      await signOut();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <p>
        Signed in as{" "}
        <span data-testid="user-email">{user.email}</span>
      </p>
      <button type="button" onClick={handleSignOut}>
        Sign out
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function CurrentUser() {
  const { user, loading } = useAuth();

  if (loading) return <p>Loading…</p>;

  return (
    <>
      <MergeNotice />
      {!user ? (
        <AuthChoice />
      ) : user.is_anonymous ? (
        <GuestView user={user} />
      ) : (
        <AccountView user={user} />
      )}
    </>
  );
}
