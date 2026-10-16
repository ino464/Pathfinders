"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";

export function MergeNotice() {
  const { mergeError, retryMerge, dismissMergeError } =
    useAuth();
  const [busy, setBusy] = useState(false);

  if (!mergeError) return null;

  async function handleRetry() {
    setBusy(true);
    await retryMerge();
    setBusy(false);
  }

  return (
    <div role="alert" data-testid="merge-notice">
      <p>
        Your guest work could not be moved into your account:{" "}
        {mergeError}
      </p>
      <button
        type="button"
        onClick={handleRetry}
        disabled={busy}>
        Try again
      </button>
      <button
        type="button"
        onClick={dismissMergeError}
        disabled={busy}>
        Dismiss
      </button>
    </div>
  );
}
