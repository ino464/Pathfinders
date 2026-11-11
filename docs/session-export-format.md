# Session export format

The **Export** link on a session page downloads the session as
one JSON file (US-10, #74). This file is the specification for
that format. Import (US-11) reads files in this format, so build
import from this file and not from the exporter's source.

The exporter is `serializeSession` in
`packages/frontend/lib/session-export.js`. The route is
`GET /sessions/[id]/export`.

## Example

A session with a root `a`, two children `b` and `c`, and a
merged idea `d` whose parents are `b` and `c`:

```json
{
  "format": "pathfinders-session",
  "version": 1,
  "exportedAt": "2026-11-11T12:00:00.000Z",
  "session": {
    "title": "Trip ideas",
    "rootNodeId": "0b6c…-a"
  },
  "nodes": [
    {
      "id": "0b6c…-a",
      "content": "Plan a weekend trip",
      "status": "pending",
      "createdAt": "2026-11-01T10:00:00.123456+00:00"
    },
    {
      "id": "1d2e…-b",
      "content": "Go to the coast",
      "status": "accepted",
      "createdAt": "2026-11-01T10:01:00.000000+00:00"
    },
    {
      "id": "2f3a…-c",
      "content": "Go to the mountains",
      "status": "rejected",
      "createdAt": "2026-11-01T10:01:00.000001+00:00"
    },
    {
      "id": "3a4b…-d",
      "content": "A coastal mountain town",
      "status": "pending",
      "createdAt": "2026-11-01T10:02:00.000000+00:00"
    }
  ],
  "edges": [
    { "parentId": "0b6c…-a", "childId": "1d2e…-b" },
    { "parentId": "0b6c…-a", "childId": "2f3a…-c" },
    { "parentId": "1d2e…-b", "childId": "3a4b…-d" },
    { "parentId": "2f3a…-c", "childId": "3a4b…-d" }
  ],
  "preferences": [
    {
      "content": "Under $500",
      "createdAt": "2026-11-01T09:00:00.000000+00:00"
    }
  ]
}
```

The ids are shortened here. In a real file each id is a full
UUID.

## Top-level fields

| Field         | Type   | Meaning                                                                               |
| ------------- | ------ | ------------------------------------------------------------------------------------- |
| `format`      | string | Always `"pathfinders-session"`. Refuse a file with any other value.                   |
| `version`     | number | The format version. This file describes version `1`.                                  |
| `exportedAt`  | string | The time of the export, ISO 8601 in UTC, such as `2026-11-11T12:00:00.000Z`.          |
| `session`     | object | The session's own fields. See below.                                                  |
| `nodes`       | array  | Every live idea in the session. See below.                                            |
| `edges`       | array  | Every parent-to-child link between two live ideas. See below.                         |
| `preferences` | array  | The session's preferences, which context assembly adds to every expansion. See below. |

## `session`

| Field        | Type           | Meaning                                                                                     |
| ------------ | -------------- | ------------------------------------------------------------------------------------------- |
| `title`      | string or null | The session title. `null` means the session has no title; the app shows "Untitled session". |
| `rootNodeId` | string or null | The `id` of the root idea. `null` when the session has no root or the root was pruned.      |

When `rootNodeId` is not `null`, it is the `id` of one entry in
`nodes`.

## `nodes`

Each entry is one idea.

| Field       | Type   | Meaning                                                                                                                         |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | string | The idea's UUID in the exporting database. It is unique in the file. Edges and `rootNodeId` refer to it.                        |
| `content`   | string | The idea text. The app does not write empty text, but the database does not enforce it, so import must check it.                |
| `status`    | string | `"pending"`, `"accepted"` or `"rejected"`. The canvas shows `accepted` as a liked flag and `rejected` as a disliked flag (#91). |
| `createdAt` | string | When the idea was created, ISO 8601 with a UTC offset, as the database stores it.                                               |

The entries are in order of `createdAt`, then `id`. Context
assembly also orders ideas by creation time, so keep `createdAt`
when you import.

## `edges`

Each entry is one link from a parent idea to a child idea.

| Field      | Type   | Meaning                      |
| ---------- | ------ | ---------------------------- |
| `parentId` | string | The `id` of the parent idea. |
| `childId`  | string | The `id` of the child idea.  |

The entries are in order of `parentId`, then `childId`.

These rules hold for every exported file:

- Both ids of every edge are in `nodes`.
- An idea can have more than one parent. This is a merge: each
  parent has its own edge to the same child, as `d` shows in the
  example.
- The edges contain no loop. The app refuses an edge that would
  make one.

## `preferences`

Each entry is one preference.

| Field       | Type   | Meaning                                                                      |
| ----------- | ------ | ---------------------------------------------------------------------------- |
| `content`   | string | The preference text. As for an idea, import must check that it is not empty. |
| `createdAt` | string | When it was added, ISO 8601 with a UTC offset.                               |

The entries are in order of `createdAt`. The file does not
include preference ids, because nothing refers to a preference.

## What the file leaves out

- **Pruned ideas.** Pruning soft-deletes an idea and the
  descendants that have no other live parent. The file leaves
  out every soft-deleted idea and every edge that touches one,
  as the canvas does. A child that still has a live parent stays
  in the file, with only the edge from that live parent.
- **Positions.** The canvas computes the layout on every load
  (#70), so a stored position has no meaning.
- **Ownership and session ids.** The file holds no user id and
  no session id. Import creates a new session for the importing
  user.

## Notes for import

- The ids in the file are only references inside the file.
  Create new ids when you import, and map each old `id` to its
  new one before you write the edges.
- Check `format` and `version` first. Refuse a version that is
  higher than the one import supports.

## Versions

| Version | Change         |
| ------- | -------------- |
| 1       | First version. |

Increase `version` for any change that an older import cannot
read, such as a new required field or a field with a new
meaning. Add each version to this table.
