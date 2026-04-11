import { NextResponse } from "next/server";
import { createDb } from "@screenshotsmcp/db";
import { screenshots } from "@screenshotsmcp/db";
import { gte, count, sql } from "drizzle-orm";

// TEMPORARY debug endpoint — remove after debugging
export async function GET() {
  const db = createDb(process.env.DATABASE_URL!);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const dailyRows = await db.select({
    day: sql<string>`to_char(${screenshots.createdAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`.as("day"),
    count: count(),
  })
    .from(screenshots)
    .where(gte(screenshots.createdAt, thirtyDaysAgo))
    .groupBy(sql`to_char(${screenshots.createdAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${screenshots.createdAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);

  // Build the 30-day array exactly like the analytics route does
  const map = new Map<string, number>();
  for (const r of dailyRows) {
    const raw: unknown = r.day;
    let key: string;
    if (raw instanceof Date) key = raw.toISOString().slice(0, 10);
    else key = String(raw).slice(0, 10);
    map.set(key, Number(r.count));
  }

  const daily30: { day: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    daily30.push({ day: key, count: map.get(key) ?? 0 });
  }

  return NextResponse.json({
    rawRows: dailyRows,
    rawRowTypes: dailyRows.map(r => ({ day: r.day, dayType: typeof r.day, dayConstructor: Object.prototype.toString.call(r.day) })),
    mapEntries: Array.from(map.entries()),
    daily30,
    serverNow: new Date().toISOString(),
  });
}
