import { NextResponse } from "next/server";
import { ExpandError, expandNode } from "../../../lib/expand";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const { sessionId, nodeId } = body ?? {};
  if (!UUID.test(sessionId) || !UUID.test(nodeId)) {
    return NextResponse.json(
      { error: "sessionId and nodeId must be UUIDs." },
      { status: 400 }
    );
  }

  try {
    const children = await expandNode(sessionId, nodeId);
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
