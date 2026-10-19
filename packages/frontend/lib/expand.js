import { assembleContext } from "./context-assembly";
import { addChildren, getExpansionInputs } from "./graph-data";
import { requestCompletion } from "./groq";

export const MODEL = "llama-3.3-70b-versatile";
export const CHILD_COUNT = 3;
export const TIMEOUT_MS = 15_000;
export const RATE_LIMIT_EXPANSIONS = 10;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Minimal instruction so that the message list ends with a user
// message. Issue #52 replaces it with the tuned version and
// documents it in docs/.
export const INSTRUCTION =
  `Suggest ${CHILD_COUNT} different ideas that build on the ` +
  `last message above. Answer with JSON only, in the form ` +
  `{"ideas": ["...", "...", "..."]}, with exactly ` +
  `${CHILD_COUNT} strings.`;

export class ExpandError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Returns the trimmed ideas, or throws when the model's answer
// is not exactly CHILD_COUNT non-empty strings in an "ideas"
// array. Nothing is written when this throws.
export function parseIdeas(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ExpandError(
      502,
      "The model did not answer with valid JSON."
    );
  }

  const ideas = parsed?.ideas;
  if (!Array.isArray(ideas) || ideas.length !== CHILD_COUNT) {
    throw new ExpandError(
      502,
      `The model did not answer with exactly ${CHILD_COUNT} ideas.`
    );
  }

  const trimmed = ideas.map((idea) =>
    typeof idea === "string" ? idea.trim() : ""
  );
  if (trimmed.some((idea) => idea === "")) {
    throw new ExpandError(
      502,
      "The model answered with an empty idea."
    );
  }
  return trimmed;
}

// Each expansion creates CHILD_COUNT children, so the limit
// in nodes is RATE_LIMIT_EXPANSIONS * CHILD_COUNT. Only nodes
// with a parent count, so the root does not use up the limit.
export function isRateLimited(nodes, edges, now) {
  const childIds = new Set(edges.map((e) => e.child_node_id));
  const since = now - RATE_LIMIT_WINDOW_MS;
  const recent = nodes.filter(
    (n) =>
      childIds.has(n.id) && Date.parse(n.created_at) > since
  ).length;
  return (
    recent + CHILD_COUNT > RATE_LIMIT_EXPANSIONS * CHILD_COUNT
  );
}

export async function expandNode(sessionId, nodeId) {
  const { nodes, edges, preferences } =
    await getExpansionInputs(sessionId);

  const target = nodes.find((n) => n.id === nodeId);
  if (!target || target.deleted_at) {
    throw new ExpandError(
      404,
      "Node not found in this session."
    );
  }
  if (isRateLimited(nodes, edges, Date.now())) {
    throw new ExpandError(
      429,
      "Too many expansions in this session. Try again later."
    );
  }

  const messages = assembleContext(
    nodes,
    edges,
    nodeId,
    preferences
  );
  messages.push({ role: "user", content: INSTRUCTION });

  let text;
  try {
    text = await requestCompletion(messages, {
      model: MODEL,
      timeoutMs: TIMEOUT_MS
    });
  } catch (err) {
    console.error(err);
    if (err.name === "TimeoutError") {
      throw new ExpandError(
        504,
        "The model did not answer in time."
      );
    }
    throw new ExpandError(502, "The model request failed.");
  }

  const ideas = parseIdeas(text);
  return addChildren(sessionId, nodeId, ideas);
}
