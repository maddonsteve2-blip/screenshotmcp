import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { getInternalApiBase, getInternalApiHeaders } from "@/lib/internal-api";

/**
 * GET /api/screenshots — proxies to the paginated screenshots list on the API.
 * Forwards every search param (q, status, artifact, before, limit, sessionId)
 * as-is so the upstream handles filtering and pagination.
 */
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const qs = req.nextUrl.searchParams.toString();
  const suffix = qs ? `?${qs}` : "";

  try {
    const res = await fetch(`${getInternalApiBase()}/v1/screenshots${suffix}`, {
      headers: getInternalApiHeaders(user.id),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server configuration error" },
      { status: 500 },
    );
  }
}
