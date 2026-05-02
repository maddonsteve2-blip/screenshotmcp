import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@deepsyte/db";
import { eq } from "drizzle-orm";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://deepsyte-api-production.up.railway.app";
const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET ?? "").trim();

async function getDbUserId(clerkId: string): Promise<string | null> {
  const db = getDb();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId));
  return user?.id ?? null;
}

// POST: proxy screenshot request to API server using internal auth
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUserId = await getDbUserId(clerkId);
  if (!dbUserId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await req.json();

  if (!INTERNAL_SECRET) {
    console.error("[playground proxy] INTERNAL_API_SECRET is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const res = await fetch(`${API_BASE}/v1/screenshot`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Internal ${INTERNAL_SECRET}:${dbUserId}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("[playground proxy] API returned", res.status, data);
  }
  return NextResponse.json(data, { status: res.status });
}
