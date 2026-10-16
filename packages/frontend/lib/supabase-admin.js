/* global process */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./supabase-env";

export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Missing SUPABASE_SECRET_KEY. Add it to packages/frontend/.env.local."
    );
  }

  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
