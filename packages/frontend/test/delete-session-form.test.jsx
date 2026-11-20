// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DeleteSessionForm } from "../app/delete-session-form";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function clickDelete(action) {
  render(
    <DeleteSessionForm
      id="session-1"
      title="Trip ideas"
      action={action}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Delete" })
  );
}

// a session delete cannot be undone, so it asks first (#123)
describe("DeleteSessionForm", () => {
  test("asks before deleting and names the session", () => {
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValue(false);

    clickDelete(vi.fn());

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('"Trip ideas"');
  });

  test("Cancel keeps the session", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const action = vi.fn();

    clickDelete(action);

    // a submitted form action runs after the event, so wait a tick
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(action).not.toHaveBeenCalled();
  });

  test("OK deletes the session", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const action = vi.fn();

    clickDelete(action);

    await waitFor(() =>
      expect(action).toHaveBeenCalledTimes(1)
    );
    expect(action.mock.calls[0][0].get("id")).toBe("session-1");
  });
});
