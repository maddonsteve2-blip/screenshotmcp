import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { users } from "@deepsyte/db";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const svixId = req.headers.get("svix-id") ?? "";
  const svixTs = req.headers.get("svix-timestamp") ?? "";
  const svixSig = req.headers.get("svix-signature") ?? "";

  const body = await req.text();
  const wh = new Webhook(webhookSecret);

  let event: { type: string; data: { id: string; email_addresses: { email_address: string }[] } };
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTs,
      "svix-signature": svixSig,
    }) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "user.created") {
    const db = getDb();
    const email = event.data.email_addresses[0]?.email_address ?? "";
    await db.insert(users).values({
      id: nanoid(),
      clerkId: event.data.id,
      email,
      plan: "free",
    }).onConflictDoNothing();
  }

  return NextResponse.json({ received: true });
}
