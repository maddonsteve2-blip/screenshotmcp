import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const extensionDir = path.join(repoRoot, "packages", "chrome-extension");
const baseUrl = process.env.CHROME_EXTENSION_E2E_BASE_URL || "http://localhost:3456";
const publicUrl = process.env.CHROME_EXTENSION_E2E_PUBLIC_URL || "https://example.com";
const navigateUrl = process.env.CHROME_EXTENSION_E2E_NAV_URL || "https://www.google.com";
const runPublicChecks = process.env.CHROME_EXTENSION_E2E_SKIP_PUBLIC !== "1";

async function resolveApiKey() {
  if (process.env.deepsyte_API_KEY?.trim()) {
    return process.env.deepsyte_API_KEY.trim();
  }

  const configPath = path.join(os.homedir(), ".config", "deepsyte", "config.json");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";
  } catch {
    return "";
  }
}

async function getServiceWorker(context) {
  const existing = context.serviceWorkers();
  if (existing.length > 0) {
    return existing[0];
  }
  return context.waitForEvent("serviceworker", { timeout: 15000 });
}

async function sendExtensionMessage(context, action, payload = {}, options = {}) {
  const serviceWorker = await getServiceWorker(context);
  return serviceWorker.evaluate(async ({ actionName, actionPayload, includeActiveTabId }) => {
    if (actionName === "inspectPageText") {
      return await globalThis.inspectCurrentPage("text");
    }

    if (actionName === "inspectPageHtml") {
      return await globalThis.inspectCurrentPage("html");
    }

    if (actionName === "captureVisible") {
      return await globalThis.handleCaptureVisible(actionPayload);
    }

    if (actionName === "captureFullPage") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return await globalThis.handleCaptureFullPage({
        ...actionPayload,
        tabId: includeActiveTabId ? tab?.id : actionPayload.tabId,
      });
    }

    throw new Error(`Unsupported action ${actionName}`);
  }, {
    actionName: action,
    actionPayload: payload,
    includeActiveTabId: Boolean(options.includeActiveTabId),
  });
}

async function setExtensionStorage(context, values) {
  const serviceWorker = await getServiceWorker(context);
  return serviceWorker.evaluate(
    async (storageValues) => {
      await new Promise((resolve) => chrome.storage.sync.set(storageValues, resolve));
      return true;
    },
    values,
  );
}

async function clearScreenshots(context) {
  const serviceWorker = await getServiceWorker(context);
  return serviceWorker.evaluate(async () => {
    await globalThis.ScreenshotStorage.clearAllScreenshots();
    return true;
  });
}

async function getScreenshotCount(context) {
  const serviceWorker = await getServiceWorker(context);
  return serviceWorker.evaluate(async () => {
    return await globalThis.ScreenshotStorage.getScreenshotCount();
  });
}

async function getExtensionId(context) {
  const serviceWorker = await getServiceWorker(context);
  return new URL(serviceWorker.url()).host;
}

async function getActiveTabInfo(context) {
  const serviceWorker = await getServiceWorker(context);
  return serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ? { id: tab.id, url: tab.url || "" } : { id: 0, url: "" };
  });
}

