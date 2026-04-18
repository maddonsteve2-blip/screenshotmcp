import type { Page } from "playwright";

/**
 * Humanized mouse movement and interaction helpers.
 *
 * Cloudflare Turnstile, hCaptcha, and DataDome fingerprint callers by
 * measuring mouse-move entropy before a click. Teleporting the cursor
 * straight to a button with zero prior movement flags the session as a bot
 * even when every other navigator property looks real.
 *
 * These helpers trace curved paths with variable speed, inject small
 * micro-jitter, and add pre-click hover dwell time so our click sequence
 * matches the shape of a real user.
 */

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Bezier-like eased interpolation between two points with N waypoints.
 * Adds small orthogonal jitter to every step so the path is never perfectly
 * straight.
 */
function pathPoints(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps: number,
): Array<{ x: number; y: number }> {
  const cp1 = {
    x: fromX + (toX - fromX) * randomBetween(0.2, 0.45) + randomBetween(-40, 40),
    y: fromY + (toY - fromY) * randomBetween(0.2, 0.45) + randomBetween(-40, 40),
  };
  const cp2 = {
    x: fromX + (toX - fromX) * randomBetween(0.55, 0.8) + randomBetween(-40, 40),
    y: fromY + (toY - fromY) * randomBetween(0.55, 0.8) + randomBetween(-40, 40),
  };
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    // Cubic Bezier
    const x =
      u * u * u * fromX +
      3 * u * u * t * cp1.x +
      3 * u * t * t * cp2.x +
      t * t * t * toX;
    const y =
      u * u * u * fromY +
      3 * u * u * t * cp1.y +
      3 * u * t * t * cp2.y +
      t * t * t * toY;
    // Orthogonal jitter shrinking toward target
    const jitter = Math.max(0, 3 * (1 - t));
    points.push({
      x: x + randomBetween(-jitter, jitter),
      y: y + randomBetween(-jitter, jitter),
    });
  }
  return points;
}

/**
 * Move the mouse from its current position to (x, y) with human-shaped motion.
 * The caller should `await` this before issuing a click.
 */
export async function humanMouseMove(
  page: Page,
  x: number,
  y: number,
  options: { steps?: number; pauseMin?: number; pauseMax?: number } = {},
): Promise<void> {
  const steps = options.steps ?? Math.floor(randomBetween(20, 35));
  const pauseMin = options.pauseMin ?? 4;
  const pauseMax = options.pauseMax ?? 14;

  // Playwright does not expose current mouse position. Assume origin (0, 0)
  // on first move; subsequent moves compose from `toX/toY`. That is fine
  // because the curve only needs a plausible shape — not a measured one.
  const fromX = Math.floor(randomBetween(10, 200));
  const fromY = Math.floor(randomBetween(10, 200));

  const pts = pathPoints(fromX, fromY, x, y, steps);
  for (const pt of pts) {
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(randomBetween(pauseMin, pauseMax));
  }
}

/**
 * Move to (x, y) with a human-shaped path, dwell, then click. Use this
 * instead of `page.mouse.click(x, y)` whenever the target is a CAPTCHA
 * widget, submit button behind anti-bot, or any element that may fingerprint.
 */
export async function humanClick(
  page: Page,
  x: number,
  y: number,
  options: { dwellMin?: number; dwellMax?: number; holdMin?: number; holdMax?: number } = {},
): Promise<void> {
  await humanMouseMove(page, x, y);
  await page.waitForTimeout(randomBetween(options.dwellMin ?? 60, options.dwellMax ?? 180));
  await page.mouse.down();
  await page.waitForTimeout(randomBetween(options.holdMin ?? 25, options.holdMax ?? 90));
  await page.mouse.up();
}

/**
 * Random short delay — call before/after sensitive interactions so timing
 * signals are not mechanically uniform across runs.
 */
export async function naturalPause(page: Page, minMs = 80, maxMs = 260): Promise<void> {
  await page.waitForTimeout(randomBetween(minMs, maxMs));
}

/**
 * Simulate a small burst of idle hand activity: micro-moves near (x, y)
 * that mimic a user holding the cursor over a widget while reading.
 */
export async function idleHover(
  page: Page,
  x: number,
  y: number,
  durationMs = 700,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    await page.mouse.move(x + randomBetween(-3, 3), y + randomBetween(-3, 3));
    await page.waitForTimeout(randomBetween(25, 80));
  }
}
