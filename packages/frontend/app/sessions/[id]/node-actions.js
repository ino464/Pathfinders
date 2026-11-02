"use server";

import {
  addManualChild,
  updateNodeContent,
  updateNodeStatus
} from "../../../lib/graph-data";
import { NODE_STATUSES } from "../../../lib/node-status";

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

// Adds one validated child to the selected parent node.
export async function addManualChildAction(
  sessionId,
  parentId,
  content
) {
  if (
    !validNodeId(sessionId) ||
    !validNodeId(parentId) ||
    !validContent(content)
  ) {
    return null;
  }

  return addManualChild(sessionId, parentId, content.trim());
}

// Sets a selected node to one of the database-supported statuses.
export async function setNodeStatusAction(
  sessionId,
  nodeId,
  status
) {
  if (
    !validNodeId(sessionId) ||
    !validNodeId(nodeId) ||
    !NODE_STATUSES.includes(status)
  ) {
    return null;
  }

  return updateNodeStatus(nodeId, status);
}
