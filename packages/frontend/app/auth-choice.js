"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";
import { EmailForm } from "./email-form";

export function AuthChoice({
  title = "Get started",
  allowGuest = true,
  onCancel
}) {
  const {
    user,
    continueAsGuest,
    signInWithEmail,
    signInWithGoogle,
    signUpWithEmail,
    sendPasswordReset
  } = useAuth();
  const [mode, setMode] = useState("choice");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const isGuest = Boolean(user?.is_anonymous);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (mode === "sign-in") {
    return (
      <>
        <EmailForm
          title="Sign in"
          submitLabel="Sign in"
          onSubmit={({ email, password }) =>
            signInWithEmail(email, password)
          }
          onCancel={() => setMode("choice")}
        />
        <button type="button" onClick={() => setMode("forgot")}>
          Forgot password?
        </button>
      </>
    );
  }

  if (mode === "forgot") {
    return (
      <EmailForm
        title="Reset your password"
        submitLabel="Send reset link"
        askPassword={false}
        onSubmit={async ({ email }) => {
          await sendPasswordReset(email);
          return `If ${email} has an account, a link to choose a new password is on its way.`;
        }}
        onCancel={() => setMode("sign-in")}
      />
    );
  }

  if (mode === "sign-up") {
    return (
      <EmailForm
        title="Create an account"
        submitLabel="Create account"
        newPassword
        onSubmit={async ({ email, password }) => {
          const { needsConfirmation } = await signUpWithEmail(
            email,
            password
          );
          if (needsConfirmation) {
            return isGuest
              ? `Check ${email} for a link to confirm your account. Your guest work moves over when you open it.`
              : `Check ${email} for a link to confirm your account.`;
          }
        }}
        onCancel={() => setMode("choice")}
      />
    );
  }

  return (
    <section data-testid="auth-choice">
      <h2>{title}</h2>
      <button
        type="button"
        onClick={() => run(signInWithGoogle)}
        disabled={busy}>
        Continue with Google
      </button>
      <button
        type="button"
        onClick={() => setMode("sign-in")}
        disabled={busy}>
        Sign in with email
      </button>
      <button
        type="button"
        onClick={() => setMode("sign-up")}
        disabled={busy}>
        Create an account
      </button>
      {allowGuest && (
        <button
          type="button"
          onClick={() => run(continueAsGuest)}
          disabled={busy}>
          Continue as guest
        </button>
      )}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}>
          Back
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
