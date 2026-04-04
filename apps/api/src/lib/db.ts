import { createDb, type Db } from "@screenshotsmcp/db";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export const db: Db = createDb(process.env.DATABASE_URL);
