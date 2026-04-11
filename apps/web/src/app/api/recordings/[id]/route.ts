import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://screenshotsmcp-api-production.up.railway.app";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Proxy to Railway API
  const res = await fetch(`${API_URL}/v1/recordings/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${clerkId}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
