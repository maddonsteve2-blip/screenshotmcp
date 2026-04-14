const $ = (id) => document.getElementById(id);
let activeTabId = null;
const WEB_URL = "https://web-phi-eight-56.vercel.app";
const API_URL = "https://screenshotsmcp-api-production.up.railway.app";

// ===== INIT =====
async function init() {
  detectActiveTab();
  loadHistory();
  loadScreenshotCount();
  loadSettings();
}

// ===== TAB DETECTION =====
function detectActiveTab() {
  const forcedTabId = getForcedTabId();
  if (forcedTabId) {
    chrome.tabs.get(forcedTabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        showTabError("No active tab detected");
        return;
      }
      applyTabState(tab);
    });
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) {
      showTabError("No active tab detected");
      return;
    }

    applyTabState(tab);
  });
}

function applyTabState(tab) {
  activeTabId = tab.id;
  $("tabUrl").textContent = tab.url;
  $("tabUrl").title = tab.url;
  $("tabTitle").textContent = tab.title || "";
  $("navigateUrl").value = tab.url || "";

  if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("about:")) {
    showTabError("Can't capture browser internal pages. Navigate to a website first.");
    disableButtons(true);
  }
}

function getForcedTabId() {
  const tabId = new URLSearchParams(window.location.search).get("tabId");
  if (!tabId) {
    return 0;
  }
  const parsed = parseInt(tabId, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function showTabError(msg) {
  $("tabInfo").classList.add("error");
  $("tabUrl").textContent = msg;
  $("tabTitle").textContent = "";
}

// ===== CAPTURE =====
$("captureVisible").addEventListener("click", () => {
  setStatus("capturing", "Capturing screenshot...");
  disableButtons(true);

  chrome.runtime.sendMessage({ action: "captureVisible" }, (res) => {
    disableButtons(false);
    if (res?.error) {
      setStatus("error", `Error: ${res.error}`);
      return;
    }
    setStatus("success", "Opened in viewer tab!");
    loadHistory();
    loadScreenshotCount();
    // Popup auto-closes when viewer tab opens
  });
});

$("navigateGo").addEventListener("click", () => navigateActiveTab());
$("navigateUrl").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    navigateActiveTab();
  }
});

$("inspectText").addEventListener("click", () => inspectPage("inspectPageText", "Visible text"));
$("inspectHtml").addEventListener("click", () => inspectPage("inspectPageHtml", "DOM HTML"));
$("inspectCopy").addEventListener("click", async () => {
  const content = $("inspectOutput").textContent || "";
  if (!content) return;
  await navigator.clipboard.writeText(content);
  setStatus("success", "Copied page output");
});

$("captureFullPage").addEventListener("click", () => {
  if (!activeTabId) {
    setStatus("error", "No active tab detected");
    return;
  }
  setStatus("capturing", "Capturing full page screenshot...");
  disableButtons(true);

  chrome.runtime.sendMessage({ action: "captureFullPage", tabId: activeTabId }, (res) => {
    disableButtons(false);
    if (res?.error) {
      setStatus("error", `Error: ${res.error}`);
      return;
    }
    setStatus("success", "Opened in viewer tab!");
    loadHistory();
    loadScreenshotCount();
  });
});

