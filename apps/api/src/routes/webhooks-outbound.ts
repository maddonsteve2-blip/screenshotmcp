import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { webhookEndpoints, webhookDeliveries } from "@screenshotsmcp/db";
import { requireApiKey, type AuthRequest } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import {
  ALL_WEBHOOK_EVENT_TYPES,
  emitWebhookEvent,
  generateWebhookSecret,
} from "../lib/webhook-delivery.js";

export const webhooksOutboundRouter = Router();

const URL_REGEX = /^https?:\/\/[^\s]+$/i;

const createSchema = z.object({
  url: z.string().regex(URL_REGEX, "url must be http(s)://"),
  events: z
    .array(z.string().min(1))
    .optional()
    .default(["*"]),
  description: z.string().max(280).optional(),
});

const updateSchema = z.object({
  url: z.string().regex(URL_REGEX).optional(),
  events: z.array(z.string().min(1)).optional(),
  enabled: z.boolean().optional(),
  description: z.string().max(280).nullable().optional(),
});

function publicEndpoint(row: typeof webhookEndpoints.$inferSelect, secret?: string) {
  return {
    id: row.id,
    url: row.url,
    events: row.events,
    enabled: row.enabled,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastDeliveredAt: row.lastDeliveredAt,
    lastFailureAt: row.lastFailureAt,
    // Secret is only ever returned on create + rotate.
    ...(secret ? { secret } : {}),
  };
}

webhooksOutboundRouter.get(
  "/events",
  requireApiKey,
  (_req: AuthRequest, res) => {
    res.json({ events: ALL_WEBHOOK_EVENT_TYPES });
  },
);

webhooksOutboundRouter.get(
  "/",
  requireApiKey,
  async (req: AuthRequest, res, next) => {
    try {
      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.userId, req.userId!))
        .orderBy(desc(webhookEndpoints.createdAt));
      res.json({ endpoints: rows.map((r) => publicEndpoint(r)) });
    } catch (err) {
      next(err);
    }
  },
);

webhooksOutboundRouter.post(
  "/",
  requireApiKey,
  idempotency("v1.webhooks.create"),
  async (req: AuthRequest, res, next) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const id = nanoid();
      const secret = generateWebhookSecret();
      const [row] = await db
        .insert(webhookEndpoints)
        .values({
          id,
          userId: req.userId!,
          url: parsed.data.url,
          secret,
          events: parsed.data.events,
          description: parsed.data.description,
          enabled: true,
        })
        .returning();
      res.status(201).json({ endpoint: publicEndpoint(row, secret) });
    } catch (err) {
      next(err);
    }
  },
);

webhooksOutboundRouter.patch(
  "/:id",
  requireApiKey,
  async (req: AuthRequest, res, next) => {
    try {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.url !== undefined) updates.url = parsed.data.url;
      if (parsed.data.events !== undefined) updates.events = parsed.data.events;
      if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;
      if (parsed.data.description !== undefined) updates.description = parsed.data.description;
      const [row] = await db
        .update(webhookEndpoints)
        .set(updates)
        .where(
          and(
            eq(webhookEndpoints.id, req.params.id),
            eq(webhookEndpoints.userId, req.userId!),
          ),
        )
        .returning();
      if (!row) {
        res.status(404).json({ error: "Webhook endpoint not found" });
        return;
      }
      res.json({ endpoint: publicEndpoint(row) });
    } catch (err) {
      next(err);
    }
  },
);

webhooksOutboundRouter.post(
  "/:id/rotate",
  requireApiKey,
  async (req: AuthRequest, res, next) => {
    try {
      const secret = generateWebhookSecret();
      const [row] = await db
        .update(webhookEndpoints)
        .set({ secret, updatedAt: new Date() })
        .where(
          and(
            eq(webhookEndpoints.id, req.params.id),
            eq(webhookEndpoints.userId, req.userId!),
          ),
        )
        .returning();
      if (!row) {
        res.status(404).json({ error: "Webhook endpoint not found" });
        return;
      }
      res.json({ endpoint: publicEndpoint(row, secret) });
    } catch (err) {
      next(err);
    }
  },
);

webhooksOutboundRouter.post(
  "/:id/test",
  requireApiKey,
  async (req: AuthRequest, res, next) => {
    try {
      const [row] = await db
        .select()
        .from(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.id, req.params.id),
            eq(webhookEndpoints.userId, req.userId!),
          ),
        );
      if (!row) {
        res.status(404).json({ error: "Webhook endpoint not found" });
        return;
      }
      // Force-emit ignoring the endpoint's event filter so users can validate
      // signing without subscribing to test.ping explicitly.
      const wasSubscribed = row.events.includes("*") || row.events.includes("test.ping");
      if (!wasSubscribed) {
        await db
          .update(webhookEndpoints)
          .set({ events: [...row.events, "test.ping"], updatedAt: new Date() })
          .where(eq(webhookEndpoints.id, row.id));
      }
      await emitWebhookEvent({
        userId: req.userId!,
        eventType: "test.ping",
        payload: { endpointId: row.id, message: "Hello from ScreenshotsMCP" },
      });
      if (!wasSubscribed) {
        await db
          .update(webhookEndpoints)
          .set({ events: row.events, updatedAt: new Date() })
          .where(eq(webhookEndpoints.id, row.id));
      }
      res.status(202).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

webhooksOutboundRouter.get(
  "/:id/deliveries",
  requireApiKey,
  async (req: AuthRequest, res, next) => {
    try {
      const [endpoint] = await db
        .select({ id: webhookEndpoints.id })
        .from(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.id, req.params.id),
            eq(webhookEndpoints.userId, req.userId!),
          ),
        );
      if (!endpoint) {
        res.status(404).json({ error: "Webhook endpoint not found" });
        return;
      }
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const rows = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.endpointId, req.params.id))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(limit);
      res.json({ deliveries: rows });
    } catch (err) {
      next(err);
    }
  },
);

webhooksOutboundRouter.delete(
  "/:id",
  requireApiKey,
  async (req: AuthRequest, res, next) => {
    try {
      const [row] = await db
        .delete(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.id, req.params.id),
            eq(webhookEndpoints.userId, req.userId!),
          ),
        )
        .returning({ id: webhookEndpoints.id });
      if (!row) {
        res.status(404).json({ error: "Webhook endpoint not found" });
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
