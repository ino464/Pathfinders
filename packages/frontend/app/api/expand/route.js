import { NextResponse } from "next/server";
import { ExpandError, expandNode } from "../../../lib/expand";
import { createClient } from "../../../lib/supabase-server";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_DIRECTION_LENGTH = 500;
const MAX_NODES = 2;

// Reads the selected nodes from the body: `nodeIds` (one or two
// UUIDs, no repeats), or the older single `nodeId` until the
// client moves over (#73). Returns { ids } or { error }.
function readNodeIds({ nodeId, nodeIds }) {
  if (nodeId !== undefined && nodeIds !== undefined) {
    return { error: "Send nodeIds or nodeId, not both." };
  }

  if (nodeIds === undefined) {
    return UUID.test(nodeId)
      ? { ids: [nodeId] }
      : {
          error: "nodeIds must be a list of one or two UUIDs."
        };
  }

  if (
    !Array.isArray(nodeIds) ||
    nodeIds.length < 1 ||
    nodeIds.length > MAX_NODES ||
    !nodeIds.every(
      (id) => typeof id === "string" && UUID.test(id)
    )
  ) {
    return {
      error: `nodeIds must be a list of one or two UUIDs.`
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

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to expand ideas." },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "The request body must be JSON." },
      { status: 400 }
    );
  }

  const { sessionId, instruction } = body ?? {};
  if (!UUID.test(sessionId)) {
    return NextResponse.json(
      { error: "sessionId must be a UUID." },
      { status: 400 }
    );
  }

  const { ids, error } = readNodeIds(body);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  if (instruction != null && typeof instruction !== "string") {
    return NextResponse.json(
      { error: "instruction must be a string." },
      { status: 400 }
    );
  }

  const direction = (instruction ?? "").trim();
  if (direction.length > MAX_DIRECTION_LENGTH) {
    return NextResponse.json(
      {
        error: `instruction must be at most ${MAX_DIRECTION_LENGTH} characters.`
      },
      { status: 400 }
    );
  }

  try {
    const children = await expandNode(
      sessionId,
      ids,
      direction
    );
    return NextResponse.json(children, { status: 201 });
  } catch (err) {
    if (err instanceof ExpandError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status }
      );
    }
    console.error(err);
    return NextResponse.json(
      { error: "The expansion failed." },
      { status: 500 }
    );
  }
}
