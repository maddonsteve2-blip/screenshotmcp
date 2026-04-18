import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db } from "./db.js";
import { webhookEndpoints, webhookDeliveries } from "@screenshotsmcp/db";
import { getRedis } from "./redis.js";

/**
 * Outbound webhook delivery system.
 *
 * - `emitWebhookEvent` fans an event out to every subscribed user endpoint:
 *   one row in `webhook_deliveries`, one BullMQ job per endpoint.
 * - `processWebhookDelivery` POSTs the signed payload, records the response,
 *   and lets BullMQ retry on failure with exponential backoff.
 * - Retries: 6 attempts total (initial + 5 retries) at 1m / 5m / 30m / 2h /
 *   12h. After the final failure the delivery row is marked `exhausted`.
 *
 * Signing follows the same conventions as Stripe / Svix:
 *
 *   Webhook-Timestamp: <unix-seconds>
 *   Webhook-Id: <delivery-uuid>
 *   Webhook-Signature: t=<ts>,v1=<hex hmac of `${ts}.${body}`>
 *
 * Secrets are stored in plaintext today (per-endpoint, never reused). When
 * orgs land we will rotate to per-org KMS keys; the public signing scheme
 * does not change.
 */

export const WEBHOOK_QUEUE = "webhook-deliveries";

export type WebhookEventType =
  | "screenshot.completed"
  | "screenshot.failed"
  | "run.completed"
  | "run.failed"
  | "quota.warning"
  | "test.ping";

export const ALL_WEBHOOK_EVENT_TYPES: WebhookEventType[] = [
  "screenshot.completed",
  "screenshot.failed",
  "run.completed",
  "run.failed",
  "quota.warning",
  "test.ping",
];

const RETRY_DELAYS_MS = [
  60_000, // 1 minute
  5 * 60_000, // 5 minutes
  30 * 60_000, // 30 minutes
  2 * 60 * 60_000, // 2 hours
  12 * 60 * 60_000, // 12 hours
];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1; // initial + retries

let _queue: Queue | null = null;
let _worker: Worker | null = null;

function getQueueOrNull(): Queue | null {
  const conn = getRedis();
  if (!conn) return null;
  if (_queue) return _queue;
  _queue = new Queue(WEBHOOK_QUEUE, { connection: conn });
  return _queue;
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function signPayload(body: string, secret: string, timestampSeconds: number): string {
  const signed = `${timestampSeconds}.${body}`;
  return createHmac("sha256", secret).update(signed).digest("hex");
}

/**
 * Verify a webhook signature header from a caller. Exported so SDK / docs
 * can show a tested verification snippet.
 */
export function verifySignature(
  body: string,
  secret: string,
  signatureHeader: string,
  toleranceSeconds = 5 * 60,
): boolean {
  const parts = signatureHeader.split(",").map((p) => p.trim());
  let ts: number | null = null;
  const sigs: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && value) ts = Number(value);
    if (key === "v1" && value) sigs.push(value);
  }
  if (ts === null || Number.isNaN(ts)) return false;
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > toleranceSeconds) return false;
  const expected = signPayload(body, secret, ts);
  const expectedBuf = Buffer.from(expected, "hex");
  return sigs.some((s) => {
    const sBuf = Buffer.from(s, "hex");
    return sBuf.length === expectedBuf.length && timingSafeEqual(sBuf, expectedBuf);
  });
}

function endpointSubscribesTo(events: string[], type: WebhookEventType): boolean {
  if (events.length === 0) return false;
  if (events.includes("*")) return true;
  return events.includes(type);
}

export interface EmitWebhookInput {
  userId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  /**
   * Optional idempotency key. If supplied and a delivery with this key has
   * already been enqueued for an endpoint, the duplicate is dropped. Useful
   * for emit points that may fire twice (e.g. retried jobs).
   */
  dedupeKey?: string;
}

/**
 * Fan an event out to every subscribed endpoint for the given user. Safe to
 * call from any code path; degrades to a no-op if Redis is unavailable.
 */
