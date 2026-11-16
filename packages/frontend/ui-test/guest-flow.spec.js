/* global process */
import { test, expect } from "@playwright/test";
import { recordGuest } from "./support.js";

// A system test (TE7 Part III, #111). A guest's work goes through
// the sign-in, the server actions and Supabase, and is still there
// after a reload. When a Groq key is set, an expansion also goes
// through /api/expand and the model.

const idea = `Plan a guest picnic ${Date.now()}`;

function graph(page) {
  return page.getByRole("region", { name: "Session graph" });
}

function rootNode(page) {
  return graph(page).getByText(idea, { exact: true });
}

// React Flow marks each node on the canvas with this description
function canvasIdeas(page) {
  return graph(page).locator('[aria-roledescription="node"]');
}

test("a guest's session and ideas survive a reload", async ({
  page
}) => {
  await test.step("continue as a guest", async () => {
    await page.goto("/login");
    await page
      .getByRole("button", { name: "Continue as guest" })
      .click();
    const guestNotice = page.getByText(
      "You are using Pathfinders as a guest"
    );
    await expect(guestNotice).toBeVisible();
    await recordGuest(guestNotice);
  });

  await test.step("create a session with a root idea", async () => {
    await page.getByLabel("Opening idea").fill(idea);
    await page
      .getByRole("button", { name: "Start brainstorming" })
      .click();
    await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
    await expect(rootNode(page)).toBeVisible();
  });

  await test.step("the session and root are still there after a reload", async () => {
    const sessionUrl = page.url();
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: idea })
    ).toBeVisible();
    await expect(rootNode(page)).toBeVisible();

    await page
      .getByRole("link", { name: "All sessions" })
      .click();
    await page.getByRole("link", { name: idea }).click();
    await expect(page).toHaveURL(sessionUrl);
    await expect(canvasIdeas(page)).toHaveCount(1);
  });

  if (!process.env.GROQ_API_KEY) {
    test.info().annotations.push({
      type: "skipped step",
      description: "Expanding the root needs GROQ_API_KEY."
    });
    return;
  }

  // the model's ideas differ on every run, so the step checks
  // only that three new ideas appear and stay after a reload
  await test.step("expand the root, the new ideas stay after a reload", async () => {
    await rootNode(page).click();
    await page
      .getByRole("button", { name: "Brainstorm" })
      .click();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(canvasIdeas(page)).toHaveCount(4, {
      timeout: 30_000
    });

    await page.reload();
    await expect(canvasIdeas(page)).toHaveCount(4);
  });
});
