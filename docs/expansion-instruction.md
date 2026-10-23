# Expansion instruction

When a user expands a node, `/api/expand` sends the model the
assembled context and then one trailing `user` message. This
file defines that trailing message: the fixed instruction that
says what to produce, and the optional direction the user types
to steer the expansion. It is the spec for issue #52.

Context assembly (`docs/context-assembly-cases.md`) adds no
instruction text. Everything the model is told to do comes from
this file.

**Review status:** draft. Cole to confirm each decision.

## Decisions

| #   | Decision            | Choice                                                                                                                                         | Status   |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Branch count        | Exactly 3 ideas per expansion, as today (`CHILD_COUNT`). The text below is written for 3. Changing the count means changing the text.          | Proposed |
| 2   | Idea shape          | The prompt asks for one sentence of at most 25 words, a statement with no numbering, label or question. Only the length limit is enforced.     | Proposed |
| 3   | Hard length limit   | An idea longer than 300 characters is a malformed answer. The expansion fails with 502 and writes nothing.                                     | Proposed |
| 4   | Variety             | The prompt asks for ideas that differ from each other and from the context. Two ideas that are equal ignoring case are a malformed answer.     | Proposed |
| 5   | Repeated expansions | The instruction lists up to 20 of the newest live children the target already has and tells the model not to repeat them.                      | Proposed |
| 6   | User direction      | The request body takes an optional `instruction` string. It is added to the same trailing `user` message, after the fixed text.                | Proposed |
| 7   | Direction limits    | Trimmed. Missing, `null`, empty or only whitespace means no direction. Longer than 500 characters, or any other type, answers 400.             | Proposed |
| 8   | Format wins         | The fixed answer format comes before the direction and the direction is told to keep it. A direction cannot change the count or the JSON form. | Proposed |
| 9   | Storage             | The direction is not stored. The children it produced carry its effect. No migration.                                                          | Proposed |
| 10  | Single source       | The text below is the source of truth. A test reads it from this file and checks that the code builds the same text.                           | Proposed |
| 11  | Tuning              | Wording and model settings such as temperature are tuned in the second PR. Each change is recorded in the tuning log below.                    | Proposed |

## Interface

- The route validates `instruction` and passes the trimmed
  direction to `expandNode(sessionId, nodeId, direction)`. It
  passes `""` when there is no direction.
- `lib/expand.js` exports
  `buildInstruction(children, direction)`, which returns the
  trailing message text. `children` are the target's child node
  rows. `buildInstruction` filters, orders and caps them, and
  collapses whitespace.
- The `INSTRUCTION` constant is removed. Part 1 is exported as
  `BASE_INSTRUCTION`.
- The existing test "ends on the instruction when the target is
  the root" changes. In its graph the root has a live child `A`,
  so the trailing message now includes Part 2 listing `Idea A`.
- Lengths are JavaScript string lengths (`.length`).

## Instruction text

The trailing message is built from up to three parts, joined by
one blank line. The test for decision 10 takes the first
` ```text ` block after each `### Part` heading. In those blocks
`{child}` and `{direction}` are placeholders. The Part 2 line
with `{child}` repeats once per listed child.

### Part 1: always present

```text
Suggest 3 new ideas that build on the last message above. Each idea is one sentence of at most 25 words. Make the 3 ideas clearly different from each other and from every idea above. Write each idea as a statement, without numbering, labels or questions. Answer with JSON only, in the form {"ideas": ["...", "...", "..."]}, with exactly 3 strings.
```

### Part 2: only when the target has live children

```text
These ideas already branch from the last message, so do not repeat them:
- {child}
```

### Part 3: only when the user gave a direction

```text
The user wants this direction: {direction}
Follow it, but keep the answer format above.
```

## Rules

1. The message list sent to the model is the assembled context
   followed by exactly one `user` message built from the parts
   above.
2. Part 1 is always first.
3. Part 2 is present only when the target has at least one live
   child. A child with a `deleted_at` value is not listed.
4. Part 2 lists at most the 20 newest live children by
   `created_at`, then `id`. It prints them oldest first.
5. In Part 2 and Part 3, each run of whitespace, newlines
   included, becomes one space.
6. Part 3 is present only when the trimmed direction is not
   empty.
7. When Part 2 and Part 3 are both present, Part 2 comes first.
8. The route answers 400 when `instruction` is not a string,
   `null` or missing, or is longer than 500 characters after
   trimming. Nothing is sent to the model.
9. A missing, `null` or blank `instruction` behaves as no
   direction.
10. The answer must be JSON with an `ideas` array of exactly 3
    strings. Each string, after trimming, must be non-empty and
    at most 300 characters, and no two may be equal ignoring
    case. Otherwise the expansion fails with 502 and nothing is
    written.
11. The direction is never passed to `addChildren`.

## Cases

### Case 1: no children, no direction

Target `A` has no children. The body has no `instruction`.

Expected: the trailing message is Part 1 only.

### Case 2: live children, no direction

Target `A` has children `C1` (`t1`) and `C2` (`t2`), both live.

Expected: Part 1, a blank line, then Part 2 listing `C1` then
`C2`.

### Case 3: deleted children

As case 2, but `C1` has a `deleted_at` value.

Expected: Part 2 lists `C2` only.

If both children are deleted, Part 2 is absent.

### Case 4: direction, no children

Target `A` has no children. `instruction` is
`"  cheaper options  "`.

Expected: Part 1, a blank line, then Part 3 with the direction
`cheaper options`.

### Case 5: children and direction

As case 2, with the direction of case 4.

Expected: Part 1, Part 2, Part 3, in that order, each separated
by one blank line.

### Case 6: blank or null direction

`instruction` is `"   "` or `null`.

Expected: the same message as case 1.

### Case 7: invalid direction

`instruction` is `7`, or a string of 501 characters after
trimming.

Expected: 400. The model is not called.

### Case 8: malformed ideas

The model answers with 3 ideas, and either one is 301 characters
long after trimming, or two are `"Go hiking"` and `"go hiking"`.

Expected: 502. Nothing is written.

### Case 9: root target

The target is the root, with no children and no direction.

Expected: the context is one `user` message, followed by the
trailing `user` message of case 1.

### Case 10: many children

Target `A` has 25 live children.

Expected: Part 2 lists the 20 newest, oldest first.

### Case 11: child content with a newline

Target `A` has one child with content `"Walk\n- Drive"`.

Expected: Part 2 lists it as `- Walk - Drive`.

## Tuning log

Empty until the second PR. Each entry records the date, what
changed, the sample graphs it was tried on, and why.

## AI usage

Claude (an AI assistant) drafted this file and proposed each
decision. Cole makes each decision.
