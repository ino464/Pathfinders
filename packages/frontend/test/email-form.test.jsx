// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { EmailForm } from "../app/email-form";

afterEach(cleanup);

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "user@example.test" }
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "secret1" }
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Sign in" })
  );
}

describe("EmailForm", () => {
  test("submits the typed email and password", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <EmailForm
        title="Sign in"
        submitLabel="Sign in"
        onSubmit={onSubmit}
      />
    );

    fillAndSubmit();

    expect(onSubmit).toHaveBeenCalledWith({
      email: "user@example.test",
      password: "secret1"
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Sign in" }).disabled
      ).toBe(false)
    );
  });

  test("shows the error when the submit fails", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(
        new Error("Invalid login credentials")
      );
    render(
      <EmailForm
        title="Sign in"
        submitLabel="Sign in"
        onSubmit={onSubmit}
      />
    );

    fillAndSubmit();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Invalid login credentials"
    );
  });

  test("shows the message the submit returns", async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue("Check your email to confirm.");
    render(
      <EmailForm
        title="Sign in"
        submitLabel="Sign in"
        onSubmit={onSubmit}
      />
    );

    fillAndSubmit();

    expect(
      (await screen.findByRole("status")).textContent
    ).toBe("Check your email to confirm.");
  });

  test("hides the password field when askPassword is false", () => {
    render(
      <EmailForm
        title="Reset password"
        submitLabel="Send link"
        askPassword={false}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
  });
});