// ===== HISTORY =====
function loadHistory() {
  chrome.runtime.sendMessage({ action: "getScreenshots", limit: 9 }, (screenshots) => {
    const grid = $("historyGrid");
    const empty = $("historyEmpty");

    if (!screenshots || screenshots.error || screenshots.length === 0) {
      empty.style.display = "block";
      // Remove any existing items
      grid.querySelectorAll(".history-item").forEach((el) => el.remove());
      return;
    }

    empty.style.display = "none";
    // Remove old items
    grid.querySelectorAll(".history-item").forEach((el) => el.remove());

    for (const ss of screenshots) {
      const item = document.createElement("div");
      item.className = "history-item";
      item.title = `${ss.title || ss.url}\n${new Date(ss.timestamp).toLocaleString()}`;
      item.innerHTML = `
        <img src="${ss.thumbnail || ""}" alt="" />
        <span class="history-badge">${ss.type === "fullpage" ? "Full" : "Shot"}</span>
      `;
      item.addEventListener("click", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?id=${ss.id}`) });
      });
      grid.appendChild(item);
    }
  });
}

function loadScreenshotCount() {
  chrome.runtime.sendMessage({ action: "getScreenshotCount" }, (res) => {
    if (res && !res.error) {
      $("screenshotCount").textContent = res.count;
    }
  });
}

function navigateActiveTab() {
  if (!activeTabId) {
    setStatus("error", "No active tab detected");
    return;
  }

  const rawUrl = $("navigateUrl").value.trim();
  const normalizedUrl = normalizeNavigateUrl(rawUrl);
  if (!normalizedUrl) {
    setStatus("error", "Enter a valid URL to navigate");
    return;
  }

  setStatus("capturing", `Opening ${normalizedUrl}...`);
  chrome.runtime.sendMessage({ action: "navigateTab", tabId: activeTabId, url: normalizedUrl }, (res) => {
    if (res?.error) {
      setStatus("error", res.error);
      return;
    }
    window.close();
  });
}

function normalizeNavigateUrl(rawUrl) {
  if (!rawUrl) {
    return "";
  }

  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function inspectPage(action, label) {
  if (!activeTabId) {
    setStatus("error", "No active tab detected");
    return;
  }

  setStatus("capturing", `Reading ${label.toLowerCase()}...`);
  disableButtons(true);

  chrome.runtime.sendMessage({ action }, (res) => {
    disableButtons(false);
    if (res?.error) {
      setStatus("error", `Error: ${res.error}`);
      return;
    }

    $("inspectPanel").style.display = "block";
    $("inspectTitle").textContent = label;
    $("inspectMeta").textContent = `${res?.source === "platform-mcp" ? "Via ScreenshotsMCP Playwright" : "Via local DOM access"} • ${res?.url || $("tabUrl").textContent}`;
    $("inspectOutput").textContent = res?.content || "";
    setStatus("success", `${label} loaded`);
  });
}

$("clearHistory").addEventListener("click", () => {
  if (!confirm("Delete all saved screenshots?")) return;
  chrome.runtime.sendMessage({ action: "clearAllScreenshots" }, () => {
    loadHistory();
    loadScreenshotCount();
    setStatus("success", "All screenshots cleared");
  });
});

// ===== SETTINGS =====
$("settingsBtn").addEventListener("click", () => {
  $("settingsPanel").style.display = "block";
});

$("settingsClose").addEventListener("click", () => {
  $("settingsPanel").style.display = "none";
});

$("signInBtn").addEventListener("click", () => {
  chrome.tabs.create({
    url: `${WEB_URL}/sign-in?redirect_url=${encodeURIComponent(`${WEB_URL}/dashboard/keys`)}`,
  });
});

$("syncAccountBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: `${WEB_URL}/dashboard/keys` });
  setStatus("success", "Opened your key page. Copy your existing key and paste it here to keep using the same key.");
});

$("openKeysBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: `${WEB_URL}/dashboard/keys` });
});

$("clearSavedKeyBtn").addEventListener("click", () => {
  chrome.storage.sync.remove("apiKey", () => {
    $("settingApiKey").value = "";
    updateAuthState("");
    setStatus("success", "Saved key cleared");
  });
});

$("settingSave").addEventListener("click", async () => {
  const enteredApiKey = $("settingApiKey").value.trim();
  const autoOpen = $("settingAutoOpen").checked;
  chrome.storage.sync.get(["apiKey"], async (data) => {
    const apiKey = enteredApiKey || data.apiKey || "";

    if (enteredApiKey) {
      setStatus("capturing", "Checking API key...");
      const validation = await validateApiKey(enteredApiKey);
      if (!validation.ok) {
        updateAuthState(enteredApiKey, { ok: false });
        setStatus("error", validation.error);
        return;
      }
    }

    chrome.storage.sync.set({ apiKey, autoOpen }, () => {
      updateAuthState(apiKey, apiKey ? { ok: true } : undefined);
      setStatus("success", enteredApiKey ? "Preferences saved" : "Preferences saved • existing key kept");
      $("settingsPanel").style.display = "none";
    });
  });
});

function loadSettings() {
  chrome.storage.sync.get(["apiKey", "autoOpen"], (data) => {
    if (data.apiKey) $("settingApiKey").value = data.apiKey;
    if (data.autoOpen !== undefined) $("settingAutoOpen").checked = data.autoOpen;
    updateAuthState(data.apiKey || "");
  });
}

async function validateApiKey(apiKey) {
  if (!apiKey.startsWith("sk_live_")) {
    return { ok: false, error: "Paste a valid ScreenshotsMCP API key." };
  }

  try {
    const res = await fetch(`${API_URL}/v1/screenshot/__extension_key_check__`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (res.status === 401) {
      return { ok: false, error: "That API key was rejected. Open your ScreenshotsMCP key page and paste the current active key." };
    }

    if (res.status === 404 || res.ok) {
      return { ok: true };
    }

    return { ok: false, error: "Could not verify that API key right now. Try again in a moment." };
  } catch {
    return { ok: false, error: "Could not reach ScreenshotsMCP to verify that key." };
  }
}

async function updateAuthState(apiKey, validationOverride) {
  const hasKey = Boolean(apiKey);

  if (!hasKey) {
    $("authBadge").textContent = "Needs key";
    $("authStatus").textContent = "No saved API key yet.";
    $("authNote").textContent = "If you already have an active key, paste that same key once below to keep using it here too.";
    return;
  }

  $("authBadge").textContent = "Checking...";
  $("authStatus").textContent = `Checking saved key ${maskApiKey(apiKey)}.`;
  $("authNote").textContent = "Verifying that your saved key still works with ScreenshotsMCP.";

  const validation = validationOverride ?? await validateApiKey(apiKey);
  if (!validation.ok) {
    $("authBadge").textContent = "Invalid key";
    $("authStatus").textContent = `Saved key ${maskApiKey(apiKey)} is no longer accepted.`;
    $("authNote").textContent = "Open your ScreenshotsMCP key page and paste the current active key here.";
    return;
  }

  $("authBadge").textContent = "Saved key";
  $("authStatus").textContent = `Using saved key ${maskApiKey(apiKey)}.`;
  $("authNote").textContent = "This extension will keep using your saved key until you explicitly replace or clear it.";
}

function maskApiKey(apiKey) {
  if (!apiKey) return "";
  if (apiKey.length <= 16) return apiKey;
  return `${apiKey.slice(0, 12)}...${apiKey.slice(-4)}`;
}

// ===== HELPERS =====
function setStatus(type, text) {
  const el = $("status");
  el.className = `status ${type}`;
  if (type === "capturing") {
    el.innerHTML = `<span class="spinner"></span>${text}`;
  } else {
    el.textContent = text;
    if (type === "success") {
      setTimeout(() => { el.textContent = ""; el.className = "status"; }, 3000);
    }
  }
}

function disableButtons(disabled) {
  $("captureVisible").disabled = disabled;
  $("captureFullPage").disabled = disabled;
  $("inspectText").disabled = disabled;
  $("inspectHtml").disabled = disabled;
}

// ===== START =====
init();
