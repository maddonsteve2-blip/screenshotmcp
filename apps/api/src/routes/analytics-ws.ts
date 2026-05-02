import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import { createHash } from "crypto";
import { eq, desc, gte, and, count, sql } from "drizzle-orm";
import { db } from "../lib/db.js";
import { screenshots, users, apiKeys } from "@deepsyte/db";
import { PLAN_LIMITS } from "@deepsyte/types";

const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET || "").trim();

interface AuthResult {
  userId: string;
  plan: string;
}

async function authenticateWs(req: { url?: string }): Promise<AuthResult | null> {
  try {
    const url = new URL(req.url || "", "http://localhost");
    const token = url.searchParams.get("token");
    const internal = url.searchParams.get("internal");

    // Internal auth: ?internal=<secret>:<userId>
    if (internal && INTERNAL_SECRET) {
      const [secret, userId] = internal.split(":");
      if (secret === INTERNAL_SECRET && userId) {
        const [user] = await db.select({ id: users.id, plan: users.plan }).from(users).where(eq(users.id, userId));
        if (user) return { userId: user.id, plan: user.plan };
      }
    }

    // API key auth: ?token=sk_live_...
    if (token) {
      const hash = createHash("sha256").update(token).digest("hex");
      const [key] = await db
        .select({ userId: apiKeys.userId, revoked: apiKeys.revoked })
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, hash));
      if (key && !key.revoked) {
        const [user] = await db.select({ id: users.id, plan: users.plan }).from(users).where(eq(users.id, key.userId));
        if (user) return { userId: user.id, plan: user.plan };
      }
    }
  } catch (e) {
    console.error("[analytics-ws] Auth error:", e);
  }
  return null;
}

async function getAnalyticsData(userId: string, plan: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

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
    db.select({ value: count() }).from(screenshots).where(eq(screenshots.userId, userId)),
    db.select({ value: count() }).from(screenshots).where(and(eq(screenshots.userId, userId), gte(screenshots.createdAt, firstOfMonth))),
    db.select({ value: count() }).from(screenshots).where(and(eq(screenshots.userId, userId), gte(screenshots.createdAt, today))),
    db.select({ value: count() }).from(screenshots).where(and(eq(screenshots.userId, userId), eq(screenshots.status, "done"))),
    db.select({
      day: sql<string>`to_char(${screenshots.createdAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`.as("day"),
      count: count(),
    })
      .from(screenshots)
      .where(and(eq(screenshots.userId, userId), gte(screenshots.createdAt, thirtyDaysAgo)))
      .groupBy(sql`to_char(${screenshots.createdAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${screenshots.createdAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`),
    db.select({ url: screenshots.url, count: count() }).from(screenshots).where(eq(screenshots.userId, userId)).groupBy(screenshots.url).orderBy(desc(count())).limit(10),
    db.select({ format: screenshots.format, count: count() }).from(screenshots).where(eq(screenshots.userId, userId)).groupBy(screenshots.format),
    db.select({ width: screenshots.width, count: count() }).from(screenshots).where(eq(screenshots.userId, userId)).groupBy(screenshots.width),
  ]);

  const successRate = Number(total) > 0 ? Math.round((Number(doneCount) / Number(total)) * 100) : 100;

  const deviceBreakdown = { mobile: 0, tablet: 0, desktop: 0 };
  for (const row of deviceRows) {
    if (row.width < 500) deviceBreakdown.mobile += Number(row.count);
    else if (row.width < 1100) deviceBreakdown.tablet += Number(row.count);
    else deviceBreakdown.desktop += Number(row.count);
  }

  // Build full 30-day array
  const dayMap = new Map<string, number>();
  for (const r of dailyRows) {
    const key = String(r.day).slice(0, 10);
    dayMap.set(key, Number(r.count));
  }
  const daily: { day: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    daily.push({ day: key, count: dayMap.get(key) ?? 0 });
  }

  const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;

  return {
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
    daily,
    topUrls: topUrlRows.map((r) => ({ url: r.url, count: Number(r.count) })),
    formats: formatRows.map((r) => ({ format: r.format, count: Number(r.count) })),
    devices: deviceBreakdown,
  };
}

export function attachAnalyticsWs(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url || "", "http://localhost");
    if (url.pathname !== "/ws/analytics") return;

    const auth = await authenticateWs(req);
    if (!auth) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, auth);
    });
  });

  wss.on("connection", async (ws: WebSocket, auth: AuthResult) => {
    // Send data immediately on connect
    try {
      const data = await getAnalyticsData(auth.userId, auth.plan);
      ws.send(JSON.stringify({ type: "analytics", data }));
    } catch (e) {
      console.error("[analytics-ws] Query error:", e);
      ws.send(JSON.stringify({ type: "error", message: "Failed to load analytics" }));
    }

    // Listen for refresh requests
    ws.on("message", async (msg) => {
      try {
        const parsed = JSON.parse(String(msg));
        if (parsed.type === "refresh") {
          const data = await getAnalyticsData(auth.userId, auth.plan);
          ws.send(JSON.stringify({ type: "analytics", data }));
        }
      } catch {}
    });

    // Heartbeat
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30000);

    ws.on("close", () => clearInterval(ping));
  });

  console.log("[analytics-ws] WebSocket endpoint ready at /ws/analytics");
}
