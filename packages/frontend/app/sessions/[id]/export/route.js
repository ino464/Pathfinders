import { NextResponse } from "next/server";
import {
  getExpansionInputs,
  getSession
} from "../../../../lib/graph-data";
import {
  exportFileName,
  serializeSession
} from "../../../../lib/session-export";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Downloads one session as a file (US-10). The proxy sends a
// signed-out user to /login, and RLS makes getSession return null
// for someone else's session, so both missing cases are a 404.
export async function GET(_request, { params }) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json(
      { error: "Session not found." },
      { status: 404 }
    );
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json(
      { error: "Session not found." },
      { status: 404 }
    );
  }

  const inputs = await getExpansionInputs(session.id);
  const file = serializeSession(
    { session, ...inputs },
    new Date().toISOString()
  );

  return new Response(JSON.stringify(file, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${exportFileName(session.title)}"`
    }
  });
}
