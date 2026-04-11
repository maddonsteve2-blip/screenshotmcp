import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createDb } from "@screenshotsmcp/db";
import { screenshots, users } from "@screenshotsmcp/db";
import { eq, desc, gte, and, count, sql } from "drizzle-orm";
import { PLAN_LIMITS } from "@screenshotsmcp/types";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createDb(process.env.DATABASE_URL!);

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId));
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Run all queries in parallel for speed
  const [
    [{ value: total }],
    [{ value: thisMonth }],
    [{ value: todayCount }],
    [{ value: doneCount }],
    dailyRows,
    topUrlRows,
    formatRows,
    deviceRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(screenshots).where(eq(screenshots.userId, user.id)),
    db.select({ value: count() }).from(screenshots).where(and(eq(screenshots.userId, user.id), gte(screenshots.createdAt, firstOfMonth))),
    db.select({ value: count() }).from(screenshots).where(and(eq(screenshots.userId, user.id), gte(screenshots.createdAt, today))),
    db.select({ value: count() }).from(screenshots).where(and(eq(screenshots.userId, user.id), eq(screenshots.status, "done"))),
    db.select({
      day: sql<string>`to_char(${screenshots.createdAt}, 'YYYY-MM-DD')`.as("day"),
      count: count(),
    })
      .from(screenshots)
      .where(and(eq(screenshots.userId, user.id), gte(screenshots.createdAt, thirtyDaysAgo)))
      .groupBy(sql`to_char(${screenshots.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${screenshots.createdAt}, 'YYYY-MM-DD')`),
    db.select({ url: screenshots.url, count: count() }).from(screenshots).where(eq(screenshots.userId, user.id)).groupBy(screenshots.url).orderBy(desc(count())).limit(10),
    db.select({ format: screenshots.format, count: count() }).from(screenshots).where(eq(screenshots.userId, user.id)).groupBy(screenshots.format),
    db.select({ width: screenshots.width, count: count() }).from(screenshots).where(eq(screenshots.userId, user.id)).groupBy(screenshots.width),
  ]);

  const successRate = total > 0 ? Math.round((Number(doneCount) / Number(total)) * 100) : 100;

  const deviceBreakdown = { mobile: 0, tablet: 0, desktop: 0 };
  for (const row of deviceRows) {
    if (row.width < 500) deviceBreakdown.mobile += Number(row.count);
    else if (row.width < 1100) deviceBreakdown.tablet += Number(row.count);
    else deviceBreakdown.desktop += Number(row.count);
  }

  const plan = user.plan as keyof typeof PLAN_LIMITS;
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  return NextResponse.json({
    plan: {
      name: plan,
      screenshotsPerMonth: limits.screenshotsPerMonth,
      price: limits.price,
      used: Number(thisMonth),
      remaining: Math.max(0, limits.screenshotsPerMonth - Number(thisMonth)),
    },
    stats: {
      total: Number(total),
      thisMonth: Number(thisMonth),
      today: Number(todayCount),
      successRate,
    },
    daily: dailyRows.map((r) => ({ day: String(r.day), count: Number(r.count) })),
    topUrls: topUrlRows.map((r) => ({ url: r.url, count: Number(r.count) })),
    formats: formatRows.map((r) => ({ format: r.format, count: Number(r.count) })),
    devices: deviceBreakdown,
  });
}
