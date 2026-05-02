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

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dbUserId = await getDbUserId(clerkId);
  if (!dbUserId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const res = await fetch(`${getInternalApiBase()}/v1/webhooks`, {
    headers: getInternalApiHeaders(dbUserId),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dbUserId = await getDbUserId(clerkId);
  if (!dbUserId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${getInternalApiBase()}/v1/webhooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getInternalApiHeaders(dbUserId) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
