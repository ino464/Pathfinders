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
| 1   | Branch count        | Exactly 3 ideas per expansion, as today (`CHILD_COUNT`).                                                                                       | Proposed |
| 2   | Idea shape          | One sentence of at most 25 words. A statement, with no numbering, label or question.                                                           | Proposed |
| 3   | Hard length limit   | An idea longer than 300 characters is a malformed answer. The expansion fails with 502 and writes nothing.                                     | Proposed |
| 4   | Variety             | The ideas differ from each other and from every idea in the context.                                                                           | Proposed |
| 5   | Repeated expansions | The instruction lists the live children the target already has and tells the model not to repeat them.                                         | Proposed |
| 6   | User direction      | The request body takes an optional `instruction` string. It is added to the same trailing `user` message, after the fixed text.                | Proposed |
| 7   | Direction limits    | Trimmed. Empty or only whitespace means no direction. Longer than 500 characters, or not a string, answers 400.                                | Proposed |
| 8   | Format wins         | The fixed answer format comes before the direction and the direction is told to keep it. A direction cannot change the count or the JSON form. | Proposed |
| 9   | Storage             | The direction is not stored. The children it produced carry its effect. No migration.                                                          | Proposed |
| 10  | Single source       | The text below is the source of truth. A test reads it from this file and checks that the code builds the same text.                           | Proposed |
| 11  | Tuning              | Wording and model settings such as temperature are tuned in the second PR. Each change is recorded in the tuning log below.                    | Proposed |

## Instruction text

The trailing message is built from up to three parts, joined by
one blank line. `3` stands for `CHILD_COUNT`.

### Part 1: always present

```text
Suggest 3 new ideas that build on the last message above. Each idea is one sentence of at most 25 words. Make the 3 ideas clearly different from each other and from every idea above. Write each idea as a statement, without numbering, labels or questions. Answer with JSON only, in the form {"ideas": ["...", "...", "..."]}, with exactly 3 strings.
```

### Part 2: only when the target has live children

One line per child, in `created_at` order, then `id` order.

```text
These ideas already branch from the last message, so do not repeat them:
- <child content>
- <child content>
```

### Part 3: only when the user gave a direction

```text
The user wants this direction: <direction>
Follow it, but keep the answer format above.
```

## Rules

1. The message list sent to the model is the assembled context
   followed by exactly one `user` message built from the parts
   above.
2. Part 1 is always first.
3. Part 2 is present only when the target has at least one live
   child. A child with a `deleted_at` value is not listed.
4. Part 3 is present only when the trimmed direction is not
   empty. The direction appears in it trimmed and otherwise
   unchanged.
5. When Part 2 and Part 3 are both present, Part 2 comes first.
6. The route answers 400 when `instruction` is present and is
   not a string, or is longer than 500 characters after
   trimming. Nothing is sent to the model.
7. A request with no `instruction` field behaves as a request
   with an empty one.
8. The answer must be JSON with an `ideas` array of exactly 3
   strings. Each string, after trimming, must be non-empty and
   at most 300 characters. Otherwise the expansion fails with
   502 and nothing is written.

## Cases

### Case 1: no children, no direction

Target `A` has no children. The body has no `instruction`.

Expected: the trailing message is Part 1 only.

### Case 2: live children, no direction

Target `A` has children `C1` (`t1`) and `C2` (`t2`), both live.

Expected: Part 1, a blank line, then Part 2 listing `C1` then
`C2`.

### Case 3: one child deleted

As case 2, but `C1` has a `deleted_at` value.

Expected: Part 2 lists `C2` only. If no live child is left, Part
2 is absent.

### Case 4: direction, no children

Target `A` has no children. `instruction` is
`"  cheaper options  "`.

Expected: Part 1, a blank line, then Part 3 with the direction
`cheaper options`.

### Case 5: children and direction

As case 2, with the direction of case 4.

Expected: Part 1, Part 2, Part 3, in that order, each separated
by one blank line.

### Case 6: blank direction

`instruction` is `"   "`.

Expected: the same message as case 1.

### Case 7: invalid direction

`instruction` is `7`, or a string of 501 characters after
trimming.

Expected: 400. The model is not called.

### Case 8: idea too long

The model answers with 3 ideas, one of them 301 characters long
after trimming.

Expected: 502. Nothing is written.

### Case 9: root target

The target is the root, with no children and no direction.

Expected: the context is one `user` message, followed by the
trailing `user` message of case 1.

## Tuning log

Empty until the second PR. Each entry records the date, what
changed, the sample graphs it was tried on, and why.

## AI usage

Claude (an AI assistant) drafted this file and proposed each
decision. Cole makes each decision.
