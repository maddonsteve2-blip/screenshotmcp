import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.MINIMAX_API_KEY;
  const baseURL = (process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1").replace(/\/+$/, "");

  if (!apiKey) {
    return NextResponse.json({ error: "MINIMAX_API_KEY is not set" }, { status: 500 });
  }

  const url = `${baseURL}/chat/completions`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "MiniMax-M2.7",
        messages: [{ role: "user", content: "Say 'ok' in one word" }],
        max_tokens: 10,
      }),
    });

    const body = await res.text();
    return NextResponse.json({
      status: res.status,
      statusText: res.statusText,
      url,
      apiKeyPrefix: apiKey.slice(0, 8) + "...",
      body: body.slice(0, 500),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), url }, { status: 500 });
  }
}
