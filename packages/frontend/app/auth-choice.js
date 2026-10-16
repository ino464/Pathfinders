"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";
import { EmailForm } from "./email-form";

export function AuthChoice() {
  const { continueAsGuest, signInWithEmail, signUpWithEmail } =
    useAuth();
  const [mode, setMode] = useState("choice");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleGuest() {
    setBusy(true);
    setError(null);
    try {
      await continueAsGuest();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (mode === "sign-in") {
    return (
      <EmailForm
        title="Sign in"
        submitLabel="Sign in"
        onSubmit={({ email, password }) =>
          signInWithEmail(email, password)
        }
        onCancel={() => setMode("choice")}
      />
    );
  }

  if (mode === "sign-up") {
    return (
      <EmailForm
        title="Create an account"
        submitLabel="Create account"
        onSubmit={async ({ email, password }) => {
          const { needsConfirmation } = await signUpWithEmail(
            email,
            password
          );
          if (needsConfirmation) {
            return `Check ${email} for a link to confirm your account.`;
          }
        }}
        onCancel={() => setMode("choice")}
      />
    );
  }

  return (
    <section data-testid="auth-choice">
      <h2>Get started</h2>
      <button type="button" onClick={() => setMode("sign-in")}>
        Sign in with email
      </button>
      <button type="button" onClick={() => setMode("sign-up")}>
        Create an account
      </button>
      <button type="button" onClick={handleGuest} disabled={busy}>
        Continue as guest
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
