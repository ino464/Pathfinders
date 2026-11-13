import { NextResponse } from "next/server";
import { ChatError, chatAboutNodes } from "../../../lib/chat";
import { createClient } from "../../../lib/supabase-server";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_NODES = 2;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_TURNS = 10;
const MAX_TURN_LENGTH = 4000;
const ROLES = new Set(["user", "assistant"]);

function badRequest(error) {
  return NextResponse.json({ error }, { status: 400 });
}

function readNodeIds(nodeIds) {
  if (
    !Array.isArray(nodeIds) ||
    nodeIds.length < 1 ||
    nodeIds.length > MAX_NODES ||
    !nodeIds.every(
      (id) => typeof id === "string" && UUID.test(id)
    )
  ) {
    return {
      error: "nodeIds must be a list of one or two UUIDs."
    };
  }

  const distinct = new Set(
    nodeIds.map((id) => id.toLowerCase())
  );
  if (distinct.size !== nodeIds.length) {
    return { error: "nodeIds must not repeat a node." };
  }

  return { ids: nodeIds };
}

function readHistory(history) {
  if (history === undefined) return { turns: [] };
  if (!Array.isArray(history)) {
    return { error: "history must be a list of turns." };
  }

  const turns = history.slice(-MAX_HISTORY_TURNS);
  for (const turn of turns) {
    if (!ROLES.has(turn?.role)) {
      return {
        error:
          "Each history turn must have the role user or assistant."
      };
    }
    if (typeof turn.content !== "string") {
      return {
        error: "Each history turn must have string content."
      };
    }
    if (turn.content.length > MAX_TURN_LENGTH) {
      return {
        error: `Each history turn must be at most ${MAX_TURN_LENGTH} characters.`
      };
    }
  }

  return {
    turns: turns.map(({ role, content }) => ({ role, content }))
  };
}

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to chat about ideas." },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("The request body must be JSON.");
  }

  const { sessionId, nodeIds, history, message } = body ?? {};
  if (!UUID.test(sessionId)) {
    return badRequest("sessionId must be a UUID.");
  }

  const { ids, error: nodeError } = readNodeIds(nodeIds);
  if (nodeError) return badRequest(nodeError);

  const { turns, error: historyError } = readHistory(history);
  if (historyError) return badRequest(historyError);

  if (typeof message !== "string" || message.trim() === "") {
    return badRequest("message must be a non-empty string.");
  }
  const text = message.trim();
  if (text.length > MAX_MESSAGE_LENGTH) {
    return badRequest(
      `message must be at most ${MAX_MESSAGE_LENGTH} characters.`
    );
  }

  try {
    const result = await chatAboutNodes(
      sessionId,
      ids,
      turns,
      text
    );
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof ChatError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status }
      );
    }
    console.error(err);
    return NextResponse.json(
      { error: "The chat reply failed." },
      { status: 500 }
    );
  }
}
