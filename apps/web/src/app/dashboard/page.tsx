import { auth } from "@clerk/nextjs/server";
import { eq, count, and, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getOrCreateDbUser } from "@/lib/get-or-create-user";
import { usageEvents, apiKeys } from "@screenshotsmcp/db";
import { PLAN_LIMITS } from "@screenshotsmcp/types";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const { userId: clerkId } = await auth();
  const db = getDb();
  const user = await getOrCreateDbUser(clerkId!);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [usageRow] = user
    ? await db.select({ count: count() }).from(usageEvents).where(and(eq(usageEvents.userId, user.id), gte(usageEvents.createdAt, startOfMonth)))
    : [{ count: 0 }];

  const [keyRow] = user
    ? await db.select({ count: count() }).from(apiKeys).where(and(eq(apiKeys.userId, user.id), eq(apiKeys.revoked, false)))
    : [{ count: 0 }];

  const plan = (user?.plan ?? "free") as "free" | "starter" | "pro";
  const limit = PLAN_LIMITS[plan].screenshotsPerMonth;
  const used = usageRow?.count ?? 0;
  const keyCount = keyRow?.count ?? 0;

  return (
    <DashboardClient 
      data={{
        usage: used,
        limit,
        keyCount,
        plan,
        apiUrl: process.env.NEXT_PUBLIC_API_URL || "https://screenshotsmcp-api-production.up.railway.app"
      }}
    />
  );
}
