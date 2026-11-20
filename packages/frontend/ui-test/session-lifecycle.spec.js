import { test, expect } from "@playwright/test";
import { testAccount } from "./support.js";

test("a signed-in user creates, renames and deletes a session", async ({
  page
}) => {
  const { email, password } = testAccount();
  const idea = `Session lifecycle ${Date.now()}`;
  const renamed = `Renamed ${idea}`;

  await page.goto("/login");
  await page
    .getByRole("button", { name: "Sign in with email" })
    .click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .click();

  await page.getByLabel("Opening idea").fill(idea);
  await page
    .getByRole("button", { name: "Start brainstorming" })
    .click();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  await expect(
    page
      .getByRole("region", { name: "Session graph" })
      .getByText(idea, { exact: true })
  ).toBeVisible();

  await page
    .getByRole("link", { name: "All sessions" })
    .click();
  const row = page.getByRole("listitem").filter({
    has: page.getByRole("link", { name: idea, exact: true })
  });
  await row.getByLabel("New title").fill(renamed);
  await row.getByRole("button", { name: "Rename" }).click();
  const renamedLink = page.getByRole("link", {
    name: renamed,
    exact: true
  });
  await expect(renamedLink).toBeVisible();
  await page.reload();
  await expect(renamedLink).toBeVisible();
  const renamedRow = page.getByRole("listitem").filter({
    has: renamedLink
  });
  const deleteButton = renamedRow.getByRole("button", {
    name: "Delete"
  });

  // the delete asks first (#123): Cancel keeps the session
  page.once("dialog", (dialog) => dialog.dismiss());
  await deleteButton.click();
  await page.reload();
  await expect(renamedLink).toBeVisible();

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain(`"${renamed}"`);
    return dialog.accept();
  });
  await deleteButton.click();
  await expect(renamedLink).toHaveCount(0);
  await page.reload();
  await expect(renamedLink).toHaveCount(0);
});
