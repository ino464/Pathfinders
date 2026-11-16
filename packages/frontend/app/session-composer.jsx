"use client";

import { useState } from "react";

const MODES = {
  chat: {
    label: "Chat",
    placeholder: "Ask about the selected ideas"
  },
  brainstorm: {
    label: "Brainstorm",
    placeholder: "Steer the next ideas (optional)"
  }
};

// The session graph owns request handling and can refuse a mode
// change when ending an active chat needs confirmation.
export function SessionComposer({
  mode,
  onModeChange,
  onSubmit,
  isPending = false,
  disabled = false
}) {
  const [message, setMessage] = useState("");
  const currentMode = MODES[mode];

  function submit(event) {
    event.preventDefault();
    if (disabled || isPending) return;

    onSubmit(message);
    setMessage("");
  }

  return (
    <form className="session-composer" onSubmit={submit}>
      <fieldset className="session-composer__modes">
        <legend>Mode</legend>
        {Object.entries(MODES).map(([value, details]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            className="session-composer__mode"
            onClick={() => onModeChange(value)}
            disabled={disabled || isPending}>
            {details.label}
          </button>
        ))}
      </fieldset>
      <label className="session-composer__message">
        <span className="sr-only">
          {currentMode.label} message
        </span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={currentMode.placeholder}
          disabled={disabled || isPending}
          maxLength={1000}
          rows={3}
        />
      </label>
      <button
        className="session-composer__send"
        type="submit"
        disabled={
          disabled ||
          isPending ||
          (mode === "chat" && message.trim() === "")
        }>
        {isPending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
