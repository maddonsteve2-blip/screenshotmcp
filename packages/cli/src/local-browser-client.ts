import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { chromium } from "playwright";
import { getLocalBrowserHomeDir } from "./local-browser.js";
import {
  cleanupLocalBrowserSession,
  getLocalBrowserSession,
  type LocalBrowserConsoleEntry,
  type LocalBrowserNetworkErrorEntry,
  type LocalBrowserNetworkRequestEntry,
  type LocalBrowserRecordingSegment,
  requireLocalBrowserSession,
  withLocalBrowserSessionLock,
  updateLocalBrowserSession,
  type StoredLocalBrowserSession,
} from "./local-browser-session.js";

interface BrowserAttachment {
  browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>;
  page: Awaited<ReturnType<typeof resolveManagedPage>>;
  session: StoredLocalBrowserSession;
}

const MAX_LOCAL_CONSOLE_LOGS = 200;
const MAX_LOCAL_NETWORK_ERRORS = 100;
const MAX_LOCAL_NETWORK_REQUESTS = 500;

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRecordingPath(sessionId: string, timeoutMs = 15000): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = getLocalBrowserSession();
    if (!current || current.sessionId !== sessionId) {
      return undefined;
    }
    if (hasNonEmptyFile(current.recordingPath)) {
      return current.recordingPath;
    }
    await wait(250);
  }
  return undefined;
}

async function waitForRecordingFinalization(sessionId: string, timeoutMs = 15000): Promise<StoredLocalBrowserSession | undefined> {
  const deadline = Date.now() + timeoutMs;
  let lastSeen: StoredLocalBrowserSession | undefined;

  while (Date.now() < deadline) {
    const current = getLocalBrowserSession();
    if (!current || current.sessionId !== sessionId) {
      return lastSeen;
    }

    lastSeen = current;
    const recordingSegments = Array.isArray(current.recordingSegments) ? current.recordingSegments : [];
    const hasActiveSegments = recordingSegments.some((segment) => segment.status === "starting" || segment.status === "ready");
    if (hasNonEmptyFile(current.recordingPath) || (recordingSegments.length > 0 && !hasActiveSegments)) {
      return current;
    }

    await wait(250);
  }

  return lastSeen;
}

function hasNonEmptyFile(filePath?: string): filePath is string {
  if (!filePath || !existsSync(filePath)) {
    return false;
  }

  try {
    return statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

async function requestDaemonShutdown(session: StoredLocalBrowserSession): Promise<void> {
  const controlPath = join(session.userDataDir, "daemon-control.json");
  await writeFile(controlPath, JSON.stringify({
    action: "close",
    requestedAt: new Date().toISOString(),
  }, null, 2), "utf8");
}

function choosePreferredRecordingPath(candidates: Array<string | undefined>): string | undefined {
  const scored = candidates
    .map((candidate) => {
      if (!candidate || !existsSync(candidate)) {
        return null;
      }
      try {
        const stat = statSync(candidate);
        if (stat.size <= 0) {
          return null;
        }
        return {
          path: candidate,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        };
      } catch {
        return null;
      }
    })
    .filter((value): value is { path: string; size: number; mtimeMs: number } => !!value)
    .sort((left, right) => right.size - left.size || right.mtimeMs - left.mtimeMs);

  return scored[0]?.path;
}

function findRecordingPathInDir(recordingDir?: string): string | undefined {
  if (!recordingDir || !existsSync(recordingDir)) {
    return undefined;
  }

  return choosePreferredRecordingPath(
    readdirSync(recordingDir)
      .filter((fileName) => fileName.toLowerCase().endsWith(".webm"))
      .map((fileName) => join(recordingDir, fileName)),
  );
}

function slugifyEvidenceLabel(value?: string): string {
  if (!value) {
    return "";
  }
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug ? `-${slug}` : "";
}

function readJsonArtifact<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function finalizeLocalBrowserEvidenceBundle(
  bundleDir: string,
  session: StoredLocalBrowserSession,
  recordingPath?: string,
): Promise<{
  bundleDir: string;
  fileCount: number;
  recordingIncluded: boolean;
  recordingPending: boolean;
}> {
  const recordingArtifactPath = join(bundleDir, "recording.webm");
  const recordingStatusPath = join(bundleDir, "recording-status.txt");
  const recordingSegmentsPath = join(bundleDir, "recording-segments.json");
  const manifestPath = join(bundleDir, "manifest.json");
  const sessionArtifactPath = join(bundleDir, "session.json");
  const recordingSegments = Array.isArray(session.recordingSegments) ? session.recordingSegments : [];
  const completedSegments = recordingSegments.filter((segment) => segment.status === "complete");
  const emptySegments = recordingSegments.filter((segment) => segment.status === "empty");
  const failedSegments = recordingSegments.filter((segment) => segment.status === "failed");
  const hasActiveSegments = recordingSegments.some((segment) => segment.status === "starting" || segment.status === "ready");

  let recordingIncluded = false;
  let recordingPending = false;

  if (hasNonEmptyFile(recordingPath)) {
    copyFileSync(recordingPath, recordingArtifactPath);
    rmSync(recordingStatusPath, { force: true });
    recordingIncluded = true;
  } else if (session.recordVideo) {
    const segmentSummary = recordingSegments.length
      ? `Segments: ${recordingSegments.length}, complete: ${completedSegments.length}, empty: ${emptySegments.length}, failed: ${failedSegments.length}.`
      : "No recording segments were captured yet.";
    await writeFile(
      recordingStatusPath,
      completedSegments.length === 0 && (emptySegments.length > 0 || failedSegments.length > 0)
        ? `Recording finished without a usable primary .webm file. ${segmentSummary}`
        : `Recording is enabled for this session, but the .webm file is only finalized when the managed browser is closed. ${segmentSummary}`,
      "utf8",
    );
    recordingPending = hasActiveSegments || recordingSegments.length === 0;
  }

  await writeFile(recordingSegmentsPath, JSON.stringify(recordingSegments, null, 2), "utf8");

  const existingSessionArtifact = readJsonArtifact<Record<string, unknown>>(sessionArtifactPath) ?? {};
  await writeFile(sessionArtifactPath, JSON.stringify({
    ...existingSessionArtifact,
    ...session,
    recordingPath,
  }, null, 2), "utf8");

  const artifacts = readdirSync(bundleDir)
    .filter((fileName) => fileName !== "manifest.json")
    .sort((left, right) => left.localeCompare(right));

  const existingManifest = readJsonArtifact<Record<string, unknown>>(manifestPath) ?? {};
  await writeFile(manifestPath, JSON.stringify({
    ...existingManifest,
    createdAt: typeof existingManifest.createdAt === "string" ? existingManifest.createdAt : new Date().toISOString(),
    sessionId: session.sessionId,
    browser: session.browser,
    url: session.url,
    launchMode: session.launchMode,
    recordVideo: session.recordVideo,
    recordingIncluded,
    recordingPending,
    sourceRecordingPath: recordingPath,
    recordingSegmentCount: recordingSegments.length,
    completedRecordingSegments: completedSegments.length,
    emptyRecordingSegments: emptySegments.length,
    failedRecordingSegments: failedSegments.length,
    artifacts,
  }, null, 2), "utf8");

  return {
    bundleDir,
    fileCount: artifacts.length + 1,
    recordingIncluded,
    recordingPending,
  };
}

async function connectToManagedBrowser(debugPort: number): Promise<Awaited<ReturnType<typeof chromium.connectOverCDP>>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, {
        isLocal: true,
        timeout: 2_000,
      });
    } catch {
      // Retry until the browser exposes a stable CDP endpoint.
    }

    await wait(250);
  }

  throw new Error(`The managed browser on debug port ${debugPort} did not become attachable in time. Launch it again with \`deepsyte browser open\`.`);
}

