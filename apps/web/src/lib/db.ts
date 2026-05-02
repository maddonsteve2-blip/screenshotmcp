import { createDb } from "@deepsyte/db";

let cached: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (cached) return cached;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  cached = createDb(process.env.DATABASE_URL);
  return cached;
}
