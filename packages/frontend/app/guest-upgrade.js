"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";
import { EmailForm } from "./email-form";

export function GuestUpgrade() {
  const {
    addEmailToGuest,
    linkGoogleToGuest,
    signInWithEmail,
    signInWithGoogle
  } = useAuth();
  const [mode, setMode] = useState("buttons");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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

  if (mode === "existing-email") {
    return (
      <EmailForm
        title="Sign in and bring your guest work"
        submitLabel="Sign in"
        onSubmit={({ email, password }) =>
          signInWithEmail(email, password)
        }
        onCancel={() => setMode("existing")}
      />
    );
  }

  if (mode === "existing") {
    return (
      <div>
        <p>Sign in to your account. Your guest work moves into it.</p>
        <button
          type="button"
          onClick={() => run(signInWithGoogle)}
          disabled={busy}
        >
          Sign in with Google
        </button>
        <button
          type="button"
          onClick={() => setMode("existing-email")}
          disabled={busy}
        >
          Sign in with email
        </button>
        <button
          type="button"
          onClick={() => setMode("buttons")}
          disabled={busy}
        >
          Back
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  if (mode === "buttons") {
    return (
      <div>
        <p>Create an account to save your work.</p>
        <button
          type="button"
          onClick={() => run(linkGoogleToGuest)}
          disabled={busy}
        >
          Save with Google
        </button>
        <button
          type="button"
          onClick={() => setMode("new-email")}
          disabled={busy}
        >
          Save with email
        </button>
        <button
          type="button"
          onClick={() => setMode("existing")}
          disabled={busy}
        >
          I already have an account
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <EmailForm
      title="Save your work"
      submitLabel="Send confirmation email"
      askPassword={false}
      onSubmit={async ({ email }) => {
        await addEmailToGuest(email);
        return `Check ${email} for a link to confirm it. You will choose a password after that.`;
      }}
      onCancel={() => setMode("buttons")}
    />
  );
}