async function resolveManagedPage(browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>) {
  const contexts = browser.contexts();
  const context = contexts[0] ?? await browser.newContext();
  const pages = context.pages();
  return pages[pages.length - 1] ?? await context.newPage();
}

async function withAttachedBrowser<T>(fn: (attachment: BrowserAttachment) => Promise<T>): Promise<T> {
  return withLocalBrowserSessionLock(async () => {
    const session = requireLocalBrowserSession();
    let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;
    let detachObservers: (() => void) | null = null;
    let observedSession = session;
    let page: Awaited<ReturnType<typeof resolveManagedPage>> | null = null;
    try {
      browser = await connectToManagedBrowser(session.debugPort);
      page = await resolveManagedPage(browser);
      observedSession = {
        ...session,
        consoleLogs: [...session.consoleLogs],
        networkErrors: [...session.networkErrors],
        networkRequests: [...session.networkRequests],
      };
      if (session.launchMode !== "daemon") {
        detachObservers = attachLocalBrowserObservers(page, observedSession);
      }
      return await fn({ browser, page, session: observedSession });
    } catch (error) {
      if (error instanceof Error && /ECONNREFUSED|Target closed|WebSocket|Browser has been closed/i.test(error.message)) {
        cleanupLocalBrowserSession(session, { terminateProcess: false });
      }
      throw error;
    } finally {
      detachObservers?.();
      if (page) {
        const trackedSession = getLocalBrowserSession();
        if (trackedSession?.sessionId === session.sessionId) {
          updateLocalBrowserSession(
            session.launchMode === "daemon"
              ? {
                  ...trackedSession,
                  url: page.url(),
                }
              : {
                  ...observedSession,
                  url: page.url(),
                },
          );
        }
      }
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  });
}

async function saveLocalScreenshot(page: Awaited<ReturnType<typeof resolveManagedPage>>): Promise<string> {
  const screenshotsDir = join(getLocalBrowserHomeDir(), "screenshots");
  mkdirSync(screenshotsDir, { recursive: true });
  const filePath = join(screenshotsDir, `local-${Date.now()}.png`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      if (attempt < 2) {
        await page.screenshot({
          path: filePath,
          fullPage: false,
          timeout: 10_000,
          animations: "disabled",
        });
      } else {
        await page.locator("body").screenshot({
          path: filePath,
          timeout: 10_000,
          animations: "disabled",
        });
      }
      return filePath;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(500);
    }
  }
  return filePath;
}

function trimOutput(value: string, maxLength: number, suffix = "\n...(truncated)"): string {
  return value.length > maxLength ? value.slice(0, maxLength) + suffix : value;
}

function pushConsoleLog(logs: LocalBrowserConsoleEntry[], entry: LocalBrowserConsoleEntry): void {
  logs.push(entry);
  if (logs.length > MAX_LOCAL_CONSOLE_LOGS) {
    logs.splice(0, logs.length - MAX_LOCAL_CONSOLE_LOGS);
  }
}

function pushNetworkError(errors: LocalBrowserNetworkErrorEntry[], entry: LocalBrowserNetworkErrorEntry): void {
  errors.push(entry);
  if (errors.length > MAX_LOCAL_NETWORK_ERRORS) {
    errors.splice(0, errors.length - MAX_LOCAL_NETWORK_ERRORS);
  }
}

