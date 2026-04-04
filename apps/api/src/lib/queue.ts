import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { processScreenshotJob } from "../worker/processor.js";

const connection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export const screenshotQueue = new Queue("screenshots", { connection });

export const screenshotWorker = new Worker(
  "screenshots",
  processScreenshotJob,
  { connection, concurrency: 3 }
);

screenshotWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

screenshotWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});
