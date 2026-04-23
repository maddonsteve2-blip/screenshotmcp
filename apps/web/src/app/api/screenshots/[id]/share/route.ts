import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { screenshots } from "@screenshotsmcp/db";

function buildShareUrl(req: NextRequest, token: string) {
  // Prefer the request origin so we always use the canonical domain
  const origin = req.headers.get("origin") || req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  
  if (origin) {
    // If we got an origin header, use it directly (it includes protocol)
    if (origin.startsWith("http://") || origin.startsWith("https://")) {
      return `${origin}/shared/screenshots/${encodeURIComponent(token)}`;
    }
    // Otherwise construct from host + protocol
    return `${proto}://${origin}/shared/screenshots/${encodeURIComponent(token)}`;
  }
  
  // Fallback to canonical domain
  return `https://www.screenshotmcp.com/shared/screenshots/${encodeURIComponent(token)}`;
}

export async function GET(
  req: NextRequest,
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
    shareUrl: row.shareToken ? buildShareUrl(req, row.shareToken) : null,
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
    shareUrl: buildShareUrl(req, shareToken),
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
