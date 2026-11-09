import { test, expect } from "@playwright/test";
import { recordGuest, testAccount } from "./support.js";

async function signInWithEmail(page, email, password) {
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Sign in with email" })
    .click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
}

test("signs in with email and sees my sessions", async ({
  page
}) => {
  const account = testAccount();

  await signInWithEmail(page, account.email, account.password);

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText(`Signed in as ${account.email}`)
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: account.sessionTitle })
  ).toBeVisible();
  await expect(page.getByLabel("Opening idea")).toBeVisible();
});

test("shows an error for a wrong password", async ({
  page
}) => {
  const account = testAccount();

  await signInWithEmail(page, account.email, "wrong-password");

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Sign in" })
  ).toBeVisible();
  await expect(page.getByLabel("Opening idea")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: account.sessionTitle })
  ).toHaveCount(0);
});

test("continues as a guest", async ({ page }) => {
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Continue as guest" })
    .click();

  const guestNotice = page.getByText(
    "You are using Pathfinders as a guest"
  );
  await expect(guestNotice).toBeVisible();
  await recordGuest(guestNotice);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Opening idea")).toBeVisible();
  await expect(
    page.getByText("No brainstorming session yet")
  ).toBeVisible();
});
