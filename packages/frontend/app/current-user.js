"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
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

export function SignOutButton() {
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
    <>
      <button type="button" onClick={handleSignOut}>
        Sign out
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

function AccountView({ user }) {
  return (
    <div>
      <p>
        Signed in as{" "}
        <span data-testid="user-email">{user.email}</span>
      </p>
      <SignOutButton />
    </div>
  );
}

export function CurrentUser() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <p>Loading…</p>;

  return (
    <>
      <MergeNotice />
      {user.is_anonymous ? (
        <GuestView user={user} />
      ) : (
        <AccountView user={user} />
      )}
      <Link href="/account">Account</Link>
    </>
  );
}
