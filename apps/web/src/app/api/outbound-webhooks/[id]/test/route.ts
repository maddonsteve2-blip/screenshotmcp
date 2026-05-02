import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@deepsyte/db";
import { getInternalApiBase, getInternalApiHeaders } from "@/lib/internal-api";

async function getDbUserId(clerkId: string): Promise<string | null> {
  const db = getDb();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId));
  return user?.id ?? null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dbUserId = await getDbUserId(clerkId);
  if (!dbUserId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { id } = await params;
  const res = await fetch(`${getInternalApiBase()}/v1/webhooks/${id}/test`, {
    method: "POST",
    headers: getInternalApiHeaders(dbUserId),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
