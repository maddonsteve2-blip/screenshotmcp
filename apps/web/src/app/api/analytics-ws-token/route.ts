import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@screenshotsmcp/db";
import { eq } from "drizzle-orm";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://screenshotsmcp-api-production.up.railway.app";
const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET ?? "").trim();

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId));
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Build WebSocket URL with internal auth
  const wsBase = API_BASE.replace(/^https?:\/\//, (m) => m === "https://" ? "wss://" : "ws://");
  const wsUrl = `${wsBase}/ws/analytics?internal=${encodeURIComponent(`${INTERNAL_SECRET}:${user.id}`)}`;

  return NextResponse.json({ wsUrl });
}
