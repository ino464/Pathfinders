# Context assembly test cases

Context assembly is the function that decides what goes to the
model when a user expands a node. Issue #31 implements it. This
file is the output of issue #27: the test cases, written before
the code, so that the interface is agreed first.

The function does not exist yet. This file describes agreed
behaviour only. Where nothing is agreed, the file has an open
question and no case.

**Review status:** Ethan has not read this file yet. Issue #31
must not start before he does.

## Decisions

Each case below follows from these decisions. Tyler made each
decision.

| #   | Decision             | Choice                                                                                                                                      | Decided by | Status                      |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------- |
| 1a  | Inputs               | `(nodes, edges, targetNodeId, preferences)`. No `rootPrompt` argument.                                                                      | Tyler      | Pending Ethan               |
| 1b  | Return value         | An array of `{ role, content }` messages.                                                                                                   | Tyler      | Pending Ethan               |
| 1c  | Roles                | The root is `user`. Each other node is `assistant`. One message per node.                                                                   | Tyler      | Pending Ethan               |
| 2   | Instruction text     | Context assembly adds none. Issue #32 adds its own.                                                                                         | Tyler      | Pending Ethan               |
| 3   | Depth                | Always the full path, root first. No truncation.                                                                                            | Tyler      | Ethan to read               |
| 4   | Merged node          | All ancestors, each one time, parents before children. Tie-break: `created_at` ascending, then `id`.                                        | Tyler      | Pending Ethan               |
| 5   | Preferences          | One `system` message at the front. One preference per line, in `created_at` order. No `system` message when there are no preferences.       | Tyler      | Pending Ethan               |
| 6   | Deleted ancestors    | A deleted node is a cut. Exclude it and all nodes reachable only through it. Throw if the target is deleted or no path to the root remains. | Tyler      | Ethan to read, Cole confirm |
| 7   | Token budget         | None in version one. The function does not truncate and does not throw for size.                                                            | Tyler      | Ethan to read               |
| 8   | Rejected ancestors   | The function ignores `status`. A rejected ancestor stays in the context.                                                                    | Tyler      | Ethan to read, Cole confirm |
| 9   | Where the cases live | This file holds inputs and expected outputs. `packages/frontend/test/context-assembly.test.js` holds one `test.todo` per case.              | Tyler      | Final                       |

Decision 1a differs from the sketch in issue #31, which lists a
`rootPrompt` argument. `docs/UML.md` makes the root an ordinary
node, so the root content comes from `nodes`.

## Rules

These rules restate the decisions in the form the cases use.

1. The output is an array of `{ role, content }` objects.
2. The root is the node with no incoming edge. Its role is
   `user`.
3. Each other node has the role `assistant`.
4. Each `content` value is the node `content`, unchanged.
5. The output contains the target and each ancestor of the
   target, one time each. The target is the last message.
6. A parent comes before its children. When two nodes can come
   next, the node with the lower `created_at` comes first. If
   `created_at` is equal, the node with the lower `id` comes
   first.
7. If `preferences` is not empty, the first message has the role
   `system`. Its content is the preference contents in
   `created_at` order, joined by one newline character.
8. If `preferences` is empty, there is no `system` message.
9. The function adds no instruction text.
10. A node with a `deleted_at` value is a cut. The output
    excludes it and each node that reaches the target only
    through it.
11. The function throws if the target has a `deleted_at` value,
    or if no path from the root to the target remains.
12. The function has no size limit. It does not truncate.
13. The function does not read `status`.

The target is the last message, so the array ends with an
`assistant` message whenever the target is not the root. The
caller appends its own trailing `user` message. Issue #32 has to
do this rather than merely choosing to: chat completion APIs
expect the final message to come from the user, and a trailing
`assistant` message is either rejected or treated as a prefill
to continue.

## Fixture conventions

- Field names are the column names from the migration: `id`,
  `content`, `status`, `created_at`, `deleted_at`,
  `parent_node_id`, `child_node_id`. See open question 3.
- Node ids are single letters so that the cases are easy to
  read. Real ids are UUIDs. Ids compare as strings.
- Times are `t1`, `t2`, and so on, where `t1` is before `t2`.
- `deleted_at` is empty unless the case gives a value.
- An edge `R → A` means `parent_node_id` is `R` and
  `child_node_id` is `A`.
