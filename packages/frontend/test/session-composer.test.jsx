// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SessionComposer } from "../app/session-composer";

afterEach(cleanup);

function renderComposer(overrides = {}) {
  const props = {
    mode: "chat",
    onModeChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides
  };
  render(<SessionComposer {...props} />);
  return props;
}

describe("SessionComposer", () => {
  test("shows the active mode and submits a chat message", () => {
    const { onSubmit } = renderComposer();

    expect(
      screen
        .getByRole("button", { name: "Chat" })
        .getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Send" }).disabled
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Chat message"), {
      target: { value: "How do these relate?" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send" })
    );

    expect(onSubmit).toHaveBeenCalledWith(
      "How do these relate?"
    );
  });

  test("allows an empty brainstorm send", () => {
    const { onSubmit } = renderComposer({ mode: "brainstorm" });

    fireEvent.click(
      screen.getByRole("button", { name: "Send" })
    );

    expect(onSubmit).toHaveBeenCalledWith("");
  });
});
