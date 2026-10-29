import "server-only";
import { NODE_STATUSES } from "./node-status";
import { createClient } from "./supabase-server";

// The columns that toFlowNode reads.
const FLOW_NODE_COLUMNS =
  "id, content, status, position_x, position_y";

function toFlowNode(node) {
  return {
    id: node.id,
    position: {
      x: Number(node.position_x ?? 0),
      y: Number(node.position_y ?? 0)
    },
    data: { content: node.content, status: node.status }
  };
}

function toFlowEdge(edge) {
  return {
    id: edge.id,
    source: edge.parent_node_id,
    target: edge.child_node_id
  };
}

// Returns the data of a Supabase result, or throws its error.
function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

function addTo(map, key, value) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

// Maps each node id to the ids of its parents and children.
function buildEdgeLookups(edges) {
  const parentsOf = new Map();
  const childrenOf = new Map();
  for (const edge of edges) {
    addTo(parentsOf, edge.child_node_id, edge.parent_node_id);
    addTo(childrenOf, edge.parent_node_id, edge.child_node_id);
  }
  return { parentsOf, childrenOf };
}

// Keeps only the edges whose parent and child are both live.
function edgesBetween(liveIds, edges) {
  return edges.filter(
    (edge) =>
      liveIds.has(edge.parent_node_id) &&
      liveIds.has(edge.child_node_id)
  );
}

export async function createSession(rootContent, title = null) {
  const supabase = await createClient();

  const { user } = unwrap(await supabase.auth.getUser());
  if (!user) throw new Error("Not signed in");

  const session = unwrap(
    await supabase
      .from("sessions")
      .insert({ user_id: user.id, title })
      .select()
      .single()
  );

  const rootNode = unwrap(
    await supabase
      .from("nodes")
      .insert({ session_id: session.id, content: rootContent })
      .select()
      .single()
  );

  const updatedSession = unwrap(
    await supabase
      .from("sessions")
      .update({ root_node_id: rootNode.id })
      .eq("id", session.id)
      .select()
      .single()
  );

  return { session: updatedSession, rootNode };
}

export async function getSessionGraph(sessionId) {
  const supabase = await createClient();

  const results = await Promise.all([
    supabase
      .from("nodes")
      .select(FLOW_NODE_COLUMNS)
      .eq("session_id", sessionId)
      .is("deleted_at", null),
    supabase
      .from("edges")
      .select("id, parent_node_id, child_node_id")
      .eq("session_id", sessionId)
  ]);
  const [nodes, edges] = results.map(unwrap);

  const liveIds = new Set(nodes.map((node) => node.id));
  const liveEdges = edgesBetween(liveIds, edges);

  return {
    nodes: nodes.map(toFlowNode),
    edges: liveEdges.map(toFlowEdge)
  };
}

// Raw rows for context assembly, which needs created_at and
// deleted_at. Deleted nodes and their edges are included on
// purpose: context assembly decides how to treat them.
export async function getExpansionInputs(sessionId) {
  const supabase = await createClient();

  const results = await Promise.all([
    supabase
      .from("nodes")
      .select("id, content, status, created_at, deleted_at")
      .eq("session_id", sessionId),
    supabase
      .from("edges")
      .select("parent_node_id, child_node_id")
      .eq("session_id", sessionId),
    supabase
      .from("preferences")
      .select("id, content, created_at")
      .eq("session_id", sessionId)
  ]);
  const [nodes, edges, preferences] = results.map(unwrap);

  return { nodes, edges, preferences };
}

// Writes the children and their edges in one transaction
// through the add_children database function, so a failure
// leaves no node without a parent.
export async function addChildren(
  sessionId,
  parentId,
  contents
) {
  const supabase = await createClient();

  const data = unwrap(
    await supabase.rpc("add_children", {
      p_session_id: sessionId,
      p_parent_node_id: parentId,
      p_contents: contents
    })
  );

  return {
    nodes: data.nodes.map(toFlowNode),
    edges: data.edges.map(toFlowEdge)
  };
}

export async function addNode(
  sessionId,
  content,
  position = null
) {
  const supabase = await createClient();

  const node = unwrap(
    await supabase
      .from("nodes")
      .insert({
        session_id: sessionId,
        content,
        position_x: position?.x ?? null,
        position_y: position?.y ?? null
      })
      .select(FLOW_NODE_COLUMNS)
      .single()
  );

  return toFlowNode(node);
}

function createsCycle(edges, parentId, childId) {
  const { parentsOf } = buildEdgeLookups(edges);

  const toVisit = [parentId];
  const visited = new Set();
  while (toVisit.length > 0) {
    const id = toVisit.pop();
    if (id === childId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    toVisit.push(...(parentsOf.get(id) ?? []));
  }
  return false;
}

export async function addEdge(sessionId, parentId, childId) {
  const supabase = await createClient();

  const edges = unwrap(
    await supabase
      .from("edges")
      .select("parent_node_id, child_node_id")
      .eq("session_id", sessionId)
  );

  if (createsCycle(edges, parentId, childId)) {
    throw new Error("This edge would create a loop");
  }

  const edge = unwrap(
    await supabase
      .from("edges")
      .insert({
        session_id: sessionId,
        parent_node_id: parentId,
        child_node_id: childId
      })
      .select("id, parent_node_id, child_node_id")
      .single()
  );

  return toFlowEdge(edge);
}

export async function updateNodeStatus(nodeId, status) {
  if (!NODE_STATUSES.includes(status)) {
    throw new Error(
      `Status must be one of ${NODE_STATUSES.join(", ")}`
    );
  }

  const supabase = await createClient();

  const node = unwrap(
    await supabase
      .from("nodes")
      .update({ status })
      .eq("id", nodeId)
      .select(FLOW_NODE_COLUMNS)
      .single()
  );

  return toFlowNode(node);
}

function findSubtree(liveIds, edges, nodeId) {
  const { parentsOf, childrenOf } = buildEdgeLookups(
    edgesBetween(liveIds, edges)
  );

  const toDelete = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of toDelete) {
      for (const child of childrenOf.get(id) ?? []) {
        if (toDelete.has(child)) continue;
        const parents = parentsOf.get(child);
        if (parents.every((parent) => toDelete.has(parent))) {
          toDelete.add(child);
          changed = true;
        }
      }
    }
  }
  return [...toDelete];
}

export async function deleteSubtree(sessionId, nodeId) {
  const supabase = await createClient();

  const results = await Promise.all([
    supabase
      .from("nodes")
      .select("id")
      .eq("session_id", sessionId)
      .is("deleted_at", null),
    supabase
      .from("edges")
      .select("parent_node_id, child_node_id")
      .eq("session_id", sessionId)
  ]);
  const [nodes, edges] = results.map(unwrap);

  const liveIds = new Set(nodes.map((node) => node.id));
  if (!liveIds.has(nodeId)) {
    throw new Error("Node not found in this session");
  }

  const ids = findSubtree(liveIds, edges, nodeId);

  unwrap(
    await supabase
      .from("nodes")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids)
  );

  return ids;
}
