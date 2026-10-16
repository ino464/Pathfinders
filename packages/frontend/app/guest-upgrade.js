"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";
import { EmailForm } from "./email-form";

export function GuestUpgrade() {
  const { addEmailToGuest, linkGoogleToGuest } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      await linkGoogleToGuest();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <p>Create an account to save your work.</p>
        <button type="button" onClick={handleGoogle} disabled={busy}>
          Save with Google
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={busy}
        >
          Save with email
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
      onCancel={() => setOpen(false)}
    />
  );
}
