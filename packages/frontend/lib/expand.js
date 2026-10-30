import { assembleContext } from "./context-assembly";
import { addChildren, getExpansionInputs } from "./graph-data";
import { requestCompletion } from "./groq";

export const MODEL = "openai/gpt-oss-120b";
export const CHILD_COUNT = 3;
export const TIMEOUT_MS = 15_000;
export const RATE_LIMIT_EXPANSIONS = 10;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export const MAX_LISTED_CHILDREN = 20;
export const MAX_IDEA_LENGTH = 300;

export const BASE_INSTRUCTION =
  "Suggest 3 new ideas that build on the last message above. " +
  "Each idea is one sentence of at most 25 words. " +
  "Make the 3 ideas clearly different from each other and " +
  "from every idea above. Write each idea as a statement, " +
  "without numbering, labels or questions. Answer with JSON " +
  'only, in the form {"ideas": ["...", "...", "..."]}, with ' +
  "exactly 3 strings.";

function collapseWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function byCreatedAtThenId(a, b) {
  const time =
    Date.parse(a.created_at) - Date.parse(b.created_at);
  if (time !== 0) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildInstruction(children, direction) {
  const parts = [BASE_INSTRUCTION];

  const listed = children
    .filter((c) => !c.deleted_at)
    .sort(byCreatedAtThenId)
    .slice(-MAX_LISTED_CHILDREN);
  if (listed.length > 0) {
    parts.push(
      [
        "These ideas already branch from the last message, so do not repeat them:",
        ...listed.map(
          (c) => `- ${collapseWhitespace(c.content)}`
        )
      ].join("\n")
    );
  }

  const steer = collapseWhitespace(direction ?? "");
  if (steer !== "") {
    parts.push(
      `The user wants this direction: ${steer}\n` +
        "Follow it, but keep the answer format above."
    );
  }

  return parts.join("\n\n");
}

export class ExpandError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Returns the trimmed ideas, or throws when the model's answer
// is not exactly CHILD_COUNT non-empty strings of at most
// MAX_IDEA_LENGTH characters in an "ideas" array, or when two
// ideas are equal ignoring case. Nothing is written when this
// throws.
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
  if (trimmed.some((idea) => idea.length > MAX_IDEA_LENGTH)) {
    throw new ExpandError(
      502,
      "The model answered with an idea that is too long."
    );
  }
  const distinct = new Set(
    trimmed.map((idea) => idea.toLowerCase())
  );
  if (distinct.size !== trimmed.length) {
    throw new ExpandError(
      502,
      "The model answered with the same idea twice."
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

export async function expandNode(
  sessionId,
  nodeId,
  direction = ""
) {
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
  const childIds = new Set(
    edges
      .filter((e) => e.parent_node_id === nodeId)
      .map((e) => e.child_node_id)
  );
  const children = nodes.filter((n) => childIds.has(n.id));
  messages.push({
    role: "user",
    content: buildInstruction(children, direction)
  });

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
