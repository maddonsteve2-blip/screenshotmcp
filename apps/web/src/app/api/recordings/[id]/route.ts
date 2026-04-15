import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { getInternalApiBase, getInternalApiHeaders } from "@/lib/internal-api";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { id } = await params;

  try {
    const res = await fetch(`${getInternalApiBase()}/v1/recordings/${id}`, {
      method: "DELETE",
      headers: getInternalApiHeaders(user.id),
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
