import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { getInternalApiBase, getInternalApiHeaders } from "@/lib/internal-api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { id } = await params;
  try {
    const res = await fetch(`${getInternalApiBase()}/v1/runs/${encodeURIComponent(id)}/live`, {
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
