"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";

export function AuthChoice() {
  const { continueAsGuest } = useAuth();
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

  return (
    <section data-testid="auth-choice">
      <h2>Get started</h2>
      <button type="button" onClick={handleGuest} disabled={busy}>
        Continue as guest
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
