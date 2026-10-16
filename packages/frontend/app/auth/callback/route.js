import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase-server";
import { finishGuestMerge } from "../../../lib/guest-merge";

const FRIENDLY_ERRORS = {
  identity_already_exists:
    "That Google account already has a Pathfinders account. Choose \"I already have an account\" to sign in and bring your guest work with you."
};

function safeNext(next) {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/";
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  const providerError =
    FRIENDLY_ERRORS[searchParams.get("error_code")] ??
    searchParams.get("error_description") ??
    searchParams.get("error");

  const supabase = await createClient();
  let error = new Error("Missing code or token in the link.");

  if (providerError) {
    error = new Error(providerError);
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash
    }));
  }

  if (!error) {
    try {
      await finishGuestMerge();
    } catch (err) {
      error = err;
    }
  }

  if (error) {
    const url = new URL("/", origin);
    url.searchParams.set("auth_error", error.message);
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(next, origin));
}
