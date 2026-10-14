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
