import { Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { processScreenshotJob } from "../worker/processor.js";
import { getRedis } from "./redis.js";

let _queue: Queue | null = null;
let _worker: Worker | null = null;

function getConnection(): Redis {
  const conn = getRedis();
  if (!conn) {
    throw new Error("REDIS_URL not set — screenshot queue cannot start");
  }
  return conn;
}

export function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue("screenshots", { connection: getConnection() });
  }
  return _queue;
}

export function startWorker(): Worker {
  if (!_worker) {
    _worker = new Worker("screenshots", processScreenshotJob, {
      connection: getConnection(),
      concurrency: 3,
      lockDuration: 60000,
    });
    _worker.on("failed", (job, err) => console.error(`Job ${job?.id} failed:`, err.message));
    _worker.on("completed", (job) => console.log(`Job ${job.id} completed`));
  }
  return _worker;
}

export const screenshotQueue = { add: (...args: Parameters<Queue["add"]>) => getQueue().add(...args) };
