"use client";

import { useState } from "react";
import { AuthChoice } from "./auth-choice";

export function GuestUpgrade() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Save your work to an account
      </button>
    );
  }

  return (
    <AuthChoice
      title="Save your work"
      allowGuest={false}
      onCancel={() => setOpen(false)}
    />
  );
}