- The tables list rows in an order that differs from the
  expected output where the order matters. The order of the
  input arrays must not decide the output.
- `preferences` is `[]` unless the case gives a value.

## Case 1: root node

The target is the root. It has no parents.

| id  | content     | created_at |
| --- | ----------- | ---------- |
| R   | Root prompt | t1         |

Edges: none. Target: `R`.

Expected output:

```json
[{ "role": "user", "content": "Root prompt" }]
```

## Case 2: node five levels deep

Path: `R → A → B → C → D → E`. Target: `E`.

| id  | content     | created_at |
| --- | ----------- | ---------- |
| E   | Idea E      | t6         |
| D   | Idea D      | t5         |
| C   | Idea C      | t4         |
| B   | Idea B      | t3         |
| A   | Idea A      | t2         |
| R   | Root prompt | t1         |

Expected output: the full path, root first.

```json
[
  { "role": "user", "content": "Root prompt" },
  { "role": "assistant", "content": "Idea A" },
  { "role": "assistant", "content": "Idea B" },
  { "role": "assistant", "content": "Idea C" },
  { "role": "assistant", "content": "Idea D" },
  { "role": "assistant", "content": "Idea E" }
]
```

## Case 3: merged node with two parents

### Case 3a: two parents with different times

Edges: `R → A`, `R → B`, `A → M`, `B → M`. Target: `M`.

| id  | content     | created_at |
| --- | ----------- | ---------- |
| M   | Merged idea | t4         |
| B   | Idea B      | t3         |
| A   | Idea A      | t2         |
| R   | Root prompt | t1         |

Expected output: `R` appears one time. `A` is before `B` because
`t2` is before `t3`.

```json
[
  { "role": "user", "content": "Root prompt" },
  { "role": "assistant", "content": "Idea A" },
  { "role": "assistant", "content": "Idea B" },
  { "role": "assistant", "content": "Merged idea" }
]
```

### Case 3b: two parents with the same time

The graph is the graph of case 3a, but `A` and `B` both have
`created_at` `t2`.

Expected output: the same as case 3a. `A` is before `B` because
the id `A` is lower than the id `B`.

### Case 3c: target below a merged node

The graph is the graph of case 3a with one more edge, `M → N`.
Node `N` has the content `Idea N` and `created_at` `t5`. Target:
`N`.

Expected output:

```json
[
  { "role": "user", "content": "Root prompt" },
  { "role": "assistant", "content": "Idea A" },
  { "role": "assistant", "content": "Idea B" },
  { "role": "assistant", "content": "Merged idea" },
  { "role": "assistant", "content": "Idea N" }
]
```

### Case 3d: branches of unequal length

Edges: `R → A`, `A → C`, `C → M`, `R → B`, `B → M`. Created in
the order `R`, `A`, `B`, `C`, `M`. Target: `M`.

| id  | content     | created_at |
| --- | ----------- | ---------- |
| M   | Merged idea | t5         |
| C   | Idea C      | t4         |
| B   | Idea B      | t3         |
| A   | Idea A      | t2         |
| R   | Root prompt | t1         |

Expected output: `R`, `A`, `B`, `C`, `M`. After `R`, the nodes
that can come next are `A` and `B`, so `A` goes first. Then `B`
and `C` can come next, so `B` goes before `C`.

```json
[
  { "role": "user", "content": "Root prompt" },
  { "role": "assistant", "content": "Idea A" },
  { "role": "assistant", "content": "Idea B" },
  { "role": "assistant", "content": "Idea C" },
  { "role": "assistant", "content": "Merged idea" }
]
```

A walk that finished each branch before starting the next would
give `R`, `A`, `C`, `B`, `M`. Rule 6 is not that walk. Ethan to
confirm rule 6 is intended.

## Case 4: preferences

### Case 4a: root target with two preferences

The graph is the graph of case 1. Target: `R`.

| id  | content                          | created_at |
| --- | -------------------------------- | ---------- |
| P2  | No ideas that need a car         | t3         |
| P1  | Keep every suggestion low budget | t2         |

Expected output: one `system` message first. `P1` is before `P2`
because `t2` is before `t3`.

```json
[
  {
    "role": "system",
    "content": "Keep every suggestion low budget\nNo ideas that need a car"
  },
  { "role": "user", "content": "Root prompt" }
]
```

### Case 4b: deeper target with preferences

