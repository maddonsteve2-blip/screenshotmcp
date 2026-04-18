import { nanoid } from "nanoid";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { browserPool } from "./browser-pool.js";
import { uploadScreenshot } from "./r2.js";

/**
 * Shared visual-diff implementation used by both the MCP `screenshot_diff`
 * tool and the REST `POST /v1/screenshot/diff` endpoint (which the
 * `screenshotsmcp/action` GitHub Action wraps).
 *
 * Captures both URLs at the same viewport, runs pixelmatch with the requested
 * threshold, uploads the diff overlay plus both source captures to R2, and
 * returns structured numbers + URLs callers can use to fail PRs / post
 * review comments.
 */

export interface DiffInput {
  urlA: string;
  urlB: string;
  width?: number;
  height?: number;
  threshold?: number; // 0..1
}

export interface DiffResult {
  beforeUrl: string;
  afterUrl: string;
  diffUrl: string;
  changedPixels: number;
  totalPixels: number;
  changedPercent: number;
  matchScore: number;
  width: number;
  height: number;
  threshold: number;
}

export async function performScreenshotDiff(input: DiffInput): Promise<DiffResult> {
  const width = input.width ?? 1280;
  const height = input.height ?? 800;
  const threshold = input.threshold ?? 0.1;

  const { browser, release } = await browserPool.acquire();
  try {
    const page = await browser.newPage({ viewport: { width, height } });

    await page
      .goto(input.urlA, { waitUntil: "networkidle", timeout: 30000 })
      .catch(() => page.goto(input.urlA, { waitUntil: "load", timeout: 30000 }));
    const bufA = await page.screenshot({ type: "png", fullPage: false });

    await page
      .goto(input.urlB, { waitUntil: "networkidle", timeout: 30000 })
      .catch(() => page.goto(input.urlB, { waitUntil: "load", timeout: 30000 }));
    const bufB = await page.screenshot({ type: "png", fullPage: false });
    await page.close();

    const imgA = PNG.sync.read(Buffer.from(bufA));
    const imgB = PNG.sync.read(Buffer.from(bufB));

    const w = Math.min(imgA.width, imgB.width);
    const h = Math.min(imgA.height, imgB.height);
    const diff = new PNG({ width: w, height: h });

    const changedPixels = pixelmatch(imgA.data, imgB.data, diff.data, w, h, {
      threshold,
      includeAA: true,
    });
    const totalPixels = w * h;

    const diffBuf = PNG.sync.write(diff);
    const diffKey = `screenshots/diff-${nanoid()}.png`;
    const keyA = `screenshots/diff-a-${nanoid()}.png`;
    const keyB = `screenshots/diff-b-${nanoid()}.png`;

    const [diffUrl, beforeUrl, afterUrl] = await Promise.all([
      uploadScreenshot(diffKey, Buffer.from(diffBuf), "image/png"),
      uploadScreenshot(keyA, Buffer.from(bufA), "image/png"),
      uploadScreenshot(keyB, Buffer.from(bufB), "image/png"),
    ]);

    return {
      beforeUrl,
      afterUrl,
      diffUrl,
      changedPixels,
      totalPixels,
      changedPercent: (changedPixels / totalPixels) * 100,
      matchScore: 100 - (changedPixels / totalPixels) * 100,
      width: w,
      height: h,
      threshold,
    };
  } finally {
    await release();
  }
}
