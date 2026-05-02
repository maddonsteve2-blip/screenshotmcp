import { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { screenshots } from "@deepsyte/db";
import { emitDashboardEvent } from "../lib/dashboard-events.js";
import { uploadScreenshot } from "../lib/r2.js";
import { browserPool } from "../lib/browser-pool.js";
import { STEALTH_SCRIPT, DEFAULT_USER_AGENT } from "../lib/stealth.js";
import { emitWebhookEvent } from "../lib/webhook-delivery.js";
import type { ScreenshotJob } from "@deepsyte/types";
import type { Page } from "playwright";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * Wait until the page DOM is truly idle:
 * - document.readyState is "complete"
 * - no in-flight network fetches (or timeout after 5s)
 * - all <img> elements have loaded (or timeout after 8s)
 * - requestIdleCallback fires (or timeout after 3s)
 */
async function waitForDomReady(page: Page): Promise<void> {
  // 1. Wait for document.readyState === "complete"
  await page.evaluate(() => new Promise<void>((resolve) => {
    if ((globalThis as any).document.readyState === "complete") return resolve();
    (globalThis as any).window.addEventListener("load", () => resolve(), { once: true });
  })).catch(() => {});

  // 2. Wait for network to go quiet (no fetches in 500ms window, max 5s)
  await page.evaluate(() => new Promise<void>((resolve) => {
    let pending = 0;
    let timer: any;
    const done = () => { clearTimeout(timer); resolve(); };
    const check = () => { if (pending <= 0) { timer = setTimeout(done, 500); } };
    const maxTimer = setTimeout(done, 5000);
    const origFetch = (globalThis as any).window.fetch;
    (globalThis as any).window.fetch = (...args: any[]) => {
      pending++;
      return origFetch.apply((globalThis as any).window, args).finally(() => { pending--; check(); });
    };
    check();
    // Clean up on resolve
    void new Promise<void>((r) => { const t = setTimeout(() => { clearTimeout(maxTimer); r(); }, 6000); });
  })).catch(() => {});

  // 3. Wait for all visible images to load (max 8s)
  await page.evaluate(() => new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 8000);
    const imgs: any[] = Array.from((globalThis as any).document.querySelectorAll("img"));
    if (imgs.length === 0) { clearTimeout(timeout); return resolve(); }
    let loaded = 0;
    const total = imgs.length;
    const onDone = () => { loaded++; if (loaded >= total) { clearTimeout(timeout); resolve(); } };
    for (const img of imgs) {
      if (img.complete && img.naturalWidth > 0) { onDone(); continue; }
      img.addEventListener("load", onDone, { once: true });
      img.addEventListener("error", onDone, { once: true });
    }
  })).catch(() => {});
}

/**
 * Scroll through the page in increments to trigger lazy-loaded content
 * and scroll-triggered animations (IntersectionObserver, Framer Motion whileInView, etc.)
 * After scrolling, waits for all images in each viewport to load before moving on.
 */
async function scrollToTriggerContent(page: Page): Promise<void> {
  const scrollHeight = await page.evaluate(() => Math.max(
    (globalThis as any).document.body.scrollHeight,
    (globalThis as any).document.documentElement.scrollHeight,
    (globalThis as any).document.body.offsetHeight,
    (globalThis as any).document.documentElement.offsetHeight
  ));

  const viewportHeight = await page.evaluate(() => (globalThis as any).window.innerHeight);

  if (scrollHeight <= viewportHeight) {
    await waitForDomReady(page);
    return;
  }

  // Scroll down in viewport-sized chunks to trigger all lazy content
  const scrollSteps = Math.ceil(scrollHeight / viewportHeight);

  for (let i = 0; i < scrollSteps; i++) {
    const scrollY = Math.min((i + 1) * viewportHeight, scrollHeight);
    await page.evaluate((y: number) => { (globalThis as any).window.scrollTo(0, y); }, scrollY);
    // Wait for lazy images in this viewport slice to start loading
    await page.waitForTimeout(400);
    // Wait for any images that just entered the viewport to finish loading
    await page.evaluate(() => new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      const imgs: any[] = Array.from((globalThis as any).document.querySelectorAll("img"));
      if (imgs.length === 0) { clearTimeout(timeout); return resolve(); }
      let pending = 0;
      for (const img of imgs) {
        if (img.complete && img.naturalWidth > 0) continue;
        pending++;
        const done = () => { pending--; if (pending <= 0) { clearTimeout(timeout); resolve(); } };
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }
      if (pending === 0) { clearTimeout(timeout); resolve(); }
    })).catch(() => {});
  }

  // Re-measure in case lazy content expanded the page
  const newScrollHeight = await page.evaluate(() => Math.max(
    (globalThis as any).document.body.scrollHeight,
    (globalThis as any).document.documentElement.scrollHeight
  ));

  // If page grew significantly, do one more pass on the new content
  if (newScrollHeight > scrollHeight + viewportHeight) {
    const extraSteps = Math.ceil((newScrollHeight - scrollHeight) / viewportHeight);
    for (let i = 0; i < extraSteps; i++) {
      const scrollY = scrollHeight + (i + 1) * viewportHeight;
      await page.evaluate((y: number) => { (globalThis as any).window.scrollTo(0, y); }, scrollY);
      await page.waitForTimeout(400);
    }
  }

  // Final wait for any trailing animations/transitions
  await page.waitForTimeout(800);

  // Scroll back to top for consistent full-page capture
  await page.evaluate(() => { (globalThis as any).window.scrollTo(0, 0); });
  await page.waitForTimeout(300);
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

    // Wait for DOM to be truly ready (images loaded, network quiet)
    await waitForDomReady(page);

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

    // Best-effort fanout to user webhook subscribers; never block job completion.
    const [row] = await db
      .select({ userId: screenshots.userId, url: screenshots.url, format: screenshots.format })
      .from(screenshots)
      .where(eq(screenshots.id, id));
    if (row) {
      emitDashboardEvent({
        type: "screenshot.completed",
        userId: row.userId,
        payload: {
          screenshotId: id,
          url: row.url,
          publicUrl,
          format: row.format,
          status: "done",
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
        },
      });
      void emitWebhookEvent({
        userId: row.userId,
        eventType: "screenshot.completed",
        dedupeKey: `screenshot.completed:${id}`,
        payload: {
          screenshotId: id,
          url: row.url,
          publicUrl,
          format: row.format,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
        },
      }).catch((err) => console.warn(`[webhooks] emit screenshot.completed failed:`, err));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(screenshots)
      .set({ status: "failed", errorMessage: message })
      .where(eq(screenshots.id, id));
    const [row] = await db
      .select({ userId: screenshots.userId, url: screenshots.url })
      .from(screenshots)
      .where(eq(screenshots.id, id));
    if (row) {
      emitDashboardEvent({
        type: "screenshot.failed",
        userId: row.userId,
        payload: {
          screenshotId: id,
          url: row.url,
          status: "failed",
          errorMessage: message,
        },
      });
      void emitWebhookEvent({
        userId: row.userId,
        eventType: "screenshot.failed",
        dedupeKey: `screenshot.failed:${id}`,
        payload: { screenshotId: id, url: row.url, error: message },
      }).catch((err) => console.warn(`[webhooks] emit screenshot.failed failed:`, err));
    }
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
