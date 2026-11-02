"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-provider";
import { SignOutButton } from "../current-user";
import { GuestUpgrade } from "../guest-upgrade";
import { MergeNotice } from "../merge-notice";
import { linkedProviders } from "../../lib/linked-providers";

// Shows who is signed in and how. A guest gets the upgrade
// instead of sign out, because a guest who signs out cannot get
// back in (docs/auth.md).
export function AccountDetails() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <p>Loading…</p>;

  const providers = linkedProviders(user);

  return (
    <>
      <MergeNotice />
      <dl>
        <dt>Signed in as</dt>
        <dd data-testid="account-identity">
          {user.is_anonymous ? "Guest" : user.email}
        </dd>
        <dt>Sign-in methods</dt>
        <dd>
          {providers.length === 0 ? (
            "None. Your work is saved only in this browser."
          ) : (
            <ul>
              {providers.map((provider) => (
                <li key={provider}>{provider}</li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
      {user.is_anonymous ? <GuestUpgrade /> : <SignOutButton />}
    </>
  );
}
