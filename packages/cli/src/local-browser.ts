import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { createServer } from "net";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type {
  LocalBrowserLaunchRequest,
  LocalBrowserLaunchResult,
  LocalBrowserName,
  LocalBrowserPermissionPrompt,
} from "@deepsyte/types";
import { getConfigPath } from "./config.js";

export interface ResolvedLocalBrowser {
  browser: Exclude<LocalBrowserName, "auto">;
  executablePath: string;
}

const WINDOWS_BROWSER_PATHS: Record<Exclude<LocalBrowserName, "auto">, string[]> = {
  chrome: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ],
  edge: [
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ],
  chromium: [
    "C:\\Program Files\\Chromium\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe",
    join(process.env.LOCALAPPDATA || "", "Chromium", "Application", "chrome.exe"),
  ],
};

const MAC_BROWSER_PATHS: Record<Exclude<LocalBrowserName, "auto">, string[]> = {
  chrome: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  edge: ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
  chromium: ["/Applications/Chromium.app/Contents/MacOS/Chromium"],
};

const LINUX_BROWSER_PATHS: Record<Exclude<LocalBrowserName, "auto">, string[]> = {
  chrome: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
  ],
  edge: ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable"],
  chromium: ["/usr/bin/chromium", "/usr/bin/chromium-browser"],
};

function getBrowserSearchOrder(browser: LocalBrowserName): Exclude<LocalBrowserName, "auto">[] {
  if (browser === "auto") {
    return ["chrome", "edge", "chromium"];
  }

  return [browser];
}

function getCandidatePaths(browser: Exclude<LocalBrowserName, "auto">): string[] {
  switch (process.platform) {
    case "win32":
      return WINDOWS_BROWSER_PATHS[browser];
    case "darwin":
      return MAC_BROWSER_PATHS[browser];
    default:
      return LINUX_BROWSER_PATHS[browser];
  }
}

export function isLocalBrowserName(value: string): value is LocalBrowserName {
  return value === "auto" || value === "chrome" || value === "edge" || value === "chromium";
}

export function resolveLocalBrowser(browser: LocalBrowserName): ResolvedLocalBrowser | null {
  for (const candidate of getBrowserSearchOrder(browser)) {
    const match = getCandidatePaths(candidate).find((candidatePath) => candidatePath && existsSync(candidatePath));
    if (match) {
      return {
        browser: candidate,
        executablePath: match,
      };
    }
  }

  return null;
}

function getLocalBrowserBaseDir(): string {
  return join(dirname(getConfigPath()), "local-browser");
}

export function getLocalBrowserProfileDir(browser: Exclude<LocalBrowserName, "auto">): string {
  return join(getLocalBrowserBaseDir(), browser, "profile");
}

function createManagedProfileDir(browser: Exclude<LocalBrowserName, "auto">): string {
  return join(getLocalBrowserBaseDir(), browser, "sessions", `${Date.now()}`);
}

function createManagedRecordingDir(): string {
  return join(getLocalBrowserBaseDir(), "recordings", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function getLocalBrowserDaemonPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "local-browser-daemon.js");
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a local debugging port.")));
        return;
      }

      const { port } = address;
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve(port);
      });
    });
  });
}

export function createLocalBrowserPermissionPrompt(
  request: LocalBrowserLaunchRequest,
  resolved: ResolvedLocalBrowser,
): LocalBrowserPermissionPrompt {
  const browserBaseDir = join(getLocalBrowserBaseDir(), resolved.browser, "sessions");
  const details = [
    `Browser: ${resolved.browser}`,
    `Executable: ${resolved.executablePath}`,
    `Profile: A fresh isolated DeepSyte profile will be created under ${browserBaseDir}`,
    `Data access: Pages you open in this managed browser can be read and interacted with during the approved session.`,
    "Observability: Console logs and network activity are captured continuously while the managed browser stays open.",
    request.url ? `Start URL: ${request.url}` : "Start URL: about:blank",
  ];

  if (request.recordVideo) {
    details.push("Recording: A local .webm video of the managed browser session will be saved when the browser is closed.");
  }

  return {
    title: "Local browser access required",
    reason: request.reason,
    permissionLevel: request.permissionLevel,
    details,
  };
}

export async function launchLocalBrowser(
  request: LocalBrowserLaunchRequest,
  resolvedInput?: ResolvedLocalBrowser,
  sessionId?: string,
): Promise<LocalBrowserLaunchResult> {
  const resolved = resolvedInput ?? resolveLocalBrowser(request.browser);
  if (!resolved) {
    throw new Error(
      "No compatible local browser installation was found. Install Chrome, Edge, or Chromium, or wait for the managed Chromium bootstrap flow.",
    );
  }

  const userDataDir = createManagedProfileDir(resolved.browser);
  mkdirSync(userDataDir, { recursive: true });

  const debugPort = await getAvailablePort();

  const recordingDir = request.recordVideo ? createManagedRecordingDir() : undefined;
  if (recordingDir) {
    mkdirSync(recordingDir, { recursive: true });
  }

  const daemonConfigPath = join(userDataDir, "daemon-config.json");
  writeFileSync(daemonConfigPath, JSON.stringify({
    sessionId,
    browser: resolved.browser,
    executablePath: resolved.executablePath,
    userDataDir,
    debugPort,
    url: request.url,
    headless: request.headless,
    recordVideo: !!request.recordVideo,
    recordingDir,
  }, null, 2), "utf8");

  const daemon = spawn(process.execPath, [getLocalBrowserDaemonPath(), daemonConfigPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  daemon.unref();

  return {
    browser: resolved.browser,
    executablePath: resolved.executablePath,
    userDataDir,
    debugPort,
    pid: daemon.pid ?? null,
    url: request.url,
    recordVideo: !!request.recordVideo,
    recordingDir,
    launchMode: "daemon",
  };
}

export function getLocalBrowserInstallHelp(): string[] {
  if (process.platform === "win32") {
    return [
      "Install Google Chrome, Microsoft Edge, or Chromium and rerun the command.",
      "If you already have one installed, make sure it is installed for the current user or in the default application path.",
    ];
  }

  if (process.platform === "darwin") {
    return [
      "Install Google Chrome, Microsoft Edge, or Chromium into /Applications and rerun the command.",
      "If your browser is installed elsewhere, support for custom executable paths should be added next.",
    ];
  }

  return [
    "Install google-chrome, microsoft-edge, or chromium and rerun the command.",
    "If your browser binary is installed in a non-standard path, support for custom executable paths should be added next.",
  ];
}

export function getLocalBrowserDefaultReason(url?: string): string {
  if (url) {
    return `Launch a local browser with an isolated DeepSyte profile to test ${url} with human-like realism.`;
  }

  return "Launch a local browser with an isolated DeepSyte profile for human-like website testing.";
}

export function getLocalBrowserHomeDir(): string {
  return join(homedir(), ".config", "deepsyte", "local-browser");
}
