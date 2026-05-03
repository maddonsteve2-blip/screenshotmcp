import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { getInternalApiBase, getInternalApiHeaders } from "@/lib/internal-api";

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getOrCreateDbUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${getInternalApiBase()}/oauth/callback`, {
    method: "POST",
    headers: {
      ...getInternalApiHeaders(user.id),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: body.client_id,
      code_challenge: body.code_challenge,
      code_challenge_method: body.code_challenge_method,
      redirect_uri: body.redirect_uri,
      resource: body.resource,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
