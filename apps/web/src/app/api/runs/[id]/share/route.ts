import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { runs } from "@screenshotsmcp/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function buildShareUrl(token: string) {
  return `${APP_URL}/shared/runs/${encodeURIComponent(token)}`;
}

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
  const [run] = await db
    .select({
      id: runs.id,
      shareToken: runs.shareToken,
      sharedAt: runs.sharedAt,
    })
    .from(runs)
    .where(and(eq(runs.id, id), eq(runs.userId, user.id)));

  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  return NextResponse.json({
    shareToken: run.shareToken,
    sharedAt: run.sharedAt?.toISOString() ?? null,
    shareUrl: run.shareToken ? buildShareUrl(run.shareToken) : null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const regenerate = Boolean(body?.regenerate);

  const [existingRun] = await db
    .select({
      id: runs.id,
      shareToken: runs.shareToken,
    })
    .from(runs)
    .where(and(eq(runs.id, id), eq(runs.userId, user.id)));

  if (!existingRun) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const shareToken = !regenerate && existingRun.shareToken
    ? existingRun.shareToken
    : `runshare_${nanoid(24)}`;

  await db
    .update(runs)
    .set({
      shareToken,
      sharedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(runs.id, existingRun.id));

  return NextResponse.json({
    shareToken,
    shareUrl: buildShareUrl(shareToken),
    sharedAt: new Date().toISOString(),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { id } = await params;
  const [run] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.id, id), eq(runs.userId, user.id)));

  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  await db
    .update(runs)
    .set({
      shareToken: null,
      sharedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(runs.id, run.id));

  return NextResponse.json({ success: true });
}