function pushNetworkRequest(requests: LocalBrowserNetworkRequestEntry[], entry: LocalBrowserNetworkRequestEntry): void {
  requests.push(entry);
  if (requests.length > MAX_LOCAL_NETWORK_REQUESTS) {
    requests.splice(0, requests.length - MAX_LOCAL_NETWORK_REQUESTS);
  }
}

function attachLocalBrowserObservers(page: Awaited<ReturnType<typeof resolveManagedPage>>, session: StoredLocalBrowserSession): () => void {
  const requestTimings = new WeakMap<object, number>();

  const handleConsole = (msg: any) => {
    const level = msg.type();
    if (level === "error" || level === "warning" || level === "log") {
      pushConsoleLog(session.consoleLogs, {
        level,
        text: msg.text(),
        ts: Date.now(),
      });
    }
  };

  const handlePageError = (error: any) => {
    pushConsoleLog(session.consoleLogs, {
      level: "exception",
      text: error instanceof Error ? error.message : String(error),
      ts: Date.now(),
    });
  };

  const handleRequest = (request: any) => {
    requestTimings.set(request, Date.now());
  };

  const handleResponse = (response: any) => {
    const request = response.request();
    const startedAt = requestTimings.get(request) ?? Date.now();
    const entry: LocalBrowserNetworkRequestEntry = {
      url: response.url(),
      method: request.method(),
      status: response.status(),
      statusText: response.statusText(),
      resourceType: request.resourceType(),
      duration: Date.now() - startedAt,
      size: Number(response.headers()?.["content-length"] || 0),
      ts: Date.now(),
    };

    pushNetworkRequest(session.networkRequests, entry);

    if (entry.status >= 400) {
      pushNetworkError(session.networkErrors, {
        url: entry.url,
        status: entry.status,
        statusText: entry.statusText,
        ts: entry.ts,
      });
    }
  };

  page.on("console", handleConsole);
  page.on("pageerror", handlePageError);
  page.on("request", handleRequest);
  page.on("response", handleResponse);

  return () => {
    page.off("console", handleConsole);
    page.off("pageerror", handlePageError);
    page.off("request", handleRequest);
    page.off("response", handleResponse);
  };
}

export async function navigateLocalBrowser(url: string): Promise<{ session: StoredLocalBrowserSession; screenshotPath: string; url: string }> {
  return withAttachedBrowser(async ({ page, session }) => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const screenshotPath = await saveLocalScreenshot(page);
    return { session: { ...session, url }, screenshotPath, url };
  });
}

export async function clickLocalBrowser(selector: string): Promise<{ screenshotPath: string }> {
  return withAttachedBrowser(async ({ page }) => {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.click({ timeout: 5000 });
    } else {
      await page.getByText(selector, { exact: false }).first().click({ timeout: 5000 });
    }
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    return { screenshotPath: await saveLocalScreenshot(page) };
  });
}

export async function clickAtLocalBrowser(
  x: number,
  y: number,
  clickCount = 1,
  delay = 50,
): Promise<{ screenshotPath: string }> {
  return withAttachedBrowser(async ({ page }) => {
    await page.mouse.move(x, y, { steps: 5 });
    await page.mouse.click(x, y, { clickCount, delay });
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(300);
    return { screenshotPath: await saveLocalScreenshot(page) };
  });
}

export async function fillLocalBrowser(selector: string, value: string): Promise<{ screenshotPath: string }> {
  return withAttachedBrowser(async ({ page }) => {
    await page.locator(selector).first().fill(value, { timeout: 5000 });
    return { screenshotPath: await saveLocalScreenshot(page) };
  });
}

export async function hoverLocalBrowser(selector: string): Promise<{ screenshotPath: string }> {
  return withAttachedBrowser(async ({ page }) => {
    await page.locator(selector).first().hover({ timeout: 5000 });
    await page.waitForTimeout(300);
    return { screenshotPath: await saveLocalScreenshot(page) };
  });
}

export async function waitForLocalBrowser(selector: string, timeout = 5000): Promise<{ screenshotPath: string }> {
  return withAttachedBrowser(async ({ page }) => {
    await page.waitForSelector(selector, { timeout });
    return { screenshotPath: await saveLocalScreenshot(page) };
  });
}

export async function selectOptionLocalBrowser(selector: string, value: string): Promise<{ screenshotPath: string }> {
  return withAttachedBrowser(async ({ page }) => {
    await page.locator(selector).first().selectOption(value, { timeout: 5000 });
    return { screenshotPath: await saveLocalScreenshot(page) };
  });
}

export async function pressKeyLocalBrowser(key: string): Promise<{ screenshotPath: string }> {
  return withAttachedBrowser(async ({ page }) => {
    await page.keyboard.press(key);
    return { screenshotPath: await saveLocalScreenshot(page) };
  });
}

export async function scrollLocalBrowser(y: number): Promise<{ screenshotPath: string }> {
  return withAttachedBrowser(async ({ page }) => {
    await page.mouse.wheel(0, y);
    return { screenshotPath: await saveLocalScreenshot(page) };
  });
}

export async function setViewportLocalBrowser(width: number, height: number): Promise<{ screenshotPath: string }> {
  return withAttachedBrowser(async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    return { screenshotPath: await saveLocalScreenshot(page) };
  });
}

