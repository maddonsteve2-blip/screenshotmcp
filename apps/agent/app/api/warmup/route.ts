import { NextResponse } from "next/server";

const API_URL = process.env.DEEPSYTE_API_URL || "https://api.deepsyte.com";

export async function GET() {
  try {
    await fetch(`${API_URL}/health`, { method: "GET", signal: AbortSignal.timeout(5000) });
  } catch {
    /* fire and forget — errors are fine, we just want to wake the worker */
  }
  return NextResponse.json({ ok: true });
}
