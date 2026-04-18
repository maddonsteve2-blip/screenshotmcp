import { db } from "./db.js";
import { activationEvents } from "@screenshotsmcp/db";
import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";

/**
 * Lightweight activation funnel emitter. Writes one row to `activation_events`
 * (PostHog-compatible shape so a future PostHog migration is a one-shot
 * backfill). All errors are swallowed — telemetry must never break a hot path.
 *
 * `firstOnly: true` upserts so the same `(userId, eventName)` pair is recorded
 * once per user. Use that for milestone events like `first_screenshot`.
 */
export async function emitActivation(
  eventName: string,
  opts: {
    userId?: string | null;
    properties?: Record<string, unknown>;
    firstOnly?: boolean;
  } = {},
): Promise<void> {
  try {
    if (opts.firstOnly && opts.userId) {
      await db.execute(sql`
        INSERT INTO activation_events (id, user_id, event_name, properties)
        SELECT ${nanoid()}, ${opts.userId}, ${eventName}, ${JSON.stringify(opts.properties ?? {})}::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM activation_events
          WHERE user_id = ${opts.userId} AND event_name = ${eventName}
        )
      `);
      return;
    }
    await db.insert(activationEvents).values({
      id: nanoid(),
      userId: opts.userId ?? null,
      eventName,
      properties: opts.properties ?? {},
    });
  } catch (err) {
    console.warn(`[activation] failed to emit ${eventName}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
