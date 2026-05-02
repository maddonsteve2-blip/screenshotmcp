// deepsyte Chrome Extension — Background Service Worker
// Handles capture, storage, and opens viewer tab

importScripts("storage.js");

const API_URL = "https://deepsyte-api-production.up.railway.app";
const MCP_URL = `${API_URL}/mcp`;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // --- Capture visible viewport ---
  if (msg.action === "captureVisible") {
    handleCaptureVisible(msg).then(sendResponse).catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  // --- Capture full page ---
  if (msg.action === "captureFullPage") {
    handleCaptureFullPage(msg).then(sendResponse).catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  // --- Download screenshot ---
  if (msg.action === "downloadScreenshot") {
    const filename = msg.filename || `screenshot-${Date.now()}.png`;
    chrome.downloads.download({
      url: msg.dataUrl,
      filename: `deepsyte/${filename}`,
      saveAs: false,
    }, (downloadId) => {
      sendResponse({ downloadId });
    });
    return true;
  }

  // --- Get all screenshots (for popup history) ---
  if (msg.action === "getScreenshots") {
    ScreenshotStorage.getAllScreenshots(msg.limit || 20).then(sendResponse).catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  // --- Get single screenshot ---
  if (msg.action === "getScreenshot") {
    ScreenshotStorage.getScreenshot(msg.id).then(sendResponse).catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  // --- Delete screenshot ---
  if (msg.action === "deleteScreenshot") {
    ScreenshotStorage.deleteScreenshot(msg.id).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  // --- Get screenshot count ---
  if (msg.action === "getScreenshotCount") {
    ScreenshotStorage.getScreenshotCount().then((count) => sendResponse({ count })).catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  if (msg.action === "navigateTab") {
    handleNavigateTab(msg).then(sendResponse).catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  if (msg.action === "inspectPageText") {
    inspectCurrentPage("text").then(sendResponse).catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  if (msg.action === "inspectPageHtml") {
    inspectCurrentPage("html").then(sendResponse).catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  // --- Clear all ---
  if (msg.action === "clearAllScreenshots") {
    ScreenshotStorage.clearAllScreenshots().then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  // --- Stitch in offscreen (forwarded from offscreen.js) ---
  if (msg.action === "stitchInOffscreen") {
    // This is handled by the offscreen document, not here
    return false;
  }
});

// ===== CAPTURE VISIBLE =====
async function handleCaptureVisible(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (await shouldUseCloudCapture(tab)) {
    return captureViaCloud(tab, false, msg.openViewer !== false);
  }

  const dataUrl = await captureVisibleTab();

  // Get image dimensions
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();

  // Save to storage
  const record = await ScreenshotStorage.saveScreenshot({
    dataUrl,
    url: tab?.url || "",
    title: tab?.title || "",
    width,
    height,
    type: "viewport",
  });

  // Open viewer if requested
  if (msg.openViewer !== false) {
    chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?id=${record.id}`) });
  }

  return { id: record.id, dataUrl };
}

async function handleNavigateTab(msg) {
  const targetTabId = msg.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!targetTabId) {
    throw new Error("No active tab detected");
  }

  const url = typeof msg.url === "string" ? msg.url.trim() : "";
  if (!url) {
    throw new Error("No URL provided");
  }

  await chrome.tabs.update(targetTabId, { url });
  return { ok: true, url };
}

function captureVisibleTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(dataUrl);
    });
  });
}

// ===== CAPTURE FULL PAGE =====
async function handleCaptureFullPage(msg) {
  const tabId = msg.tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (await shouldUseCloudCapture(tab)) {
    return captureViaCloud(tab, true, msg.openViewer !== false);
  }

  // Get page dimensions
  const [{ result: dims }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      devicePixelRatio: window.devicePixelRatio,
    }),
  });

  const { scrollHeight, viewportHeight } = dims;
  const totalScrolls = Math.ceil(scrollHeight / viewportHeight);
  const captures = [];

  // Scroll to top
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.scrollTo(0, 0),
  });
  await sleep(400);

  for (let i = 0; i < totalScrolls; i++) {
    const scrollY = i * viewportHeight;

    await chrome.scripting.executeScript({
      target: { tabId },
      func: (y) => window.scrollTo(0, y),
      args: [scrollY],
    });
    await sleep(400);

    const dataUrl = await captureVisibleTab();

    captures.push({
      dataUrl,
      scrollY,
      height: Math.min(viewportHeight, scrollHeight - scrollY),
    });
  }

  // Scroll back to top
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.scrollTo(0, 0),
  });

  // Stitch captures
  const stitched = await stitchCaptures(captures, dims);

  // Save to storage
  const record = await ScreenshotStorage.saveScreenshot({
    dataUrl: stitched,
    url: tab?.url || "",
    title: tab?.title || "",
    width: dims.viewportWidth,
    height: scrollHeight,
    type: "fullpage",
  });

  // Open viewer
  if (msg.openViewer !== false) {
    chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?id=${record.id}`) });
  }

  return { id: record.id, dataUrl: stitched, width: dims.viewportWidth, height: scrollHeight };
}

async function shouldUseCloudCapture(tab) {
  if (!tab?.url) {
    return false;
  }

  const { apiKey } = await chrome.storage.sync.get("apiKey");
  if (!apiKey) {
    return false;
  }

  try {
    const url = new URL(tab.url);
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function captureViaCloud(tab, fullPage, openViewer) {
  const { apiKey } = await chrome.storage.sync.get("apiKey");
  if (!apiKey) {
    throw new Error("No saved API key");
  }

  const response = await callMcpTool(apiKey, "take_screenshot", {
    url: tab?.url || "",
    width: 1280,
    height: 800,
    fullPage,
    format: "png",
    delay: 0,
  });

  const payloadUrl = extractImageUrl(response);
  if (!payloadUrl) {
    throw new Error(extractText(response) || "Cloud capture did not return an image URL");
  }

  const imageResponse = await fetch(payloadUrl);
  if (!imageResponse.ok) {
    throw new Error("Cloud capture image could not be downloaded");
  }

  const blob = await imageResponse.blob();
  const dataUrl = await blobToDataUrl(blob);
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();

  const record = await ScreenshotStorage.saveScreenshot({
    dataUrl,
    url: tab?.url || "",
    title: tab?.title || "",
    width,
    height,
    type: fullPage ? "fullpage" : "viewport",
    cloudUrl: payloadUrl,
  });

  if (openViewer) {
    chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?id=${record.id}`) });
  }

  return { id: record.id, dataUrl, width, height, cloudUrl: payloadUrl, source: "platform-mcp" };
}

async function inspectCurrentPage(kind) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab detected");
  }

  if (await shouldUseCloudCapture(tab)) {
    const result = await inspectViaPlatform(tab.url, kind);
    return { ...result, source: "platform-mcp" };
  }

  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (mode) => {
      const maxChars = 50000;
      const raw = mode === "html"
        ? document.documentElement.outerHTML
        : (document.body?.innerText || document.documentElement.innerText || "").trim();
      const truncated = raw.length > maxChars ? `${raw.slice(0, maxChars)}\n\n[truncated locally after ${maxChars} chars]` : raw;
      return truncated;
    },
    args: [kind],
  });

  const output = result?.[0]?.result || "";
  return {
    kind,
    content: output,
    title: tab.title || "",
    url: tab.url || "",
    source: "local-dom",
  };
}

async function inspectViaPlatform(url, kind) {
  const { apiKey } = await chrome.storage.sync.get("apiKey");
  if (!apiKey) {
    throw new Error("No saved API key");
  }

  const sessionId = await startMcpBrowserSession(apiKey, url);
  try {
    const response = kind === "html"
      ? await callMcpTool(apiKey, "browser_get_html", { sessionId, outer: true })
      : await callMcpTool(apiKey, "browser_get_text", { sessionId });

    const text = truncateText(extractText(response), 50000);
    return { kind, content: text, url };
  } finally {
    await callMcpTool(apiKey, "browser_close", { sessionId }).catch(() => {});
  }
}

async function startMcpBrowserSession(apiKey, url) {
  const response = await callMcpTool(apiKey, "browser_navigate", { url, width: 1280, height: 800 });
  const text = extractText(response);
  const match = text.match(/Session ID:\s*(\S+)/i);
  if (!match) {
    throw new Error(text || "Failed to start browser session");
  }
  return match[1];
}

async function initializeMcpSession(apiKey) {
  const initRes = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "deepsyte-chrome-extension", version: "1.1.0" },
      },
    }),
  });

  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`MCP initialize failed (${initRes.status}): ${text}`);
  }

  await initRes.text();
  return initRes.headers.get("mcp-session-id") || "";
}

async function callMcpTool(apiKey, toolName, args = {}) {
  const sessionId = await initializeMcpSession(apiKey);
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${apiKey}`,
  };

  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  const toolRes = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!toolRes.ok) {
    const text = await toolRes.text();
    throw new Error(`Tool call failed (${toolRes.status}): ${text}`);
  }

  const body = await toolRes.text();
  return parseSseResponse(body);
}

function parseSseResponse(body) {
  const lines = body.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        // continue
      }
    }
  }

  try {
    return JSON.parse(body);
  } catch {
    return { error: { message: `Unexpected response: ${body.slice(0, 200)}` } };
  }
}

function extractText(response) {
  if (response?.error?.message) {
    return `Error: ${response.error.message}`;
  }

  const content = response?.result?.content || [];
  return content
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text)
    .join("\n");
}

function extractImageUrl(response) {
  const text = extractText(response);
  const match = text.match(/https?:\/\/[^\s"]+\.(png|jpg|jpeg|webp|gif|pdf)/i);
  return match ? match[0] : null;
}

function truncateText(text, maxChars) {
  if (!text || text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n[truncated after ${maxChars} chars]`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Failed to read image blob"));
    reader.readAsDataURL(blob);
  });
}

// ===== STITCH =====
async function stitchCaptures(captures, dims) {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (!existingContexts.length) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["DOM_SCRAPING"],
      justification: "Stitching full-page screenshot from multiple viewport captures using canvas",
    });
  }

  const result = await chrome.runtime.sendMessage({
    action: "stitchInOffscreen",
    captures,
    dims,
  });

  return result.dataUrl;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ===== KEYBOARD SHORTCUT =====
chrome.commands?.onCommand?.addListener((command) => {
  if (command === "capture-full-page") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) handleCaptureFullPage({ tabId: tab.id });
    });
  }
  if (command === "capture-viewport") {
    handleCaptureVisible({});
  }
});

// ===== CONTEXT MENU =====
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "capture-viewport",
    title: "Capture screenshot",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "capture-fullpage",
    title: "Capture full page screenshot",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "capture-viewport") {
    handleCaptureVisible({});
  } else if (info.menuItemId === "capture-fullpage") {
    handleCaptureFullPage({ tabId: tab.id });
  }
});
