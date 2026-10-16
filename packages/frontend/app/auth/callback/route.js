import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase-server";

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
    searchParams.get("error_description") ?? searchParams.get("error");

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

  if (error) {
    const url = new URL("/", origin);
    url.searchParams.set("auth_error", error.message);
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(next, origin));
}
