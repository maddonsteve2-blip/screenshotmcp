import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { tryRateLimits } from "@screenshotsmcp/db";

export const runtime = "nodejs";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  "https://screenshotsmcp-api-production.up.railway.app";
const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET ?? "").trim();
const DEMO_USER_ID = (process.env.PUBLIC_DEMO_USER_ID ?? "demo-public-user").trim();
const IP_HASH_SALT = (process.env.TRY_IP_HASH_SALT ?? "screenshotsmcp-try-v1").trim();

const HOURLY_LIMIT = 3;
const DAILY_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function hashIp(ip: string): string {
  return createHash("sha256").update(`${IP_HASH_SALT}:${ip}`).digest("hex");
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    // Block obvious SSRF targets. The upstream worker does its own checks too,
    // but the demo endpoint is unauthenticated so we tighten here.
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!INTERNAL_SECRET) {
    console.error("[try-screenshot] INTERNAL_API_SECRET is not set");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof (body as { url?: unknown }).url === "string"
    ? (body as { url: string }).url.trim()
    : "";

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (!isValidHttpUrl(url)) {
    return NextResponse.json(
      { error: "url must be a public http(s) URL" },
      { status: 400 },
    );
  }

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const now = new Date();
  const hourAgo = new Date(now.getTime() - HOUR_MS);
  const dayAgo = new Date(now.getTime() - DAY_MS);

  const db = getDb();

  const [hourRow] = await db
    .select({ c: count() })
    .from(tryRateLimits)
    .where(
      and(
        eq(tryRateLimits.ipHash, ipHash),
        gte(tryRateLimits.createdAt, hourAgo),
      ),
    );
  const [dayRow] = await db
    .select({ c: count() })
    .from(tryRateLimits)
    .where(
      and(
        eq(tryRateLimits.ipHash, ipHash),
        gte(tryRateLimits.createdAt, dayAgo),
      ),
    );

  const hourUsed = hourRow?.c ?? 0;
  const dayUsed = dayRow?.c ?? 0;

  const rateHeaders = {
    "X-RateLimit-Hour-Limit": String(HOURLY_LIMIT),
    "X-RateLimit-Hour-Remaining": String(Math.max(0, HOURLY_LIMIT - hourUsed)),
    "X-RateLimit-Day-Limit": String(DAILY_LIMIT),
    "X-RateLimit-Day-Remaining": String(Math.max(0, DAILY_LIMIT - dayUsed)),
  };

  if (hourUsed >= HOURLY_LIMIT || dayUsed >= DAILY_LIMIT) {
    const reason = hourUsed >= HOURLY_LIMIT ? "hourly" : "daily";
    return NextResponse.json(
      {
        error: `Free trial limit reached (${reason}). Sign up free for unlimited screenshots.`,
        limit: reason === "hourly" ? HOURLY_LIMIT : DAILY_LIMIT,
        window: reason,
        hourRemaining: Math.max(0, HOURLY_LIMIT - hourUsed),
        dayRemaining: Math.max(0, DAILY_LIMIT - dayUsed),
      },
      {
        status: 429,
        headers: {
          ...rateHeaders,
          "Retry-After": String(reason === "hourly" ? 3600 : 86400),
        },
      },
    );
  }

  // Record the attempt BEFORE calling the upstream so concurrent abuse
  // still counts against the quota even if the capture fails.
  await db.insert(tryRateLimits).values({
    id: randomUUID(),
    ipHash,
    createdAt: now,
  });

  const res = await fetch(`${API_BASE}/v1/screenshot`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Internal ${INTERNAL_SECRET}:${DEMO_USER_ID}`,
    },
    body: JSON.stringify({
      url,
      width: 1280,
      height: 800,
      fullPage: false,
      format: "png",
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("[try-screenshot] upstream error", res.status, data);
    return NextResponse.json(data, {
      status: res.status,
      headers: rateHeaders,
    });
  }

  return NextResponse.json(
    {
      ...data,
      trial: {
        hourRemaining: Math.max(0, HOURLY_LIMIT - hourUsed - 1),
        hourLimit: HOURLY_LIMIT,
        dayRemaining: Math.max(0, DAILY_LIMIT - dayUsed - 1),
        dayLimit: DAILY_LIMIT,
      },
    },
    {
      status: res.status,
      headers: {
        ...rateHeaders,
        "X-RateLimit-Hour-Remaining": String(
          Math.max(0, HOURLY_LIMIT - hourUsed - 1),
        ),
        "X-RateLimit-Day-Remaining": String(
          Math.max(0, DAILY_LIMIT - dayUsed - 1),
        ),
      },
    },
  );
}
