/* global process */
import { appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

export function loadEnv() {
  const file = join(import.meta.dirname, "..", ".env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "UI tests need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in packages/frontend/.env.local."
    );
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function testAccount() {
  return {
    email: process.env.UI_TEST_EMAIL,
    password: process.env.UI_TEST_PASSWORD,
    sessionTitle: process.env.UI_TEST_SESSION_TITLE
  };
}

const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export async function recordGuest(guestNotice) {
  const text = await guestNotice.textContent();
  const [id] = text.match(UUID) ?? [];
  if (id) {
    await appendFile(process.env.UI_TEST_GUEST_FILE, `${id}\n`);
  }
}
