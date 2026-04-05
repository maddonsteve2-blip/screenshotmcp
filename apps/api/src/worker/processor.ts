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

const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  window.chrome = { runtime: {} };
  const origQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (params) =>
    params.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : origQuery(params);
`;

async function closeBrowser(browser: any) {
  try {
    await browser.close();
  } catch {
    // Force-kill all child processes if graceful close fails
    try {
      const pid = browser.process()?.pid;
      if (pid) process.kill(pid, "SIGKILL");
    } catch {}
  }
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

  let browser;
  try {
    browser = await chromium.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--single-process",
      ],
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      timeout: 15000,
    });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width, height },
      locale: "en-US",
      colorScheme: darkMode ? "dark" : "light",
    });
    const page = await context.newPage();
    await page.addInitScript(STEALTH_SCRIPT);
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    // Wait a bit for dynamic content after load
    await page.waitForTimeout(Math.max(delay, 1500));

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
    if (browser) await closeBrowser(browser);
  }
}
