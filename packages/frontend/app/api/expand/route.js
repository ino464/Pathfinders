import { NextResponse } from "next/server";
import { ExpandError, expandNode } from "../../../lib/expand";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_DIRECTION_LENGTH = 500;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "The request body must be JSON." },
      { status: 400 }
    );
  }

  const { sessionId, nodeId, instruction } = body ?? {};
  if (!UUID.test(sessionId) || !UUID.test(nodeId)) {
    return NextResponse.json(
      { error: "sessionId and nodeId must be UUIDs." },
      { status: 400 }
    );
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
      nodeId,
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
