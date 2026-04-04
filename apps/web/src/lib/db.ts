import { createDb } from "@screenshotsmcp/db";

export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return createDb(process.env.DATABASE_URL);
}