Path: `R → A`. Target: `A`. The preferences are the preferences
of case 4a.

Expected output:

```json
[
  {
    "role": "system",
    "content": "Keep every suggestion low budget\nNo ideas that need a car"
  },
  { "role": "user", "content": "Root prompt" },
  { "role": "assistant", "content": "Idea A" }
]
```

### Case 4c: no preferences

Case 1 covers this. With `preferences` equal to `[]`, the output
has no `system` message.

## Case 5: deleted nodes

`docs/UML.md` says that a delete also removes everything below
the node. A live target with a deleted ancestor is thus possible
in two situations only: incorrect data, or a merged node with
one deleted parent branch. See open question 6.

### Case 5a: the target is deleted

Path: `R → A`. `A` has a `deleted_at` value. Target: `A`.

Expected output: the function throws.

### Case 5b: a deleted ancestor on the only path

Path: `R → A → B`. `A` has a `deleted_at` value. Target: `B`.

Expected output: the function throws. No path from the root to
the target remains.

### Case 5c: merged node with one deleted parent

Edges: `R → A`, `R → B`, `A → M`, `B → M`. `B` has a
`deleted_at` value. Target: `M`.

Expected output: `B` is excluded.

```json
[
  { "role": "user", "content": "Root prompt" },
  { "role": "assistant", "content": "Idea A" },
  { "role": "assistant", "content": "Merged idea" }
]
```

### Case 5d: live node above a deleted node

Edges: `R → A`, `A → M`, `R → X`, `X → B`, `B → M`. `B` has a
`deleted_at` value. `X` does not. Target: `M`.

Expected output: the same as case 5c. `B` is excluded because it
is deleted. `X` is excluded because it reaches `M` only through
`B`.

The type and the message of the thrown error are not agreed. See
open question 2.

## Case 6: context larger than a token budget

Version one has no budget. The function has no budget parameter.

The graph is the graph of case 2, but each `content` value is
long. The length is the choice of the person who writes the
test.

Expected output: the six messages of case 2, with each `content`
value unchanged. The function does not truncate and does not
throw.

A size guard, if the project needs one, belongs to issue #32.

## Case 7: rejected ancestor

Path: `R → A → B`. Target: `B`. `A` has the status that means
"rejected". The status values are not settled. See open
question 7.

Expected output: `A` stays in the context.

```json
[
  { "role": "user", "content": "Root prompt" },
  { "role": "assistant", "content": "Idea A" },
  { "role": "assistant", "content": "Idea B" }
]
```

The output must be the same for each possible value of `status`
on each node.

## Open questions

No case covers these. Each one needs an answer from the named
person before issue #31 can close.

1. **Ethan.** Decisions 1a, 1b, 1c, 2, 4 and 5 were made without
   you. Do you accept them?
2. **Ethan.** What does the function throw in cases 5a and 5b?
   Issue #32 must catch it.
3. **Ethan and Cole.** The fixtures use the database column
   names. `docs/UML.md` uses names such as `createdAt`. Issue
   #30 has not defined the shape that `getSessionGraph` returns.
   Which names does the function receive?
4. **Ethan.** What occurs when `targetNodeId` is not in `nodes`,
   when `edges` contains a cycle, or when more than one node has
   no incoming edge? Rule 2 assumes exactly one root.
5. **Ethan.** What is the order of two preferences with the same
   `created_at`?
6. **Cole.** Cases 5c and 5d need a merged node to stay alive
   when one parent is deleted. That is the open `deleteSubtree`
   question in issue #30. If the answer is no, cases 5c and 5d
   describe incorrect data only.
7. **Cole.** The migration sets the default of `nodes.status` to
   `'pending'`. `docs/UML.md` names the values `NEUTRAL`,
   `ACCEPTED` and `REJECTED`. This file does not settle that.
   Case 7 does not need the answer, because the function does
   not read `status`.
8. **Ethan.** `docs/UML.md` shows `Preference.normalize()` and
   `Preference.toPromptFragment()`. Neither exists. The cases
   use preference `content` as stored. Is that correct?
9. **Ethan.** The name and the location of the function are not
   agreed. The location also depends on issue #25. The test file
   imports nothing for that reason.

## AI usage

Claude (an AI assistant) prepared the questions to ask for each
decision: the options, the cost of each option and a
recommendation. Claude also drafted this file. Tyler made each
decision.
