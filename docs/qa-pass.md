# QA pass, 2026-11-16

This is the manual QA pass for #111. Each functional requirement
in the [SRD](SRD.md#3-functional-requirements) was checked
against the running app, and each defect has its own issue.

## Setup

| Item      | Value                                                        |
| --------- | ------------------------------------------------------------ |
| App       | `pathfinders-six.vercel.app` (production)                    |
| Commit    | `447f368` (main after #118 and #119)                         |
| Database  | Hosted Supabase                                              |
| Model     | Groq, through `/api/expand` and `/api/chat`                  |
| Account   | An email account, already signed in                          |
| Test data | One session, "QA pass 2026-11-16", and one throwaway session |

Each step was checked in the page and, where it changes data,
again after a reload. The export file was used to check edges
and saved text.

## Results

| Req   | Requirement (short)            | Result            | What was checked                                                                                                                                                                                                         | Issue |
| ----- | ------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| FR-01 | Expand a selected idea         | Pass              | Brainstorm from the root gave 3 titled ideas in about 3 s. They stayed after a reload.                                                                                                                                   | —     |
| FR-02 | Add and edit ideas             | Pass, with defect | **Add child** added "Kayak relay race" under the selected idea. **Save text** saved the new text, but the card still shows the old title.                                                                                | #121  |
| FR-03 | View history, switch branches  | Pass              | The session list opens each session with all its ideas. Selecting an idea in another branch highlights that branch. See the note on chat history below.                                                                  | —     |
| FR-04 | Log in and resume work         | Partly checked    | The signed-in account opened its saved sessions. Sign-out and sign-in on the hosted app were not done in this pass. The UI tests (#93) cover email sign-in locally.                                                      | —     |
| FR-05 | Like and dislike, recorded     | Pass              | Like and dislike showed a stripe. Both stayed after a reload and are in the export. The idea did not move (fixed in #119).                                                                                               | —     |
| FR-06 | Develop an earlier idea again  | Pass              | From the root, the direction "Indoor only, for a rainy day" gave 3 new indoor ideas as a new branch.                                                                                                                     | —     |
| FR-07 | Delete branches and sessions   | Pass, with defect | **Delete branch** asked first, then removed the idea and its 3 descendants. Deleting one parent of a two-parent idea kept that idea under its other parent. Deleting a session removed it at once, with no confirmation. | #123  |
| FR-08 | Preferences apply to a session | Pass              | After "Every idea must cost under $50 per person", all 3 new ideas named a low cost. A chat reply also kept to it. The preference stayed after a reload.                                                                 | —     |
| FR-09 | Rename a session               | Pass              | The new title stayed after a reload. The root idea keeps its first text.                                                                                                                                                 | —     |
| FR-10 | Export a session               | Pass, with defect | The export returned JSON with all ideas, edges, statuses and the preference. The file has no idea titles.                                                                                                                | #120  |
| FR-11 | Import a session               | Not built         | Planned in Sprint 5.                                                                                                                                                                                                     | #106  |
| FR-12 | Combine two or more ideas      | Pass, two ideas   | A brainstorm from two ideas in different branches gave 3 ideas. The export shows that each has both parents. The limit is two.                                                                                           | #114  |
| —     | Chat about selected ideas      | Pass, with defect | Two questions about one idea got replies in about 2 s. The second request sent the first turn as history. The graph did not change. Replies show raw Markdown.                                                           | #122  |

Every requirement has a result above or an open issue.

## Defects filed

| Issue | Defect                                                  |
| ----- | ------------------------------------------------------- |
| #120  | Export drops each idea's title                          |
| #121  | Editing an idea does not change the text on its card    |
| #122  | Chat replies show raw Markdown                          |
| #123  | Deleting a session has no confirmation                  |
| #124  | The canvas does not fit the view after new ideas appear |

Edge routing across levels was also seen. It is already in #110.

## Questions for the team

- **Chat history.** A chat lasts only until the page reloads or
  the selection changes, as #72 planned. FR-03 says users can
  "view their full chat history". If "chat" there means the chat
  panel and not a session, FR-03 is only partly met. #107 can
  settle the wording.
- **FR-04 on hosted.** Sign out and sign in again with email on
  the hosted app before the final demo. That step needs a
  password, so it was not part of this pass.

## Automated checks on the same day

- Vitest: 384 tests in 28 files pass.
- Playwright: 6 tests pass, including the new guest flow in
  `ui-test/guest-flow.spec.js`. This run used local Supabase.
- Hosted migration history: all 6 migrations in
  `supabase/migrations` are recorded in
  `supabase_migrations.schema_migrations`.
