import { NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  "https://deepsyte-api-production.up.railway.app";
const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET ?? "").trim();
const DEMO_USER_ID = (process.env.PUBLIC_DEMO_USER_ID ?? "demo-public-user").trim();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!INTERNAL_SECRET) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const { id } = await params;

  const res = await fetch(`${API_BASE}/v1/screenshot/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Internal ${INTERNAL_SECRET}:${DEMO_USER_ID}`,
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
