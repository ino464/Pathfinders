// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen
} from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ChatPanel } from "../app/chat-panel";

afterEach(cleanup);

describe("ChatPanel", () => {
  test("shows turns, pending work, and a request error", () => {
    render(
      <ChatPanel
        turns={[
          { role: "user", content: "What connects these?" },
          { role: "assistant", content: "They share a goal." }
        ]}
        isPending
        error="The model request failed."
      />
    );

    expect(
      screen.getByText("What connects these?")
    ).toBeTruthy();
    expect(screen.getByText("They share a goal.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(
      "Thinking…"
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "The model request failed."
    );
  });
});
