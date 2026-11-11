import { test, expect } from "@playwright/test";
import { testAccount } from "./support.js";

test.describe.configure({ mode: "serial" });

const idea = `Plan a weekend trip ${Date.now()}`;
let sessionUrl;

async function signIn(page) {
  const { email, password } = testAccount();
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Sign in with email" })
    .click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByLabel("Opening idea")).toBeVisible();
}

function rootNode(page) {
  return page
    .getByRole("region", { name: "Session graph" })
    .getByText(idea, { exact: true });
}

test("starts a brainstorming session", async ({ page }) => {
  await signIn(page);

  await page.getByLabel("Opening idea").fill(idea);
  await page
    .getByRole("button", { name: "Start brainstorming" })
    .click();

  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: idea })
  ).toBeVisible();
  await expect(rootNode(page)).toBeVisible();
  sessionUrl = page.url();
});

test("comes back to where I left off", async ({ page }) => {
  await signIn(page);
  await page.goto(sessionUrl);
  await page.reload();

  await expect(
    page.getByRole("heading", { level: 1, name: idea })
  ).toBeVisible();
  await expect(rootNode(page)).toBeVisible();

  await page
    .getByRole("link", { name: "All sessions" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: idea }).click();

  await expect(page).toHaveURL(sessionUrl);
  await expect(rootNode(page)).toBeVisible();
});
