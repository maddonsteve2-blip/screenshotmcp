import { Job } from "bullmq";
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { screenshots } from "@screenshotsmcp/db";
import { uploadScreenshot } from "../lib/r2.js";
import type { ScreenshotJob } from "@screenshotsmcp/types";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function processScreenshotJob(job: Job<ScreenshotJob>) {
  const { id, options } = job.data;
  const {
    url,
    width = 1280,
    height = 800,
    fullPage = false,
    format = "png",
    delay = 0,
  } = options;

  await db
    .update(screenshots)
    .set({ status: "processing" })
    .where(eq(screenshots.id, id));

  let browser;
  try {
    browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    if (delay > 0) {
      await page.waitForTimeout(delay);
    }

    const buffer = await page.screenshot({
      type: format as "png" | "jpeg",
      fullPage,
    });

    await browser.close();

    const r2Key = `screenshots/${id}.${format}`;
    const publicUrl = await uploadScreenshot(
      r2Key,
      Buffer.from(buffer),
      CONTENT_TYPES[format]
    );

    await db
      .update(screenshots)
      .set({ status: "done", r2Key, publicUrl, completedAt: new Date() })
      .where(eq(screenshots.id, id));
  } catch (err) {
    if (browser) await browser.close();
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(screenshots)
      .set({ status: "failed", errorMessage: message })
      .where(eq(screenshots.id, id));
    throw err;
  }
}
