import "server-only";
import { createClient } from "./supabase-server";

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

export async function createSession(rootContent, title = null) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Not signed in");

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({ user_id: user.id, title })
    .select()
    .single();
  if (sessionError) throw sessionError;

  const { data: rootNode, error: nodeError } = await supabase
    .from("nodes")
    .insert({ session_id: session.id, content: rootContent })
    .select()
    .single();
  if (nodeError) throw nodeError;

  const { data: updatedSession, error: updateError } =
    await supabase
      .from("sessions")
      .update({ root_node_id: rootNode.id })
      .eq("id", session.id)
      .select()
      .single();
  if (updateError) throw updateError;

  return { session: updatedSession, rootNode };
}

export async function getSessionGraph(sessionId) {
  const supabase = await createClient();

  const [nodesResult, edgesResult] = await Promise.all([
    supabase
      .from("nodes")
      .select("id, content, status, position_x, position_y")
      .eq("session_id", sessionId)
      .is("deleted_at", null),
    supabase
      .from("edges")
      .select("id, parent_node_id, child_node_id")
      .eq("session_id", sessionId)
  ]);
  if (nodesResult.error) throw nodesResult.error;
  if (edgesResult.error) throw edgesResult.error;

  const liveIds = new Set(
    nodesResult.data.map((node) => node.id)
  );
  const liveEdges = edgesResult.data.filter(
    (edge) =>
      liveIds.has(edge.parent_node_id) &&
      liveIds.has(edge.child_node_id)
  );

  return {
    nodes: nodesResult.data.map(toFlowNode),
    edges: liveEdges.map(toFlowEdge)
  };
}

export async function addNode(
  sessionId,
  content,
  position = null
) {
  const supabase = await createClient();

  const { data: node, error } = await supabase
    .from("nodes")
    .insert({
      session_id: sessionId,
      content,
      position_x: position?.x ?? null,
      position_y: position?.y ?? null
    })
    .select("id, content, status, position_x, position_y")
    .single();
  if (error) throw error;

  return toFlowNode(node);
}

function createsCycle(edges, parentId, childId) {
  const parentsOf = new Map();
  for (const edge of edges) {
    const parents = parentsOf.get(edge.child_node_id) ?? [];
    parents.push(edge.parent_node_id);
    parentsOf.set(edge.child_node_id, parents);
  }

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

  const { data: edges, error: edgesError } = await supabase
    .from("edges")
    .select("parent_node_id, child_node_id")
    .eq("session_id", sessionId);
  if (edgesError) throw edgesError;

  if (createsCycle(edges, parentId, childId)) {
    throw new Error("This edge would create a loop");
  }

  const { data: edge, error } = await supabase
    .from("edges")
    .insert({
      session_id: sessionId,
      parent_node_id: parentId,
      child_node_id: childId
    })
    .select("id, parent_node_id, child_node_id")
    .single();
  if (error) throw error;

  return toFlowEdge(edge);
}

export async function updateNodeStatus(nodeId, status) {
  if (typeof status !== "string" || status.trim() === "") {
    throw new Error("Status must be a non-empty string");
  }

  const supabase = await createClient();

  const { data: node, error } = await supabase
    .from("nodes")
    .update({ status })
    .eq("id", nodeId)
    .select("id, content, status, position_x, position_y")
    .single();
  if (error) throw error;

  return toFlowNode(node);
}

function findSubtree(liveIds, edges, nodeId) {
  const parentsOf = new Map();
  const childrenOf = new Map();
  for (const edge of edges) {
    if (!liveIds.has(edge.parent_node_id)) continue;
    if (!liveIds.has(edge.child_node_id)) continue;
    const parents = parentsOf.get(edge.child_node_id) ?? [];
    parents.push(edge.parent_node_id);
    parentsOf.set(edge.child_node_id, parents);
    const children = childrenOf.get(edge.parent_node_id) ?? [];
    children.push(edge.child_node_id);
    childrenOf.set(edge.parent_node_id, children);
  }

  const doomed = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of doomed) {
      for (const child of childrenOf.get(id) ?? []) {
        if (doomed.has(child)) continue;
        const parents = parentsOf.get(child);
        if (parents.every((parent) => doomed.has(parent))) {
          doomed.add(child);
          changed = true;
        }
      }
    }
  }
  return [...doomed];
}

export async function deleteSubtree(sessionId, nodeId) {
  const supabase = await createClient();

  const [nodesResult, edgesResult] = await Promise.all([
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
  if (nodesResult.error) throw nodesResult.error;
  if (edgesResult.error) throw edgesResult.error;

  const liveIds = new Set(
    nodesResult.data.map((node) => node.id)
  );
  if (!liveIds.has(nodeId)) {
    throw new Error("Node not found in this session");
  }

  const ids = findSubtree(liveIds, edgesResult.data, nodeId);

  const { error } = await supabase
    .from("nodes")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;

  return ids;
}
