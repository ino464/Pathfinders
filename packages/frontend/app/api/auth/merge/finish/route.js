import { NextResponse } from "next/server";
import { finishGuestMerge } from "../../../../../lib/guest-merge";

export async function POST() {
  try {
    return NextResponse.json(await finishGuestMerge());
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
