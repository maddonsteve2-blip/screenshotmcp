import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { screenshots } from "@screenshotsmcp/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.screenshotmcp.com";

function buildShareUrl(token: string) {
  return `${APP_URL}/shared/screenshots/${encodeURIComponent(token)}`;
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
  const [row] = await db
    .select({
      id: screenshots.id,
      shareToken: screenshots.shareToken,
      sharedAt: screenshots.sharedAt,
    })
    .from(screenshots)
    .where(and(eq(screenshots.id, id), eq(screenshots.userId, user.id)));

  if (!row) return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });

  return NextResponse.json({
    shareToken: row.shareToken,
    sharedAt: row.sharedAt?.toISOString() ?? null,
    shareUrl: row.shareToken ? buildShareUrl(row.shareToken) : null,
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

  const [existing] = await db
    .select({ id: screenshots.id, shareToken: screenshots.shareToken })
    .from(screenshots)
    .where(and(eq(screenshots.id, id), eq(screenshots.userId, user.id)));

  if (!existing) return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });

  const shareToken = !regenerate && existing.shareToken
    ? existing.shareToken
    : `shotshare_${nanoid(24)}`;

  await db
    .update(screenshots)
    .set({ shareToken, sharedAt: new Date(), updatedAt: new Date() })
    .where(eq(screenshots.id, existing.id));

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
  const [row] = await db
    .select({ id: screenshots.id })
    .from(screenshots)
    .where(and(eq(screenshots.id, id), eq(screenshots.userId, user.id)));

  if (!row) return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });

  await db
    .update(screenshots)
    .set({ shareToken: null, sharedAt: null, updatedAt: new Date() })
    .where(eq(screenshots.id, row.id));

  return NextResponse.json({ success: true });
}
