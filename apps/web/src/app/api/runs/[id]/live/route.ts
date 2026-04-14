import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://screenshotsmcp-api-production.up.railway.app";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { id } = await params;
  const res = await fetch(`${API_URL}/v1/runs/${encodeURIComponent(id)}/live`, {
    headers: { Authorization: `Bearer ${clerkId}` },
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
