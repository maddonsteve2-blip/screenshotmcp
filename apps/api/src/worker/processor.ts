import { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { screenshots } from "@screenshotsmcp/db";
import { uploadScreenshot } from "../lib/r2.js";
import { browserPool } from "../lib/browser-pool.js";
import { STEALTH_SCRIPT, DEFAULT_USER_AGENT } from "../lib/stealth.js";
import type { ScreenshotJob } from "@screenshotsmcp/types";
import type { Page } from "playwright";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * Scroll through the page in increments to trigger lazy-loaded content
 * and scroll-triggered animations (IntersectionObserver, Framer Motion whileInView, etc.)
 * This ensures all content is rendered before taking a full-page screenshot.
 */
async function scrollToTriggerContent(page: Page): Promise<void> {
  // Get the full scrollable height of the page using string evaluate to avoid TS DOM errors
  const scrollHeight = await page.evaluate(() => Math.max(
    (globalThis as any).document.body.scrollHeight,
    (globalThis as any).document.documentElement.scrollHeight,
    (globalThis as any).document.body.offsetHeight,
    (globalThis as any).document.documentElement.offsetHeight
  ));

  const viewportHeight = await page.evaluate(() => (globalThis as any).window.innerHeight);

  // If page is shorter than viewport, no need to scroll
  if (scrollHeight <= viewportHeight) {
    return;
  }

  // Scroll down in viewport-sized chunks to trigger all lazy content
  const scrollSteps = Math.ceil(scrollHeight / viewportHeight);

  for (let i = 0; i < scrollSteps; i++) {
    const scrollY = Math.min((i + 1) * viewportHeight, scrollHeight);
    await page.evaluate((y: number) => { (globalThis as any).window.scrollTo(0, y); }, scrollY);
    // Wait for animations and lazy content to load
    await page.waitForTimeout(300);
  }

  // Additional wait for any final animations
  await page.waitForTimeout(500);

  // Scroll back to top for consistent full-page capture
  await page.evaluate(() => { (globalThis as any).window.scrollTo(0, 0); });
  await page.waitForTimeout(200);
}

export async function processScreenshotJob(job: Job<ScreenshotJob>) {
  const { id, options } = job.data;
  const {
    url,
    width = 1280,
    height = 800,
    fullPage = false,
    format = "png",
    delay = 0,
    darkMode = false,
    selector,
    pdf = false,
  } = options;

  await db
    .update(screenshots)
    .set({ status: "processing" })
    .where(eq(screenshots.id, id));

  const { browser, release } = await browserPool.acquire();
  let context;
  try {
    context = await browser.newContext({
      userAgent: DEFAULT_USER_AGENT,
      viewport: { width, height },
      locale: "en-US",
      colorScheme: darkMode ? "dark" : "light",
    });
    const page = await context.newPage();
    await page.addInitScript(STEALTH_SCRIPT);
    // Use networkidle for full page load (SPAs, dynamic content)
    // Fall back to load if networkidle times out
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    } catch {
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
    }
    await page.waitForTimeout(Math.max(delay, 1500));

    // Scroll through page to trigger lazy-loaded content and scroll animations
    // This is critical for sites with IntersectionObserver, lazy images, and whileInView animations
    await scrollToTriggerContent(page);

    let buffer: Buffer;
    let outputFormat: string = format;
    let contentType: string = CONTENT_TYPES[format];

    if (pdf) {
      buffer = Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
      outputFormat = "pdf";
      contentType = "application/pdf";
    } else if (selector) {
      const el = page.locator(selector).first();
      buffer = Buffer.from(await el.screenshot({ type: format as "png" | "jpeg" }));
    } else {
      buffer = Buffer.from(await page.screenshot({ type: format as "png" | "jpeg", fullPage: true }));
    }

    const ext = pdf ? "pdf" : format;
    const r2Key = `screenshots/${id}.${ext}`;
    const publicUrl = await uploadScreenshot(r2Key, buffer, contentType);

    await db
      .update(screenshots)
      .set({ status: "done", r2Key, publicUrl, completedAt: new Date() })
      .where(eq(screenshots.id, id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(screenshots)
      .set({ status: "failed", errorMessage: message })
      .where(eq(screenshots.id, id));
    throw err;
  } finally {
    if (context) await context.close().catch(() => {});
    await release();
  }
}
