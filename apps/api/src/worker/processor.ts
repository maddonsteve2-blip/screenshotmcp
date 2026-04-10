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
    maxHeight,
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

    // For element screenshots, wait for the selector to appear (SPA support)
    if (selector) {
      try {
        await page.waitForSelector(selector, { timeout: 15000 });
      } catch {
        // Element may still not exist — let it fall through to screenshot which will give a clear error
      }
    }

    // Only scroll to trigger lazy content when doing full-page captures
    if (fullPage) {
      await scrollToTriggerContent(page);
    }

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
      buffer = Buffer.from(await page.screenshot({ type: format as "png" | "jpeg", fullPage }));

      // If maxHeight is set, check if we need to re-capture with capped height
      if (maxHeight && fullPage) {
        const dims = getImageDimensions(buffer, format);
        if (dims && dims.height > maxHeight) {
          // Scroll to top, resize viewport to maxHeight, and take viewport-only screenshot
          await page.evaluate(() => (globalThis as any).scrollTo(0, 0));
          await page.setViewportSize({ width: dims.width, height: maxHeight });
          await page.waitForTimeout(300);
          buffer = Buffer.from(await page.screenshot({ type: format as "png" | "jpeg", fullPage: false }));
        }
      }
    }

    // Get actual image dimensions for the response (skip for PDF — binary format differs)
    const dimensions = pdf ? null : getImageDimensions(buffer, outputFormat);

    const ext = pdf ? "pdf" : format;
    const r2Key = `screenshots/${id}.${ext}`;
    const publicUrl = await uploadScreenshot(r2Key, buffer, contentType);

    await db
      .update(screenshots)
      .set({
        status: "done",
        r2Key,
        publicUrl,
        completedAt: new Date(),
        ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
      })
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


/**
 * Extract image dimensions from PNG header.
 */
function getImageDimensions(buffer: Buffer, format: string): { width: number; height: number } | null {
  try {
    if (format === "png" && buffer.length > 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    // JPEG SOF0 marker parsing
    if ((format === "jpeg" || format === "webp") && buffer.length > 2) {
      let offset = 2;
      while (offset < buffer.length - 1) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8) {
          if (offset + 9 < buffer.length) {
            const h = buffer.readUInt16BE(offset + 5);
            const w = buffer.readUInt16BE(offset + 7);
            return { width: w, height: h };
          }
        }
        if (offset + 3 < buffer.length) {
          const len = buffer.readUInt16BE(offset + 2);
          offset += 2 + len;
        } else {
          break;
        }
      }
    }
  } catch { /* parsing failed, return null */ }
  return null;
}