export async function emitWebhookEvent(input: EmitWebhookInput): Promise<void> {
  const queue = getQueueOrNull();
  if (!queue) return;

  const endpoints = await db
    .select({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      events: webhookEndpoints.events,
      enabled: webhookEndpoints.enabled,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.userId, input.userId));

  const matches = endpoints.filter(
    (e) => e.enabled && endpointSubscribesTo(e.events ?? [], input.eventType),
  );
  if (matches.length === 0) return;

  const payloadString = JSON.stringify({
    type: input.eventType,
    createdAt: new Date().toISOString(),
    data: input.payload,
  });

  for (const endpoint of matches) {
    const deliveryId = nanoid();
    try {
      await db.insert(webhookDeliveries).values({
        id: deliveryId,
        endpointId: endpoint.id,
        userId: input.userId,
        eventType: input.eventType,
        payload: payloadString,
        attempt: 0,
        status: "pending",
      });
      const jobOpts: Parameters<Queue["add"]>[2] = {
        attempts: MAX_ATTEMPTS,
        // `custom` triggers the worker-level backoffStrategy below, which
        // honors our 1m / 5m / 30m / 2h / 12h schedule.
        backoff: { type: "custom" },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      };
      if (input.dedupeKey) {
        jobOpts.jobId = `${endpoint.id}:${input.dedupeKey}`;
      }
      await queue.add("deliver", { deliveryId }, jobOpts);
    } catch (err) {
      console.error(
        `[webhooks] failed to enqueue ${input.eventType} to endpoint ${endpoint.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

interface DeliveryJobData {
  deliveryId: string;
}

/**
 * Worker callback. Returning normally marks the BullMQ attempt as success.
 * Throwing schedules the next retry with our custom backoff schedule.
 */
async function processWebhookDelivery(job: Job<DeliveryJobData>): Promise<void> {
  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, job.data.deliveryId));
  if (!delivery) return; // row deleted (endpoint removed)

  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, delivery.endpointId));
  if (!endpoint || !endpoint.enabled) {
    await db
      .update(webhookDeliveries)
      .set({ status: "failed", errorMessage: "Endpoint missing or disabled" })
      .where(eq(webhookDeliveries.id, delivery.id));
    return;
  }

  const attempt = (job.attemptsMade ?? 0) + 1;
  const ts = Math.floor(Date.now() / 1000);
  const sig = signPayload(delivery.payload, endpoint.secret, ts);

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 15_000);

  let responseCode: number | null = null;
  let responseBody = "";
  let errorMessage: string | null = null;

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ScreenshotsMCP-Webhook/1",
        "Webhook-Id": delivery.id,
        "Webhook-Timestamp": String(ts),
        "Webhook-Signature": `t=${ts},v1=${sig}`,
        "X-ScreenshotsMCP-Event": delivery.eventType,
      },
      body: delivery.payload,
      signal: controller.signal,
    });
    responseCode = res.status;
    responseBody = (await res.text().catch(() => "")).slice(0, 4000);
    if (res.status >= 200 && res.status < 300) {
      await db
        .update(webhookDeliveries)
        .set({
          status: "success",
          attempt,
          responseCode,
          responseBody,
          errorMessage: null,
          deliveredAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
      await db
        .update(webhookEndpoints)
        .set({ lastDeliveredAt: new Date(), updatedAt: new Date() })
        .where(eq(webhookEndpoints.id, endpoint.id));
      return;
    }
    errorMessage = `HTTP ${res.status}`;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(abortTimer);
  }

  const isFinalAttempt = attempt >= MAX_ATTEMPTS;
  await db
    .update(webhookDeliveries)
    .set({
      status: isFinalAttempt ? "exhausted" : "pending",
      attempt,
      responseCode,
      responseBody: responseBody || null,
      errorMessage,
    })
    .where(eq(webhookDeliveries.id, delivery.id));
  await db
    .update(webhookEndpoints)
    .set({ lastFailureAt: new Date(), updatedAt: new Date() })
    .where(eq(webhookEndpoints.id, endpoint.id));

  if (!isFinalAttempt) {
    const nextDelay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    // Throw so BullMQ retries, but override its delay with our schedule via
    // the nextDelay setter below.
    const error = new Error(errorMessage ?? "Unknown delivery error");
    (error as Error & { retryDelayMs?: number }).retryDelayMs = nextDelay;
    throw error;
  }
}

export function startWebhookWorker(): Worker | null {
  if (_worker) return _worker;
  const conn = getRedis();
  if (!conn) {
    console.warn("[webhooks] REDIS_URL missing — webhook worker disabled");
    return null;
  }
  _worker = new Worker(WEBHOOK_QUEUE, processWebhookDelivery, {
    connection: conn,
    concurrency: 8,
    settings: {
      backoffStrategy: (attemptsMade: number, _type: string, err: Error | undefined) => {
        const fromError = (err as Error & { retryDelayMs?: number } | undefined)?.retryDelayMs;
        if (typeof fromError === "number") return fromError;
        return RETRY_DELAYS_MS[Math.min(attemptsMade - 1, RETRY_DELAYS_MS.length - 1)] ?? 60_000;
      },
    },
  });
  _worker.on("failed", (job, err) =>
    console.warn(`[webhooks] delivery ${job?.id} failed: ${err.message}`),
  );
  return _worker;
}
