import { orderedContext } from "./context-assembly";
import { getExpansionInputs } from "./graph-data";
import { requestCompletion } from "./groq";

export const MODEL = "openai/gpt-oss-120b";
export const TIMEOUT_MS = 15_000;

export const CHAT_INSTRUCTION =
  "You are talking with a user about their brainstorm. The " +
  "next message lists the ideas that lead to the ones the " +
  "user selected, and marks the selected ideas. Answer the " +
  "user's messages about those ideas in plain, " +
  "conversational text. Keep each reply to a few sentences " +
  "unless the user asks for more. Do not use JSON, Markdown " +
  "headings or tables. Nothing you write is added to the " +
  "brainstorm.";

export const OUTLINE_INTRO =
  "These are the ideas that lead to the ones the user " +
  "selected, from the starting prompt down. The selected " +
  "ideas are marked (selected).";

export class ChatError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function byCreatedAtThenId(a, b) {
  const time =
    Date.parse(a.created_at) - Date.parse(b.created_at);
  if (time !== 0) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildSystemMessage(preferences = []) {
  if (preferences.length === 0) return CHAT_INSTRUCTION;

  return [
    CHAT_INSTRUCTION,
    [
      "The user set these preferences for the whole session:",
      ...[...preferences]
        .sort(byCreatedAtThenId)
        .map((p) => `- ${collapseWhitespace(p.content)}`),
      "Follow all of them in every reply."
    ].join("\n")
  ].join("\n\n");
}

export function buildOutline(nodes, edges, targetIds) {
  const { ordered, root } = orderedContext(
    nodes,
    edges,
    targetIds
  );

  const lines = ordered.map((node) => {
    const mark = targetIds.includes(node.id)
      ? " (selected)"
      : "";
    const content = collapseWhitespace(node.content);
    return node.id === root.id
      ? `Starting prompt: ${content}${mark}`
      : `- ${content}${mark}`;
  });

  return [OUTLINE_INTRO, ...lines].join("\n");
}

export function buildChatMessages(
  { nodes, edges, preferences },
  targetIds,
  history,
  message
) {
  return [
    {
      role: "system",
      content: buildSystemMessage(preferences)
    },
    {
      role: "user",
      content: buildOutline(nodes, edges, targetIds)
    },
    ...history.map(({ role, content }) => ({ role, content })),
    { role: "user", content: message }
  ];
}

export async function chatAboutNodes(
  sessionId,
  nodeIds,
  history,
  message
) {
  const inputs = await getExpansionInputs(sessionId);

  for (const id of nodeIds) {
    const target = inputs.nodes.find((n) => n.id === id);
    if (!target || target.deleted_at) {
      throw new ChatError(
        404,
        "Node not found in this session."
      );
    }
  }

  const messages = buildChatMessages(
    inputs,
    nodeIds,
    history,
    message
  );

  let text;
  try {
    text = await requestCompletion(messages, {
      model: MODEL,
      timeoutMs: TIMEOUT_MS,
      responseFormat: "text"
    });
  } catch (err) {
    console.error(err);
    if (err.name === "TimeoutError") {
      throw new ChatError(
        504,
        "The model did not answer in time."
      );
    }
    throw new ChatError(502, "The model request failed.");
  }

  const reply = text.trim();
  if (reply === "") {
    throw new ChatError(
      502,
      "The model answered with an empty reply."
    );
  }
  return { reply };
}
