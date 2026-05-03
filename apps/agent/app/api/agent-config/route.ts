import { NextResponse } from "next/server";

export async function GET() {
  const apiUrl = process.env.DEEPSYTE_API_URL || "https://api.deepsyte.com";
  const apiKey = process.env.DEEPSYTE_AGENT_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPSYTE_AGENT_API_KEY not configured" },
      { status: 500 }
    );
  }

  return NextResponse.json({ apiUrl, apiKey });
}
