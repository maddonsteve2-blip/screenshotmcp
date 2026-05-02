/**
 * Seeds the public demo user that backs the /try zero-auth demo page.
 *
 * Run once per environment (after applying the try_rate_limits migration):
 *   DATABASE_URL=... pnpm tsx packages/db/scripts/seed-demo-user.ts
 *
 * Idempotent — safe to re-run.
 */
import "dotenv/config";
import { createDb, users } from "../src/index.js";
import { eq } from "drizzle-orm";

const DEMO_USER_ID = process.env.PUBLIC_DEMO_USER_ID ?? "demo-public-user";
const DEMO_CLERK_ID = "demo-public-no-clerk";
const DEMO_EMAIL = "demo-public@deepsyte.com";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const db = createDb(connectionString);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, DEMO_USER_ID));

  if (existing) {
    console.log(`Demo user already exists: ${DEMO_USER_ID}`);
    return;
  }

  await db.insert(users).values({
    id: DEMO_USER_ID,
    clerkId: DEMO_CLERK_ID,
    email: DEMO_EMAIL,
    plan: "free",
  });

  console.log(`Seeded demo user: ${DEMO_USER_ID}`);
  console.log("Set PUBLIC_DEMO_USER_ID in Vercel env to this value.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
