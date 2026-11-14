# Chat instruction

When a user chats about selected nodes, `/api/chat` sends the
model a system message, an outline of the selected nodes and
their ancestors, the recent turns of the conversation, and the
new message. This file defines the fixed text in those messages
and the rules around them. It is the spec for issue #71.

Chat writes nothing to the graph. The user picks chat or
brainstorm, so the model never decides whether to create nodes.
Brainstorm, which does create nodes, is `/api/expand` (see
`docs/expansion-instruction.md`).

**Review status:** Cole accepted decisions 1 to 7 and 9 on
2026-11-13 while walking through the plan. The others are
proposed and wait for Cole. The issue asks Tyler to agree on the
limit in decision 9.

## Decisions

| #   | Decision           | Choice                                                                                                                                         | Status   |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Free text          | `requestCompletion` takes `responseFormat`, `"json"` (the default) or `"text"`. Chat uses `"text"`. `/api/expand` is unchanged.                | Accepted |
| 2   | Message order      | System message, outline, history, new message. The server rebuilds the outline from the database on every turn.                                | Accepted |
| 3   | Outline, not turns | Graph nodes go in one `user` message as a flat list, root first. They are never sent as `user`/`assistant` turns.                              | Accepted |
| 4   | Selected marker    | Each selected node ends with `(selected)`, so the model knows which ideas the user is asking about.                                            | Accepted |
| 5   | Instruction place  | The chat instruction opens the system message. The session's preferences follow it in the same message.                                        | Accepted |
| 6   | Storage            | `chat_turns` stores `user_id`, `session_id` and `created_at` per turn, and an `id`. No message text is stored.                                 | Accepted |
| 7   | Turn RLS           | A user reads and inserts only their own turns, and inserts only into their own sessions. There is no update or delete policy.                  | Accepted |
| 8   | History            | The client sends the transcript. The route keeps the last 10 turns and checks only those. Older turns are dropped without an error.            | Proposed |
| 9   | Limit              | 30 turns per user in a rolling hour, across all their sessions. Chosen by Cole on 2026-11-13.                                                  | Accepted |
| 10  | What counts        | A turn is recorded after validation and the node check, before the model is called. A failed model call still counts. A refused turn does not. | Proposed |
| 11  | Length limits      | The message is at most 2000 characters after trimming. Each history turn is at most 4000 characters.                                           | Proposed |
| 12  | Reply              | The reply is trimmed. An empty reply is a 502. There is no length cap on the reply.                                                            | Proposed |
| 13  | Single source      | The text below is the source of truth. A test reads it from this file and checks that the code builds the same text.                           | Proposed |

## Interface

- `POST /api/chat` takes
  `{ sessionId, nodeIds, history, message }` and answers
  `200 { reply }`.
- The route validates the body and calls
  `chatAboutNodes(sessionId, nodeIds, history, message)` from
  `lib/chat.js` with the cut history and the trimmed message.
- `chatAboutNodes` reads the session with `getExpansionInputs`,
  checks the nodes, checks the limit with `countChatTurnsSince`,
  records the turn with `addChatTurn`, and calls Groq.
- `lib/context-assembly.js` exports
  `orderedContext(nodes, edges, targetIds)`, which returns
  `{ ordered, root }`. `assembleContext` uses it too, so chat
  and expand walk the graph the same way.
- Lengths are JavaScript string lengths (`.length`).

## Instruction text

The test for decision 13 takes the first ` ```text ` block after
each `### Part` heading. In those blocks `{preference}`,
`{root}` and `{idea}` are placeholders. A line with
`{preference}` repeats once per preference, and a line with
`{idea}` repeats once per node after the root.

### Part 1: the system message, always present

```text
You are talking with a user about their brainstorm. The next message lists the ideas that lead to the ones the user selected, and marks the selected ideas. Answer the user's messages about those ideas in plain, conversational text. Keep each reply to a few sentences unless the user asks for more. Do not use JSON, Markdown headings or tables. Nothing you write is added to the brainstorm.
```

### Part 2: added to the system message when the session has preferences

```text
The user set these preferences for the whole session:
- {preference}
Follow all of them in every reply.
```

### Part 3: the outline

```text
These are the ideas that lead to the ones the user selected, from the starting prompt down. The selected ideas are marked (selected).
Starting prompt: {root}
- {idea}
```

## Rules

1. The message list is the system message, the outline, the
   history turns in the order sent, and the new message as a
   `user` message.
2. The system message is Part 1, then a blank line and Part 2
   when the session has at least one preference. Preferences are
   listed oldest first by `created_at`, then `id`.
3. The outline lists the selected nodes and every live ancestor,
   each once, in the order context assembly uses. The root is
   the `Starting prompt` line.
4. A selected node's line ends with ` (selected)`. This includes
   the root when it is selected.
5. In the outline and in Part 2, each run of whitespace,
   newlines included, becomes one space.
6. The route answers 400, and the model is not called, when the
   body is not JSON, `sessionId` is not a UUID, `nodeIds` is not
   a list of one or two distinct UUIDs, `history` is not a list,
   a kept turn has a role other than `user` or `assistant`,
   non-string content or more than 4000 characters, or the
   message is missing, blank, not a string or longer than 2000
   characters after trimming.
7. A missing `history` is the same as `[]`. Only `role` and
   `content` of each turn are passed on.
8. A turn never writes to `nodes` or `edges`. It inserts one
   `chat_turns` row.
9. When the user already has 30 turns in the last hour, the
   route answers 429. No row is written and the model is not
   called.

## Status codes

| Status | When                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| `200`  | The body is `{ reply }`.                                                          |
| `400`  | See rule 6.                                                                       |
| `401`  | Nobody is signed in: `Sign in to chat about ideas.`                               |
| `404`  | A node is not in the session, is deleted, or the session belongs to another user. |
| `429`  | The user reached the chat limit: `Too many chat messages. Try again later.`       |
| `502`  | The model request failed or the reply was empty.                                  |
| `504`  | The model did not answer in time.                                                 |
| `500`  | Any other error. The body has no details.                                         |

## Cases

### Case 1: first turn on one node

Root `R` "Plan a trip", child `A` "Visit in spring", grandchild
`B` "Go to Kyoto". The user selects `B` and sends "Why?" with no
history.

Expected: Part 1, then the outline
`Starting prompt: Plan a trip`, `- Visit in spring`,
`- Go to Kyoto (selected)`, then the `user` message "Why?".

### Case 2: second turn

As case 1, with the history "Is spring busy?" (`user`) and "Yes,
very." (`assistant`).

Expected: the system message, the outline, the two history
turns, then the new message.

### Case 3: two selected nodes

`B` and `C` "Stay in hostels" share the ancestor `R`.

Expected: the outline lists `R`, `A`, `B (selected)`,
`C (selected)`, each once.

### Case 4: long history

The client sends 14 turns.

Expected: only the last 10 reach the model. A bad role in one of
the 4 dropped turns is not an error.

### Case 5: limit reached in another session

The user has 30 turns in the last hour in session 1 and sends a
turn in session 2.

Expected: 429.

## AI usage

Claude (an AI assistant) drafted this file and proposed each
decision. Cole makes each decision.
