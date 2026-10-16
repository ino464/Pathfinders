import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase-server";
import { finishGuestMerge } from "../../../lib/guest-merge";

function safeNext(next) {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/";
}

function redirectToLogin(origin, message) {
  const url = new URL("/login", origin);
  url.searchParams.set("auth_error", message);
  return NextResponse.redirect(url);
}

function redirectHome(origin, param, message) {
  const url = new URL("/", origin);
  url.searchParams.set(param, message);
  return NextResponse.redirect(url);
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  const providerError =
    searchParams.get("error_description") ??
    searchParams.get("error");
  if (providerError) {
    return redirectToLogin(origin, providerError);
  }

  const supabase = await createClient();
  let error = new Error("Missing code or token in the link.");

  if (code) {
    ({ error } =
      await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash
    }));
  }

  if (error) {
    return redirectToLogin(origin, error.message);
  }

  try {
    await finishGuestMerge();
  } catch (err) {
    return redirectHome(origin, "merge_error", err.message);
  }

  return NextResponse.redirect(new URL(next, origin));
}
