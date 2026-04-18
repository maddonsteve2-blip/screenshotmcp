import { Redis } from "ioredis";

/**
 * Single shared Redis connection for queue + ancillary features (idempotency
 * cache, rate-limit state, etc.). BullMQ requires `maxRetriesPerRequest: null`
 * and `enableReadyCheck: false` on its own connection instance, so we expose
 * the same configured instance here rather than letting callers new-up
 * their own.
 *
 * If REDIS_URL is not set we return null so non-queue features can degrade
 * gracefully (idempotency becomes a no-op rather than blowing up local dev).
 */
let _connection: Redis | null = null;
let _attempted = false;

export function getRedis(): Redis | null {
  if (_connection) return _connection;
  if (_attempted) return null;
  _attempted = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("REDIS_URL not set — idempotency + queue features disabled");
    return null;
  }

  _connection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
  _connection.on("error", (err) => console.error("Redis error:", err.message));
  return _connection;
}
