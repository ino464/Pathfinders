"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";
import { EmailForm } from "./email-form";

export function GuestUpgrade() {
  const { addEmailToGuest } = useAuth();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Create an account to save your work
      </button>
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