async function openPopupPage(context, options = {}) {
  const extensionId = await getExtensionId(context);
  const popupPage = await context.newPage();
  const query = options.tabId ? `?tabId=${encodeURIComponent(String(options.tabId))}` : "";
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html${query}`, { waitUntil: "domcontentloaded" });
  return popupPage;
}

async function configureApiKeyViaPopup(context, apiKey) {
  const popupPage = await openPopupPage(context);
  await popupPage.locator("#settingsBtn").click();
  await popupPage.locator("#settingApiKey").fill(apiKey);
  await popupPage.locator("#settingSave").click();
  await popupPage.waitForFunction(() => {
    const badge = document.getElementById("authBadge");
    return badge && /saved key/i.test(badge.textContent || "");
  });
  await popupPage.close();
}

async function navigateViaPopup(context, url, targetPage) {
  await targetPage.bringToFront();
  const activeTab = await getActiveTabInfo(context);
  const popupPage = await openPopupPage(context, { tabId: activeTab.id });
  await popupPage.waitForFunction((expectedUrl) => {
    const input = document.getElementById("navigateUrl");
    return input && typeof input.value === "string" && input.value === expectedUrl;
  }, activeTab.url || targetPage.url());
  await popupPage.locator("#navigateUrl").fill(url);
  await Promise.all([
    targetPage.waitForURL((nextUrl) => {
      try {
        return new URL(nextUrl).hostname.endsWith("google.com");
      } catch {
        return false;
      }
    }, { timeout: 30000 }),
    popupPage.locator("#navigateGo").click(),
  ]);
}

async function openPage(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.bringToFront();
  return page;
}

function logStep(message) {
  console.log(`\n[chrome-extension-e2e] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const apiKey = await resolveApiKey();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "deepsyte-extension-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  });

  try {
    await getServiceWorker(context);
    await setExtensionStorage(context, { autoOpen: false });
    await clearScreenshots(context);

    if (apiKey) {
      logStep("Configuring extension API key through popup UI");
      await configureApiKeyViaPopup(context, apiKey);
    } else {
      logStep("No deepsyte API key found; public-page checks will be skipped");
    }

    logStep(`Opening localhost page ${baseUrl}`);
    const localPage = await openPage(context, baseUrl);

    logStep(`Navigating active tab to ${navigateUrl} via popup UI`);
    await navigateViaPopup(context, navigateUrl, localPage);
    assert.ok(localPage.url().includes("google."), `Expected Google URL, got ${localPage.url()}`);

    logStep(`Returning active tab to localhost page ${baseUrl}`);
    await localPage.goto(baseUrl, { waitUntil: "load", timeout: 30000 });
    await localPage.bringToFront();

    logStep("Checking localhost text inspection fallback");
    const localText = await sendExtensionMessage(context, "inspectPageText");
    assert.equal(localText?.source, "local-dom");
    assert.equal(typeof localText?.content, "string");
    assert.ok(localText.content.length > 0);

    logStep("Checking localhost DOM inspection fallback");
    const localHtml = await sendExtensionMessage(context, "inspectPageHtml");
    assert.equal(localHtml?.source, "local-dom");
    assert.equal(typeof localHtml?.content, "string");
    assert.ok(/html/i.test(localHtml.content));

    logStep("Checking localhost viewport capture");
    const visibleCapture = await sendExtensionMessage(context, "captureVisible", { openViewer: false });
    assert.ok(!visibleCapture?.error, visibleCapture?.error || "captureVisible failed");
    assert.ok(typeof visibleCapture?.id === "string");

    await sleep(1200);

    logStep("Checking localhost full-page capture");
    const fullPageCapture = await sendExtensionMessage(
      context,
      "captureFullPage",
      { openViewer: false },
      { includeActiveTabId: true },
    );
    assert.ok(!fullPageCapture?.error, fullPageCapture?.error || "captureFullPage failed");
    assert.ok(typeof fullPageCapture?.id === "string");

    const localCount = await getScreenshotCount(context);
    assert.ok(localCount >= 2, `Expected at least 2 local screenshots, got ${localCount}`);

    await localPage.close();

    if (apiKey && runPublicChecks) {
      logStep(`Opening public page ${publicUrl}`);
      const remotePage = await openPage(context, publicUrl);

      logStep("Checking public text inspection via platform MCP");
      const publicText = await sendExtensionMessage(context, "inspectPageText");
      assert.equal(publicText?.source, "platform-mcp");
      assert.equal(typeof publicText?.content, "string");
      assert.ok(publicText.content.length > 0);

      logStep("Checking public viewport capture via platform MCP");
      const publicCapture = await sendExtensionMessage(context, "captureVisible", { openViewer: false });
      assert.ok(!publicCapture?.error, publicCapture?.error || "public captureVisible failed");
      assert.equal(publicCapture?.source, "platform-mcp");
      assert.ok(typeof publicCapture?.cloudUrl === "string");
      assert.ok(publicCapture.cloudUrl.startsWith("http"));

      await remotePage.close();
    }

    console.log("\n[chrome-extension-e2e] PASS");
  } finally {
    await context.close().catch(() => {});
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error("\n[chrome-extension-e2e] FAIL");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
