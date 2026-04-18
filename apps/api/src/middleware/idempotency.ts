import { NextFunction, Response } from "express";
import { createHash } from "crypto";
import { getRedis } from "../lib/redis.js";
import type { AuthRequest } from "./auth.js";
import type { RequestIdRequest } from "./requestId.js";

/**
 * Idempotency-Key middleware (Stripe-style). Safe for POST endpoints that
 * create resources, enqueue jobs, or spend quota.
 *
 * Client sends `Idempotency-Key: <uuid-or-nonce>`. We hash it together with
 * the authenticated user id and the request path to avoid cross-user /
 * cross-route collisions, then:
 *
 *   - On first call: call the handler, cache the response body + status for
 *     24h, return normally.
 *   - On replay: return the cached response with `Idempotency-Replayed: true`
 *     header.
 *   - On in-flight replay: return 409 IDEMPOTENCY_IN_FLIGHT so the client can
 *     poll the original resource rather than duplicate the side-effect.
 *
 * If Redis is unavailable the middleware becomes a pass-through — we prefer
 * accepting the request and risking a duplicate over failing closed.
 *
 * The key is OPTIONAL: requests without `Idempotency-Key` flow straight
 * through (backwards compatible).
 */

type IdemRequest = AuthRequest & RequestIdRequest;

const TTL_SECONDS = 60 * 60 * 24; // 24h
const IN_FLIGHT_TTL_SECONDS = 5 * 60; // 5m — long enough for the slowest
// screenshot, short enough that a crashed handler doesn't permanently wedge
// the key.

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

interface CachedResponse {
  status: number;
  body: unknown;
}

export function idempotency(scope: string) {
  return async function idempotencyMiddleware(
    req: IdemRequest,
    res: Response,
    next: NextFunction,
  ) {
    const rawKey = req.header("Idempotency-Key") ?? req.header("idempotency-key");
    if (!rawKey) return next();

    if (!KEY_PATTERN.test(rawKey)) {
      res.status(400).json({
        error: "Idempotency-Key must be 8–128 chars of [A-Za-z0-9_-]",
        code: "INVALID_IDEMPOTENCY_KEY",
        requestId: req.requestId,
      });
      return;
    }

    const redis = getRedis();
    if (!redis) return next(); // degrade open

    const userId = req.userId ?? "anon";
    const cacheKey = hashKey(scope, userId, rawKey);
    const storageKey = `idem:${cacheKey}`;
    const lockKey = `idem:lock:${cacheKey}`;

    try {
      const cached = await redis.get(storageKey);
      if (cached) {
        let parsed: CachedResponse;
        try {
          parsed = JSON.parse(cached) as CachedResponse;
        } catch {
          // Corrupt cache — fall through and let the handler run.
          await redis.del(storageKey);
          return next();
        }
        res.setHeader("Idempotency-Replayed", "true");
        res.status(parsed.status).json(parsed.body);
        return;
      }

      // Acquire an in-flight lock. SET NX EX.
      const lockAcquired = await redis.set(lockKey, "1", "EX", IN_FLIGHT_TTL_SECONDS, "NX");
      if (!lockAcquired) {
        res.status(409).json({
          error: "A request with this Idempotency-Key is already in flight",
          code: "IDEMPOTENCY_IN_FLIGHT",
          requestId: req.requestId,
        });
        return;
      }
    } catch (err) {
      // Redis hiccup — degrade open, don't fail the real request.
      console.warn(
        `[${req.requestId ?? "no-req-id"}] idempotency redis error, bypassing:`,
        (err as Error).message,
      );
      return next();
    }

    // Patch res.json to capture the final response body for caching.
    const originalJson = res.json.bind(res);
    res.json = function capturedJson(body: unknown) {
      const payload: CachedResponse = { status: res.statusCode, body };
      // Only cache 2xx — replaying a 500 or 429 is not helpful and can mask
      // transient issues the client should retry against.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        redis
          .set(storageKey, JSON.stringify(payload), "EX", TTL_SECONDS)
          .catch((err: Error) => {
            console.warn(
              `[${req.requestId ?? "no-req-id"}] idempotency cache write failed:`,
              err.message,
            );
          })
          .finally(() => {
            redis.del(lockKey).catch(() => undefined);
          });
      } else {
        // Release the lock so clients can retry with the same key after a
        // validation error.
        redis.del(lockKey).catch(() => undefined);
      }
      return originalJson(body);
    };

    // Ensure the lock is released if the handler errors out.
    res.on("close", () => {
      if (res.statusCode >= 500 || !res.writableEnded) {
        redis.del(lockKey).catch(() => undefined);
      }
    });

    next();
  };
}

function hashKey(scope: string, userId: string, rawKey: string): string {
  return createHash("sha256")
    .update(`${scope}|${userId}|${rawKey}`)
    .digest("base64url")
    .slice(0, 40);
}
