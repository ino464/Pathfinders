# Authentication

This file explains how people sign in to Pathfinders: as a
guest, with email and a password, or with Google, and how a
guest's work moves into an account when they sign in.

## The first visit

Sign-in lives on its own page, `/login`
(`packages/frontend/app/login/`). A visitor without a session
cookie who opens any other page is sent there, and sees a choice
(`packages/frontend/app/auth-choice.js`):

- **Continue with Google**
- **Sign in with email**
- **Create an account**
- **Continue as guest**

Once they choose, they land on the app at `/`.

Returning visitors who already have a valid session cookie skip
the choice: opening `/login` sends them straight to `/`.
`@supabase/ssr` keeps the session in a cookie, and
`packages/frontend/proxy.js` checks it on every page request
with `getClaims()`, which verifies the token and refreshes it
when it expires. The proxy makes both redirects and leaves
`/auth/callback` and `/api/*` alone. Signing out also returns
the person to `/login`. `packages/frontend/app/auth-provider.js`
holds the signed-in user and exposes every sign-in action to the
rest of the app through `useAuth()`.

## Guests

"Continue as guest" calls `signInAnonymously()`. Supabase
creates a real row in `auth.users` with `is_anonymous` set to
true, and the guest gets the `authenticated` role, so the
row-level security policies treat them like any other user: they
can only reach their own sessions and the nodes, edges and
preferences inside them.

Supabase limits anonymous sign-ins per IP address, which is why
the call happens in the browser rather than on the server, where
every visitor would share a single IP. Anonymous sign-ins are
enabled in `supabase/config.toml` for the local stack and under
Authentication, Sign In / Providers in the hosted dashboard.

A guest has no email or password, so if they lose their cookie
they cannot get back in. For that reason guests get no sign out
button. They get "Save your work to an account" on `/` instead.

## Email and password

- **Create an account** calls `signUp`. With email confirmation
  off, which is the local default
  (`enable_confirmations = false`), the person is signed in
  straight away. With it on, Supabase emails a link and the
  person is signed in when they open it.
- **Sign in with email** calls `signInWithPassword`.

## Forgot password

"Forgot password?" under the email sign-in form calls
`resetPasswordForEmail`. Supabase emails a link that goes
through `/auth/callback` to `/set-password`
(`packages/frontend/app/set-password/`), where the person
chooses a new password with `updateUser({ password })`. Locally
the email can be read at http://127.0.0.1:54324.

The link only works in the browser that asked for it, because
`@supabase/ssr` keeps a PKCE code verifier in that browser's
cookies. Opened anywhere else, the page says the link has
expired and offers a new one. A guest who resets the password of
an existing account gets the same merge as signing in.

## Google

**Continue with Google** calls `signInWithOAuth`. The browser
goes to Google, then to Supabase, then back to
`packages/frontend/app/auth/callback/route.js`, which exchanges
the code for a session cookie and sends the person to `/`. If
sign-in fails, it sends them back to `/login` with the error.
The same route handles links from Supabase emails.

Setting it up:

1. In Google Cloud Console, create an OAuth client of type "Web
   application" and add these authorized redirect URIs:
   - `http://127.0.0.1:54321/auth/v1/callback` for the local
     stack
   - `https://<project-ref>.supabase.co/auth/v1/callback` for
     the hosted project
2. **Local stack:** the client id is in `[auth.external.google]`
   in `supabase/config.toml`. Put the client secret in
   `supabase/.env` as `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.
   That file is gitignored. Then run `npx supabase stop` and
   `npx supabase start`.
3. **Hosted:** enable Google under Authentication, Sign In /
   Providers with the same client id and secret.

Supabase only redirects to addresses on its allow list. Locally
that's `additional_redirect_urls` in `config.toml`, which covers
`http://localhost:3000/**` and `http://127.0.0.1:3000/**`. For
the hosted project, add the same addresses and the deployed site
under Authentication, URL Configuration.

## Moving a guest's work into an account

When a guest signs in or creates an account, by any method,
their sessions move into that account and the guest user is
deleted. New and existing accounts go through the same steps.

Ownership is stored in one place, `sessions.user_id`. Nodes,
edges and preferences reach their owner through their session,
so moving the sessions moves everything.

The hard part is proving that the person owns both users.
Row-level security only lets a user touch their own rows, so the
browser cannot move rows between users. The server must also
never trust a guest id that the browser simply sends, or anyone
could claim someone else's sessions. So the merge runs on the
server (`packages/frontend/lib/guest-merge.js`):

1. Before signing in, the browser refreshes the guest's session
   and calls `POST /api/auth/merge/start`. The server checks the
   cookie belongs to a guest and copies the guest's access token
   into an httpOnly cookie, `pf_merge_from`, which lasts an
   hour, the same as the token.
2. The person signs in or creates an account. The session cookie
   now holds the account.
3. The merge is finished by `POST /api/auth/merge/finish`
   (email), or by the callback route (Google, and email links
   when confirmation is on). The server asks Supabase to verify
   the saved token. That only succeeds for a real, unexpired
   guest, so a hand-edited cookie gets nowhere. It then moves
   the guest's sessions to the account and deletes the guest.

The refresh happens in the browser on purpose. Supabase rotates
refresh tokens, so if the server refreshed instead, the browser
would be left holding a revoked token. If sign-in then failed,
the browser's next refresh would end the guest's session and
lose their work.

The sessions move before the guest is deleted. Deleting first
would remove the sessions through `on delete cascade`. If the
delete fails, an empty guest user is left behind, which is
harmless.

If the merge fails, the page shows a notice
(`packages/frontend/app/merge-notice.js`) with **Try again** and
**Dismiss**. The server keeps `pf_merge_from` until the sessions
have moved, so a retry can finish the job. It's only cleared
early when Supabase rejects the token, for example once it has
expired.

### The secret key

The merge is the only code that uses the Supabase secret key,
which skips row-level security. It's read from
`SUPABASE_SECRET_KEY` in `packages/frontend/.env.local`, never
from a `NEXT_PUBLIC_` variable, and only
`packages/frontend/lib/supabase-admin.js` creates a client with
it. That file imports `server-only`, so a browser file that
imports it fails the build. Everything else, including the data
access layer, still acts as the signed-in user.

## Still open

Guests who never sign in and lose their cookie, by clearing
browser data or switching devices, cannot get their sessions
back. Those users accumulate in `auth.users`. A scheduled job
could delete old anonymous users later, and the
`on delete cascade` on `sessions.user_id` would remove their
sessions and everything inside them at the same time.
