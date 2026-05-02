import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { screenshots } from "@deepsyte/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { id } = await params;
  const [row] = await db
    .select({ id: screenshots.id, annotations: screenshots.annotations })
    .from(screenshots)
    .where(and(eq(screenshots.id, id), eq(screenshots.userId, user.id)));

  if (!row) return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });

  return NextResponse.json({ annotations: row.annotations ?? [] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { id } = await params;
  const body = await req.json().catch(() => null) as { annotations?: unknown } | null;
  if (!body || !Array.isArray(body.annotations)) {
    return NextResponse.json({ error: "annotations must be an array" }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: screenshots.id })
    .from(screenshots)
    .where(and(eq(screenshots.id, id), eq(screenshots.userId, user.id)));

  if (!existing) return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });

  await db
    .update(screenshots)
    .set({
      annotations: body.annotations,
      updatedAt: new Date(),
    })
    .where(eq(screenshots.id, existing.id));

  return NextResponse.json({ success: true, annotations: body.annotations });
}
