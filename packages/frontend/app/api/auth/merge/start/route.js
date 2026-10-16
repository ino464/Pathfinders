import { NextResponse } from "next/server";
import { startGuestMerge } from "../../../../../lib/guest-merge";

export async function POST() {
  try {
    await startGuestMerge();
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
