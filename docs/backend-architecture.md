# Backend architecture

This file records the decision made in issue #25: Pathfinders
has no separate backend service. The backend is server-side code
inside the Next.js app in `packages/frontend`, and the database
and authentication are Supabase.

## Decision

Server work runs in three places inside the Next.js app:

- **Route handlers** under `app/api/`, starting with
  `app/api/expand/route.js` (#32), which calls the LLM.
- **Server actions** for changes made from the canvas, such as
  pruning a branch or accepting an idea.
- **Server components** for pages that load data before they
  render, such as opening a saved session.

All three read and write graph data only through the data access
layer described below. The browser never queries the graph
tables itself.

## How a request flows

```text
Browser (React Flow canvas)
  │  user action, carrying the session cookie
  ▼
Route handler / server action / server component
  │
  ├── context assembly (#31) ──► Groq   (expand only)
  │
  ▼
Data access layer   lib/graph-data.js   (server-only)
  │  createClient() from lib/supabase-server.js
  ▼
Supabase Postgres   RLS checks auth.uid() on every row
```

The proxy in `packages/frontend/proxy.js` refreshes the user's
access token on each request, so server code always sees a valid
session. How visitors get that session in the first place is in
`docs/auth.md`.

## The data access layer

The data access layer is a single module,
`packages/frontend/lib/graph-data.js`, built in issue #30. It is
the only code in the app that reads or writes the `sessions`,
`nodes`, `edges` and `preferences` tables, apart from moving a
guest's sessions into an account when they sign in
(`lib/guest-merge.js`, see `docs/auth.md`). It exports six
functions: `createSession`, `getSessionGraph`, `addNode`,
`addEdge`, `updateNodeStatus` and `deleteSubtree`.

- The module imports `server-only`, so importing it from a
  client component fails the build.
- Each function gets its Supabase client from `createClient()`
  in `lib/supabase-server.js`. That client reads the session
  cookie, so every query runs as the signed-in user.
- `getSessionGraph` returns `{ nodes, edges }` in the shape
  React Flow uses, so the canvas does not reshape data.
- Because everything goes through these six functions, the
  canvas (#33) can be built against fixture data, and tests can
  replace the Supabase client with a fake one.

### Deleting a subtree

`deleteSubtree(sessionId, nodeId)` never removes rows. It sets
`deleted_at` on the node and on the nodes below it, and
`getSessionGraph` leaves those nodes and their edges out.

A node below the deleted one is deleted only when every one of
its live parents is being deleted. A merged node that still has
a live parent outside the deleted branch survives, and so does
everything under it. A merged node whose parents are all inside
the deleted branch is deleted with it. Deleting the root deletes
the whole session's graph.

The team chose this rule on 2026-10-15, settling the open
question in `docs/UML.md`.

`addEdge` refuses an edge whose child is already an ancestor of
its parent, so the graph never contains a loop.

## Who enforces access

Row-level security is the access control. The policies from #29
let a user read and change a session only when
`sessions.user_id` is their own id, and nodes, edges and
preferences resolve ownership through their session. The data
access layer does not check ownership itself, and it never uses
the secret key, which would bypass these policies. The only code
that uses the secret key is the guest merge in
`lib/guest-merge.js`, which needs it to move sessions from one
user to another.

The publishable key and the user's session are in the browser by
design, so someone could call Supabase directly instead of going
through the app. The team accepted this: RLS still limits them
to their own rows, so the most they can do is edit their own
sessions. Blocking direct writes entirely would mean removing
write access from the `authenticated` role and having the server
use the service-role key, which moves every ownership check into
our own code. That was judged not worth the risk.
