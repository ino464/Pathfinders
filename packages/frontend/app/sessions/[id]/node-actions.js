"use server";

import { updateNodeContent } from "../../../lib/graph-data";

const MAX_NODE_CONTENT_LENGTH = 500;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validNodeId(nodeId) {
  return typeof nodeId === "string" && UUID.test(nodeId);
}

function validContent(content) {
  return (
    typeof content === "string" &&
    content.trim() !== "" &&
    content.trim().length <= MAX_NODE_CONTENT_LENGTH
  );
}

// Saves a selected node's text after validating client input.
export async function editNodeAction(
  sessionId,
  nodeId,
  content
) {
  if (
    !validNodeId(sessionId) ||
    !validNodeId(nodeId) ||
    !validContent(content)
  ) {
    return null;
  }

  return updateNodeContent(nodeId, content.trim());
}
