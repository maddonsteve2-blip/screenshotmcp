// One-shot migration + seed runner for /try feature.
// Safe to delete after the migration has landed — the logic is codified in
// packages/db/drizzle/0007_daffy_stick.sql and packages/db/scripts/seed-demo-user.ts.
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(url);

async function main() {
  console.log("Creating try_rate_limits table...");
  await sql`CREATE TABLE IF NOT EXISTS "try_rate_limits" (
    "id" text PRIMARY KEY NOT NULL,
    "ip_hash" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`;

  console.log("Creating index...");
  await sql`CREATE INDEX IF NOT EXISTS "try_rate_limits_ip_created_at_idx"
    ON "try_rate_limits" USING btree ("ip_hash", "created_at")`;

  console.log("Seeding demo-public-user...");
  await sql`INSERT INTO users (id, clerk_id, email, plan)
    VALUES ('demo-public-user', 'demo-public-no-clerk', 'demo-public@screenshotmcp.com', 'free')
    ON CONFLICT (id) DO NOTHING`;

  const users = await sql`SELECT id, email, plan FROM users WHERE id = 'demo-public-user'`;
  console.log("demo user row:", users);

  const count = await sql`SELECT count(*)::int AS c FROM try_rate_limits`;
  console.log("try_rate_limits count:", count);
}

main().then(() => {
  console.log("Done.");
  process.exit(0);
}).catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
