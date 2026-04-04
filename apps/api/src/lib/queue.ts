import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { processScreenshotJob } from "../worker/processor.js";

let _queue: Queue | null = null;
let _worker: Worker | null = null;
let _connection: Redis | null = null;

function getConnection(): Redis {
  if (!_connection) {
    _connection = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    _connection.on("error", (err) => console.error("Redis error:", err.message));
  }
  return _connection;
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
    });
    _worker.on("failed", (job, err) => console.error(`Job ${job?.id} failed:`, err.message));
    _worker.on("completed", (job) => console.log(`Job ${job.id} completed`));
  }
  return _worker;
}

export const screenshotQueue = { add: (...args: Parameters<Queue["add"]>) => getQueue().add(...args) };
