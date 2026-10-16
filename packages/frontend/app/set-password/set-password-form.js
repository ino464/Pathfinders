"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-provider";
import { EmailForm } from "../email-form";

export function SetPasswordForm() {
  const { user, loading, setPassword } = useAuth();
  const router = useRouter();

  if (loading) return <p>Loading…</p>;
  if (!user || user.is_anonymous) {
    return (
      <p>
        Confirm your email first. <Link href="/">Back to Pathfinders</Link>
      </p>
    );
  }

  return (
    <EmailForm
      title={`Choose a password for ${user.email}`}
      submitLabel="Save password"
      askEmail={false}
      onSubmit={async ({ password }) => {
        await setPassword(password);
        router.push("/");
      }}
    />
  );
}
