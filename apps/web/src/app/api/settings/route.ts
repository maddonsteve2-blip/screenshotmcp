import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { users } from "@screenshotsmcp/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    agentmailApiKey: user.agentmailApiKey ? maskKey(user.agentmailApiKey) : null,
    hasAgentmailKey: !!user.agentmailApiKey,
  });
}

export async function PUT(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { agentmailApiKey } = body;

  const db = getDb();
  const user = await getOrCreateDbUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Allow clearing the key by passing null/empty
  const keyValue = agentmailApiKey?.trim() || null;

  // Basic validation: AgentMail keys start with "am_"
  if (keyValue && !keyValue.startsWith("am_")) {
    return NextResponse.json(
      { error: "Invalid AgentMail API key. Keys start with am_" },
      { status: 400 }
    );
  }

  await db
    .update(users)
    .set({ agentmailApiKey: keyValue, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    success: true,
    agentmailApiKey: keyValue ? maskKey(keyValue) : null,
    hasAgentmailKey: !!keyValue,
  });
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••••" + key.slice(-4);
}
