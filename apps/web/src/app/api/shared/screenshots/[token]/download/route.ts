import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { screenshots } from "@deepsyte/db";

function guessFileName(publicUrl: string, pageTitle: string | null, fallbackId: string) {
  const cleanTitle = (pageTitle ?? "shared-screenshot")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  const path = publicUrl.split("?")[0] ?? "";
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")) : ".png";
  return `${cleanTitle || fallbackId}${ext}`;
}

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
      publicUrl: screenshots.publicUrl,
      pageTitle: screenshots.pageTitle,
    })
    .from(screenshots)
    .where(eq(screenshots.shareToken, token));

  if (!row?.publicUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const upstream = await fetch(row.publicUrl, { cache: "no-store" }).catch(() => null);
  if (!upstream || !upstream.ok) {
    return NextResponse.json({ error: "Unable to fetch shared screenshot" }, { status: 502 });
  }

  const bytes = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const fileName = guessFileName(row.publicUrl, row.pageTitle, row.id);

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
