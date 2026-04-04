import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "./db";
import { users } from "@screenshotsmcp/db";

export async function getOrCreateDbUser(clerkId: string) {
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.clerkId, clerkId));
  if (existing) return existing;

  const clerk = await currentUser();
  const email = clerk?.emailAddresses[0]?.emailAddress ?? "";

  await db.insert(users).values({
    id: nanoid(),
    clerkId,
    email,
    plan: "free",
  }).onConflictDoNothing();

  const [created] = await db.select().from(users).where(eq(users.clerkId, clerkId));
  return created ?? null;
}
