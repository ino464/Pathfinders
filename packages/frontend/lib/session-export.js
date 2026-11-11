// Builds the export file for one session (US-10). The format is
// specified in docs/session-export-format.md, which import reads.

export const EXPORT_FORMAT = "pathfinders-session";
export const EXPORT_VERSION = 1;

function byCreatedAtThenId(a, b) {
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareEdges(a, b) {
  if (a.parentId !== b.parentId) {
    return a.parentId < b.parentId ? -1 : 1;
  }
  return a.childId < b.childId
    ? -1
    : a.childId > b.childId
      ? 1
      : 0;
}

// Takes the raw rows from getSession and getExpansionInputs.
// Soft-deleted nodes and every edge that touches one are left
// out, as getSessionGraph does, so a pruned branch is absent and
// a child that still has a live parent stays.
export function serializeSession(
  { session, nodes, edges, preferences },
  exportedAt
) {
  const liveNodes = nodes
    .filter((node) => node.deleted_at == null)
    .sort(byCreatedAtThenId);
  const liveIds = new Set(liveNodes.map((node) => node.id));

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt,
    session: {
      title: session.title ?? null,
      rootNodeId: liveIds.has(session.root_node_id)
        ? session.root_node_id
        : null
    },
    nodes: liveNodes.map((node) => ({
      id: node.id,
      content: node.content,
      status: node.status,
      createdAt: node.created_at
    })),
    edges: edges
      .filter(
        (edge) =>
          liveIds.has(edge.parent_node_id) &&
          liveIds.has(edge.child_node_id)
      )
      .map((edge) => ({
        parentId: edge.parent_node_id,
        childId: edge.child_node_id
      }))
      .sort(compareEdges),
    preferences: [...preferences]
      .sort(byCreatedAtThenId)
      .map((preference) => ({
        content: preference.content,
        createdAt: preference.created_at
      }))
  };
}

// A file name made from the session title, such as
// "my-ideas.pathfinders.json".
export function exportFileName(title) {
  const slug = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return `${slug || "session"}.pathfinders.json`;
}