export async function goBackLocalBrowser(): Promise<{ screenshotPath: string; url: string }> {
  return withAttachedBrowser(async ({ page }) => {
    await page.goBack({ waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(1_000);
    return {
      screenshotPath: await saveLocalScreenshot(page),
      url: page.url(),
    };
  });
}

export async function goForwardLocalBrowser(): Promise<{ screenshotPath: string; url: string }> {
  return withAttachedBrowser(async ({ page }) => {
    await page.goForward({ waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(1_000);
    return {
      screenshotPath: await saveLocalScreenshot(page),
      url: page.url(),
    };
  });
}

export async function screenshotLocalBrowser(): Promise<{ screenshotPath: string }> {
  return withAttachedBrowser(async ({ page }) => ({ screenshotPath: await saveLocalScreenshot(page) }));
}

export async function getLocalBrowserText(selector?: string): Promise<string> {
  return withAttachedBrowser(async ({ page }) => {
    if (selector) {
      return (await page.locator(selector).first().innerText({ timeout: 5000 })).trim();
    }
    const bodyText = await page.locator("body").innerText();
    return bodyText.trim();
  });
}

export async function getLocalBrowserHtml(selector?: string): Promise<string> {
  return withAttachedBrowser(async ({ page }) => {
    if (selector) {
      return await page.locator(selector).first().evaluate((element) => (element as { outerHTML: string }).outerHTML);
    }
    return await page.content();
  });
}

export async function getLocalBrowserConsoleLogs(
  level: "all" | "error" | "warning" | "log" | "exception" = "all",
  limit = 50,
): Promise<string> {
  return withAttachedBrowser(async ({ session }) => {
    let logs = session.consoleLogs;
    if (level !== "all") {
      logs = logs.filter((entry) => entry.level === level);
    }
    logs = logs.slice(-limit);
    if (logs.length === 0) {
      return "No console logs captured. Use local browser commands to drive the page before checking logs.";
    }
    const label = logs.length === 1 ? "1 entry" : `${logs.length} entries`;
    return `Console logs (${label}):\n\n${logs.map((entry) => `[${entry.level.toUpperCase()}] ${entry.text}`).join("\n")}`;
  });
}

export async function getLocalBrowserNetworkErrors(limit = 50): Promise<string> {
  return withAttachedBrowser(async ({ session }) => {
    const errors = session.networkErrors.slice(-limit);
    if (errors.length === 0) {
      return "No failed network requests captured. All observed requests returned 2xx/3xx status codes.";
    }
    const label = errors.length === 1 ? "1 failed request" : `${errors.length} failed requests`;
    return `Failed network requests (${label}):\n\n${errors.map((entry) => `${entry.status} ${entry.statusText} — ${entry.url}`).join("\n")}`;
  });
}

export async function getLocalBrowserNetworkRequests(options?: {
  resourceType?: string;
  minDuration?: number;
  limit?: number;
}): Promise<string> {
  return withAttachedBrowser(async ({ session }) => {
    let requests = session.networkRequests;
    const minDuration = options?.minDuration ?? 0;
    if (options?.resourceType) {
      requests = requests.filter((entry) => entry.resourceType === options.resourceType);
    }
    if (minDuration > 0) {
      requests = requests.filter((entry) => entry.duration >= minDuration);
    }
    requests = requests.slice(-(options?.limit || 100));
    if (requests.length === 0) {
      return "No matching network requests captured.";
    }

    const totalSize = requests.reduce((sum, entry) => sum + entry.size, 0);
    const avgDuration = Math.round(requests.reduce((sum, entry) => sum + entry.duration, 0) / requests.length);
    const slowest = requests.reduce((max, entry) => entry.duration > max.duration ? entry : max, requests[0]);
    const header = `Network Requests (${requests.length} captured, ${Math.round(totalSize / 1024)}KB total, avg ${avgDuration}ms)\nSlowest: ${slowest.duration}ms — ${slowest.url.slice(0, 80)}\n`;
    const lines = requests.map((entry) => {
      const size = entry.size > 0 ? `${Math.round(entry.size / 1024)}KB` : "0KB";
      return `${entry.status} ${entry.method.padEnd(4)} ${entry.duration.toString().padStart(5)}ms ${size.padStart(6)} [${entry.resourceType}] ${entry.url.slice(0, 100)}`;
    });
    return header + lines.join("\n");
  });
}

export async function evaluateLocalBrowser(script: string): Promise<string> {
  return withAttachedBrowser(async ({ page }) => {
    const result = await page.evaluate(script);
    return typeof result === "string" ? result : JSON.stringify(result, null, 2);
  });
}

async function collectLocalBrowserAccessibilityTree(
  page: Awaited<ReturnType<typeof resolveManagedPage>>,
  maxDepth = 8,
  interestingOnly = true,
): Promise<string> {
  const tree = await page.evaluate(({ inputMaxDepth, inputInterestingOnly }: { inputMaxDepth: number; inputInterestingOnly: boolean }) => {
    const interestingRoles = new Set(["button", "link", "textbox", "checkbox", "radio", "combobox", "listbox", "menuitem", "tab", "heading", "img", "navigation", "main", "banner", "contentinfo", "search", "form", "dialog", "alert", "progressbar", "slider"]);
    const inferredTagRoles: Record<string, string> = {
      A: "link",
      BUTTON: "button",
      INPUT: "textbox",
      TEXTAREA: "textbox",
      SELECT: "combobox",
      IMG: "img",
      NAV: "navigation",
      MAIN: "main",
      HEADER: "banner",
      FOOTER: "contentinfo",
      FORM: "form",
      DIALOG: "dialog",
      H1: "heading",
      H2: "heading",
      H3: "heading",
      H4: "heading",
      H5: "heading",
      H6: "heading",
    };
    const interestingTags = ["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "IMG", "NAV", "MAIN", "HEADER", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6"];
    const skippedTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "LINK", "META"]);

    function walk(element: any, depth: number): any {
      if (!element || depth <= 0) {
        return null;
      }

      const tag = element.tagName || "";
      if (skippedTags.has(tag)) {
        return null;
      }

      const explicitRole = element.getAttribute?.("role") || "";
      const role = explicitRole || inferredTagRoles[tag] || "";
      const name = element.getAttribute?.("aria-label")
        || element.getAttribute?.("alt")
        || element.getAttribute?.("title")
        || element.getAttribute?.("placeholder")
        || element.innerText?.slice(0, 80)
        || "";
      const isInteresting = interestingRoles.has(role) || !!explicitRole || interestingTags.includes(tag);

      const children: any[] = [];
      for (let i = 0; i < element.children.length; i += 1) {
        const child = walk(element.children[i], depth - 1);
        if (child) {
          if (Array.isArray(child)) {
            children.push(...child);
          } else {
            children.push(child);
          }
        }
      }

      if (inputInterestingOnly && !isInteresting) {
        return children.length > 0 ? children : null;
      }

      const node: Record<string, unknown> = { tag: tag.toLowerCase() };
      if (role) node.role = role;
      if (name.trim()) node.name = name.trim().slice(0, 80);
      if (tag === "A" && element.href) node.href = element.href;
      if (tag === "INPUT") {
        node.type = element.type;
        node.value = element.value;
      }
      if (element.id) node.id = element.id;
      if (typeof element.className === "string") {
        const className = element.className.trim().slice(0, 60);
        if (className) node.class = className;
      }
      if (element.hasAttribute?.("disabled")) node.disabled = true;
      if (element.getAttribute?.("aria-expanded")) node.expanded = element.getAttribute("aria-expanded") === "true";
      const level = tag.match(/^H(\d)$/);
      if (level) node.level = parseInt(level[1], 10);
      if (children.length > 0) node.children = children;
      return node;
    }

    return walk((globalThis as any).document.body, inputMaxDepth);
  }, { inputMaxDepth: maxDepth, inputInterestingOnly: interestingOnly });

  const text = JSON.stringify(tree, null, 2);
  const nodeCount = (text.match(/"role"/g) || []).length;
  return text.length > 50_000
    ? `Accessibility tree (~${nodeCount} nodes, truncated to 50k chars):\n${text.slice(0, 50_000)}...`
    : `Accessibility tree (~${nodeCount} nodes):\n${text}`;
}

export async function getLocalBrowserAccessibilityTree(maxDepth = 8, interestingOnly = true): Promise<string> {
  return withAttachedBrowser(async ({ page }) => {
    return collectLocalBrowserAccessibilityTree(page, maxDepth, interestingOnly);
  });
}

async function collectLocalBrowserPerfMetrics(page: Awaited<ReturnType<typeof resolveManagedPage>>): Promise<string> {
  const metrics = await page.evaluate(() => {
    const perf = (globalThis as any).performance;
    const nav = perf.getEntriesByType("navigation")[0] as any;
    const paint = perf.getEntriesByType("paint") as any[];
    const lcp = perf.getEntriesByType("largest-contentful-paint") as any[];
    const cls = perf.getEntriesByType("layout-shift") as any[];
    const resources = perf.getEntriesByType("resource") as any[];

    const fcp = paint.find((entry: any) => entry.name === "first-contentful-paint");
    const clsScore = cls.reduce((sum: number, entry: any) => sum + (entry.hadRecentInput ? 0 : (entry.value || 0)), 0);
    const totalTransferSize = resources.reduce((sum: number, resource: any) => sum + (resource.transferSize || 0), 0);
    const resourcesByType: Record<string, number> = {};
    for (const resource of resources) {
      const type = resource.initiatorType || "other";
      resourcesByType[type] = (resourcesByType[type] || 0) + 1;
    }

    return {
      url: (globalThis as any).location.href,
      ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: lcp.length > 0 ? Math.round(lcp[lcp.length - 1].startTime) : null,
      cls: Math.round(clsScore * 1000) / 1000,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
      loadComplete: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
      domNodes: (globalThis as any).document.querySelectorAll("*").length,
      resourceCount: resources.length,
      totalTransferKB: Math.round(totalTransferSize / 1024),
      resourcesByType,
    };
  });

  return [
    `Performance Metrics for ${metrics.url}`,
    "",
    "Core Web Vitals:",
    `  TTFB:  ${metrics.ttfb !== null ? `${metrics.ttfb}ms` : "N/A"}`,
    `  FCP:   ${metrics.fcp !== null ? `${metrics.fcp}ms` : "N/A"}`,
    `  LCP:   ${metrics.lcp !== null ? `${metrics.lcp}ms` : "N/A (measured at page load; may update with lazy content)"}`,
    `  CLS:   ${metrics.cls}`,
    "",
    "Page Load:",
    `  DOM Content Loaded: ${metrics.domContentLoaded}ms`,
    `  Full Load: ${metrics.loadComplete}ms`,
    "",
    "Page Size:",
    `  DOM Nodes: ${metrics.domNodes}`,
    `  Resources: ${metrics.resourceCount}`,
    `  Transfer Size: ${metrics.totalTransferKB}KB`,
    "",
    "Resources by Type:",
    ...Object.entries(metrics.resourcesByType).map(([type, count]) => `  ${type}: ${count}`),
  ].join("\n");
}

export async function getLocalBrowserPerfMetrics(): Promise<string> {
  return withAttachedBrowser(async ({ page }) => {
    return collectLocalBrowserPerfMetrics(page);
  });
}

async function collectLocalBrowserSeoAudit(page: Awaited<ReturnType<typeof resolveManagedPage>>): Promise<string> {
  const seo = await page.evaluate(() => {
    const documentRef = (globalThis as any).document;
    const locationRef = (globalThis as any).location;
    const getMeta = (name: string) => documentRef.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute("content") || null;
    const getAll = (selector: string) => Array.from(documentRef.querySelectorAll(selector));

    const headings: Record<string, string[]> = {};
    for (let i = 1; i <= 6; i += 1) {
      const elements = getAll(`h${i}`);
      if (elements.length > 0) {
        headings[`h${i}`] = elements.map((element: any) => element.textContent?.trim().slice(0, 80) || "").filter(Boolean);
      }
    }

    const images = getAll("img");
    const imagesWithAlt = images.filter((image: any) => image.alt && image.alt.trim());
    const imagesWithoutAlt = images.filter((image: any) => !image.alt || !image.alt.trim()).map((image: any) => image.src?.slice(0, 100));
    const jsonLd = getAll('script[type="application/ld+json"]').map((script: any) => {
      try {
        return JSON.parse(script.textContent || "");
      } catch {
        return null;
      }
    }).filter(Boolean);
    const links = getAll("a[href]");
    const internalLinks = links.filter((link: any) => link.hostname === locationRef.hostname).length;
    const externalLinks = links.length - internalLinks;

    return {
      url: locationRef.href,
      title: documentRef.title || null,
      titleLength: documentRef.title.length,
      metaDescription: getMeta("description"),
      metaDescriptionLength: (getMeta("description") || "").length,
      canonical: documentRef.querySelector('link[rel="canonical"]')?.href || null,
      robots: getMeta("robots"),
      og: {
        title: getMeta("og:title"),
        description: getMeta("og:description"),
        image: getMeta("og:image"),
        type: getMeta("og:type"),
        url: getMeta("og:url"),
        siteName: getMeta("og:site_name"),
      },
      twitter: {
        card: getMeta("twitter:card"),
        title: getMeta("twitter:title"),
        description: getMeta("twitter:description"),
        image: getMeta("twitter:image"),
      },
      headings,
      images: { total: images.length, withAlt: imagesWithAlt.length, missingAlt: imagesWithoutAlt.slice(0, 10) },
      links: { total: links.length, internal: internalLinks, external: externalLinks },
      jsonLd: jsonLd.length > 0 ? jsonLd : null,
      lang: documentRef.documentElement?.lang || null,
      viewport: getMeta("viewport"),
    };
  });

  return [
    `SEO Audit: ${seo.url}`,
    "",
    `Title: ${seo.title || "MISSING"} (${seo.titleLength} chars${seo.titleLength > 60 ? " ⚠️ too long" : seo.titleLength < 30 ? " ⚠️ too short" : " ✓"})`,
    `Description: ${seo.metaDescription?.slice(0, 100) || "MISSING"} (${seo.metaDescriptionLength} chars${seo.metaDescriptionLength > 160 ? " ⚠️ too long" : seo.metaDescriptionLength < 50 ? " ⚠️ too short" : " ✓"})`,
    `Canonical: ${seo.canonical || "MISSING"}`,
    `Robots: ${seo.robots || "not set"}`,
    `Language: ${seo.lang || "MISSING"}`,
    `Viewport: ${seo.viewport || "MISSING"}`,
    "",
    "Open Graph:",
    ...Object.entries(seo.og).map(([key, value]) => `  og:${key}: ${value || "missing"}`),
    "",
    "Twitter Card:",
    ...Object.entries(seo.twitter).map(([key, value]) => `  twitter:${key}: ${value || "missing"}`),
    "",
    "Headings:",
    ...Object.entries(seo.headings).map(([level, texts]) => `  ${level}: ${texts.length} — ${texts.slice(0, 3).join(", ")}`),
    "",
    `Images: ${seo.images.total} total, ${seo.images.withAlt} with alt text${seo.images.total > 0 ? ` (${Math.round((seo.images.withAlt / seo.images.total) * 100)}% coverage)` : ""}`,
    ...(seo.images.missingAlt.length > 0 ? [`  Missing alt: ${seo.images.missingAlt.join(", ")}`] : []),
    "",
    `Links: ${seo.links.total} total (${seo.links.internal} internal, ${seo.links.external} external)`,
    ...(seo.jsonLd ? [`\nStructured Data (JSON-LD):\n${trimOutput(JSON.stringify(seo.jsonLd, null, 2), 2_000, "")}`] : []),
  ].join("\n");
}

export async function getLocalBrowserSeoAudit(): Promise<string> {
  return withAttachedBrowser(async ({ page }) => {
    return collectLocalBrowserSeoAudit(page);
  });
}

export async function manageLocalBrowserCookies(
  action: "get" | "set" | "clear",
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
  }>,
): Promise<string> {
  return withAttachedBrowser(async ({ page }) => {
    const context = page.context();
    if (action === "get") {
      const currentCookies = await context.cookies();
      if (currentCookies.length === 0) {
        return "No cookies set.";
      }
      return `Cookies (${currentCookies.length}):\n\n${currentCookies.map((cookie) => `${cookie.name}=${cookie.value.slice(0, 50)}${cookie.value.length > 50 ? "..." : ""} (domain: ${cookie.domain}, path: ${cookie.path}${cookie.httpOnly ? ", httpOnly" : ""}${cookie.secure ? ", secure" : ""})`).join("\n")}`;
    }

    if (action === "clear") {
      await context.clearCookies();
      return "All cookies cleared.";
    }

    if (!cookies || cookies.length === 0) {
      throw new Error("No cookies were provided. Pass at least one cookie when using the set action.");
    }

    const currentUrl = page.url();
    const domain = currentUrl ? new URL(currentUrl).hostname : undefined;
    await context.addCookies(cookies.map((cookie) => ({
      ...cookie,
      domain: cookie.domain || domain,
      path: cookie.path || "/",
      httpOnly: cookie.httpOnly || false,
      secure: cookie.secure || false,
    })));
    return `Set ${cookies.length} cookie(s). Reload the page for them to take effect.`;
  });
}

export async function manageLocalBrowserStorage(
  action: "get" | "getAll" | "set" | "remove" | "clear",
  storageType: "localStorage" | "sessionStorage" = "localStorage",
  key?: string,
  value?: string,
): Promise<string> {
  return withAttachedBrowser(async ({ page }) => {
    const result = await page.evaluate(({ inputAction, inputStorageType, inputKey, inputValue }) => {
      const storage = (globalThis as any)[inputStorageType] as any;
      if (!storage) {
        throw new Error(`${inputStorageType} is not available on this page.`);
      }

      if (inputAction === "get") {
        if (!inputKey) {
          throw new Error("A key is required for the get action.");
        }
        return storage.getItem(inputKey);
      }

      if (inputAction === "getAll") {
        const entries: Record<string, string> = {};
        for (let index = 0; index < storage.length; index += 1) {
          const entryKey = storage.key(index);
          if (entryKey) {
            entries[entryKey] = storage.getItem(entryKey) || "";
          }
        }
        return entries;
      }

      if (inputAction === "set") {
        if (!inputKey) {
          throw new Error("A key is required for the set action.");
        }
        storage.setItem(inputKey, inputValue || "");
        return true;
      }

      if (inputAction === "remove") {
        if (!inputKey) {
          throw new Error("A key is required for the remove action.");
        }
        storage.removeItem(inputKey);
        return true;
      }

      if (inputAction === "clear") {
        storage.clear();
        return true;
      }

      throw new Error(`Unsupported storage action: ${inputAction}`);
    }, {
      inputAction: action,
      inputStorageType: storageType,
      inputKey: key,
      inputValue: value,
    });

    if (action === "get") {
      return result === null ? `No value found for key: ${key}` : `${key}=${String(result)}`;
    }

    if (action === "getAll") {
      const entries = result as Record<string, string>;
      const keys = Object.keys(entries);
      if (keys.length === 0) {
        return `${storageType} is empty.`;
      }
      return `${storageType} (${keys.length} entries):\n\n${keys.map((entryKey) => `${entryKey}=${trimOutput(entries[entryKey], 200, "...")}`).join("\n")}`;
    }

    if (action === "set") {
      return `Stored ${key} in ${storageType}.`;
    }

    if (action === "remove") {
      return `Removed ${key} from ${storageType}.`;
    }

    return `Cleared ${storageType}.`;
  });
}

export async function exportLocalBrowserEvidenceBundle(label?: string): Promise<{
  bundleDir: string;
  fileCount: number;
  recordingIncluded: boolean;
  recordingPending: boolean;
}> {
  const session = requireLocalBrowserSession();
  const bundleDir = join(getLocalBrowserHomeDir(), "evidence", `${Date.now()}${slugifyEvidenceLabel(label)}`);
  mkdirSync(bundleDir, { recursive: true });

  const writeTextArtifact = async (fileName: string, contents: string) => {
    await writeFile(join(bundleDir, fileName), contents, "utf8");
  };
  const writeJsonArtifact = async (fileName: string, value: unknown) => {
    await writeFile(join(bundleDir, fileName), JSON.stringify(value, null, 2), "utf8");
  };

  await withAttachedBrowser(async ({ page, session: attachedSession }) => {
    const screenshotPath = await saveLocalScreenshot(page);
    copyFileSync(screenshotPath, join(bundleDir, "screenshot.png"));

    const title = await page.title();
    const html = await page.content();
    const visibleText = ((await page.locator("body").innerText().catch(() => "")) || "").trim();
    const cookies = await page.context().cookies();
    const storage = await page.evaluate(() => {
      const readStorage = (storageArea: any) => {
        const entries: Record<string, string> = {};
        if (!storageArea) {
          return entries;
        }
        for (let index = 0; index < storageArea.length; index += 1) {
          const key = storageArea.key(index);
          if (key) {
            entries[key] = storageArea.getItem(key) || "";
          }
        }
        return entries;
      };
      return {
        localStorage: readStorage((globalThis as any).localStorage),
        sessionStorage: readStorage((globalThis as any).sessionStorage),
      };
    });
    const a11y = await collectLocalBrowserAccessibilityTree(page);
    const perf = await collectLocalBrowserPerfMetrics(page);
    const seo = await collectLocalBrowserSeoAudit(page);

    const logs = attachedSession.consoleLogs.slice(-200);
    const errors = attachedSession.networkErrors.slice(-100);
    const requests = attachedSession.networkRequests.slice(-500);
    const consoleLogsText = logs.length === 0
      ? "No console logs captured."
      : `Console logs (${logs.length} entries):\n\n${logs.map((entry) => `[${entry.level.toUpperCase()}] ${entry.text}`).join("\n")}`;
    const networkErrorsText = errors.length === 0
      ? "No failed network requests captured. All observed requests returned 2xx/3xx status codes."
      : `Failed network requests (${errors.length} failed requests):\n\n${errors.map((entry) => `${entry.status} ${entry.statusText} — ${entry.url}`).join("\n")}`;
    const totalSize = requests.reduce((sum, entry) => sum + entry.size, 0);
    const avgDuration = requests.length > 0
      ? Math.round(requests.reduce((sum, entry) => sum + entry.duration, 0) / requests.length)
      : 0;
    const slowest = requests.length > 0
      ? requests.reduce((max, entry) => (entry.duration > max.duration ? entry : max), requests[0])
      : null;
    const networkRequestsText = requests.length === 0
      ? "No matching network requests captured."
      : [
          `Network Requests (${requests.length} captured, ${Math.round(totalSize / 1024)}KB total, avg ${avgDuration}ms)`,
          `Slowest: ${slowest?.duration || 0}ms — ${slowest?.url.slice(0, 80) || "n/a"}`,
          "",
          ...requests.map((entry) => {
            const size = entry.size > 0 ? `${Math.round(entry.size / 1024)}KB` : "0KB";
            return `${entry.status} ${entry.method.padEnd(4)} ${entry.duration.toString().padStart(5)}ms ${size.padStart(6)} [${entry.resourceType}] ${entry.url.slice(0, 100)}`;
          }),
        ].join("\n");

    await writeJsonArtifact("session.json", {
      ...attachedSession,
      title,
      url: page.url(),
      screenshotPath,
    });
    await writeJsonArtifact("console-logs.json", logs);
    await writeJsonArtifact("network-errors.json", errors);
    await writeJsonArtifact("network-requests.json", requests);
    await writeJsonArtifact("cookies.json", cookies);
    await writeJsonArtifact("storage.json", storage);
    await writeTextArtifact("console-logs.txt", consoleLogsText);
    await writeTextArtifact("network-errors.txt", networkErrorsText);
    await writeTextArtifact("network-requests.txt", networkRequestsText);
    await writeTextArtifact("page.html", html);
    await writeTextArtifact("visible-text.txt", visibleText);
    await writeTextArtifact("accessibility-tree.txt", a11y);
    await writeTextArtifact("perf-metrics.txt", perf);
    await writeTextArtifact("seo-audit.txt", seo);
  });

  const refreshedSession = getLocalBrowserSession() ?? session;
  const recordingPath = refreshedSession.recordingPath ?? findRecordingPathInDir(refreshedSession.recordingDir);
  return finalizeLocalBrowserEvidenceBundle(bundleDir, {
    ...refreshedSession,
    recordingPath,
  }, recordingPath);
}

export async function closeLocalBrowser(options?: {
  exportEvidence?: boolean;
  evidenceLabel?: string;
}): Promise<{
  recordingPath?: string;
  evidenceBundleDir?: string;
  evidenceFileCount?: number;
  evidenceRecordingIncluded?: boolean;
  evidenceRecordingPending?: boolean;
}> {
  const session = requireLocalBrowserSession();
  const evidenceResult = options?.exportEvidence
    ? await exportLocalBrowserEvidenceBundle(options.evidenceLabel)
    : undefined;

  if (session.launchMode === "daemon" && session.pid) {
    await requestDaemonShutdown(session).catch(() => {});
    const finalizedSession = session.recordVideo
      ? (await waitForRecordingFinalization(session.sessionId)) ?? getLocalBrowserSession() ?? session
      : session;
    if ((getLocalBrowserSession()?.sessionId ?? finalizedSession.sessionId) === session.sessionId) {
      try {
        process.kill(session.pid, "SIGTERM");
      } catch {
        // noop
      }
    }
    const recordingPath = session.recordVideo
      ? finalizedSession.recordingPath ?? (await waitForRecordingPath(session.sessionId, 2000)) ?? findRecordingPathInDir(finalizedSession.recordingDir)
      : undefined;
    const finalizedEvidence = evidenceResult
      ? await finalizeLocalBrowserEvidenceBundle(evidenceResult.bundleDir, {
          ...finalizedSession,
          recordingPath,
        }, recordingPath)
      : undefined;
    cleanupLocalBrowserSession({
      ...finalizedSession,
      recordingPath,
    }, { terminateProcess: false });
    return {
      recordingPath,
      evidenceBundleDir: finalizedEvidence?.bundleDir,
      evidenceFileCount: finalizedEvidence?.fileCount,
      evidenceRecordingIncluded: finalizedEvidence?.recordingIncluded,
      evidenceRecordingPending: finalizedEvidence?.recordingPending,
    };
  }

  await withAttachedBrowser(async ({ page, session: attachedSession }) => {
    await page.context().close();
    cleanupLocalBrowserSession(attachedSession);
  });

  const finalizedEvidence = evidenceResult
    ? await finalizeLocalBrowserEvidenceBundle(evidenceResult.bundleDir, session)
    : undefined;

  return {
    evidenceBundleDir: finalizedEvidence?.bundleDir,
    evidenceFileCount: finalizedEvidence?.fileCount,
    evidenceRecordingIncluded: finalizedEvidence?.recordingIncluded,
    evidenceRecordingPending: finalizedEvidence?.recordingPending,
  };
}

export async function describeLocalBrowserSession(): Promise<StoredLocalBrowserSession & { title: string }> {
  return withAttachedBrowser(async ({ page, session }) => ({
    ...session,
    title: await page.title(),
  }));
}

export async function exportLocalBrowserHtml(fileName: string, html: string): Promise<string> {
  const htmlDir = join(getLocalBrowserHomeDir(), "html");
  mkdirSync(htmlDir, { recursive: true });
  const filePath = join(htmlDir, fileName);
  await writeFile(filePath, html, "utf8");
  return filePath;
}
