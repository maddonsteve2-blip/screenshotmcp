import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { getInternalApiBase, getInternalApiHeaders } from "@/lib/internal-api";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const wsBase = getInternalApiBase().replace(/^https?:\/\//, (match) => (match === "https://" ? "wss://" : "ws://"));
  const internalAuth = getInternalApiHeaders(user.id).Authorization.replace(/^Internal\s+/, "");
  const wsUrl = `${wsBase}/ws/dashboard?internal=${encodeURIComponent(internalAuth)}`;

  return NextResponse.json({ wsUrl });
}
