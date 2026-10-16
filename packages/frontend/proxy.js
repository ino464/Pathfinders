import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import {
  supabaseUrl,
  supabasePublishableKey
} from "./lib/supabase-env";

function redirectTarget(pathname, signedIn) {
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/")
  ) {
    return null;
  }
  if (pathname === "/login") return signedIn ? "/" : null;
  return signedIn ? null : "/login";
}

export async function proxy(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headers ?? {}).forEach(
            ([key, value]) => response.headers.set(key, value)
          );
        }
      }
    }
  );

  const { data } = await supabase.auth.getClaims();
  const target = redirectTarget(
    request.nextUrl.pathname,
    Boolean(data?.claims)
  );
  if (!target) return response;

  const redirect = NextResponse.redirect(
    new URL(target, request.url)
  );
  response.cookies
    .getAll()
    .forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
