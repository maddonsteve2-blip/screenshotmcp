import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { screenshots } from "@screenshotsmcp/db";

/**
 * Public, unauthenticated endpoint that returns the image URL +
 * annotations for a shared screenshot. Used by the `/shared/screenshots/[token]`
 * page. Returns 404 if the token is unknown or has been revoked.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const db = getDb();
  const [row] = await db
    .select({
      id: screenshots.id,
      url: screenshots.url,
      publicUrl: screenshots.publicUrl,
      width: screenshots.width,
      height: screenshots.height,
      annotations: screenshots.annotations,
      sharedAt: screenshots.sharedAt,
      pageTitle: screenshots.pageTitle,
    })
    .from(screenshots)
    .where(eq(screenshots.shareToken, token));

  if (!row || !row.publicUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    url: row.url,
    publicUrl: row.publicUrl,
    width: row.width,
    height: row.height,
    pageTitle: row.pageTitle,
    annotations: row.annotations ?? [],
    sharedAt: row.sharedAt?.toISOString() ?? null,
  });
}
