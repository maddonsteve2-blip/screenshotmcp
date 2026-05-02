import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { dirname, join } from "path";
import type { LocalBrowserName } from "@deepsyte/types";
import { getLocalBrowserHomeDir } from "./local-browser.js";

export interface LocalBrowserConsoleEntry {
  level: "error" | "warning" | "log" | "exception";
  text: string;
  ts: number;
}

export interface LocalBrowserNetworkErrorEntry {
  url: string;
  status: number;
  statusText: string;
  ts: number;
}

export interface LocalBrowserNetworkRequestEntry {
  url: string;
  method: string;
  status: number;
  statusText: string;
  resourceType: string;
  duration: number;
  size: number;
  ts: number;
}

export interface LocalBrowserRecordingSegment {
  path: string;
  pageUrl?: string;
  status: "starting" | "ready" | "complete" | "empty" | "failed";
  frameCount: number;
  startedAt: string;
  firstFrameAt?: string;
  lastFrameAt?: string;
  stoppedAt?: string;
  sizeBytes?: number;
}

export interface StoredLocalBrowserSession {
  sessionId: string;
  browser: Exclude<LocalBrowserName, "auto">;
  executablePath: string;
  userDataDir: string;
  debugPort: number;
  pid: number | null;
  url?: string;
  permissionLevel: "control-local-browser";
  launchMode?: "spawn" | "daemon";
  recordVideo?: boolean;
  recordingDir?: string;
  recordingPath?: string;
  recordingSegments: LocalBrowserRecordingSegment[];
  consoleLogs: LocalBrowserConsoleEntry[];
  networkErrors: LocalBrowserNetworkErrorEntry[];
  networkRequests: LocalBrowserNetworkRequestEntry[];
  createdAt: string;
  updatedAt: string;
}

function getLocalBrowserSessionFilePath(): string {
  return join(getLocalBrowserHomeDir(), "session.json");
}

function getLocalBrowserSessionLockPath(): string {
  return join(getLocalBrowserHomeDir(), "session.lock.json");
}

function ensureLocalBrowserSessionDir(): void {
  mkdirSync(dirname(getLocalBrowserSessionFilePath()), { recursive: true });
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLocalBrowserSession(session: Partial<StoredLocalBrowserSession>): StoredLocalBrowserSession {
  return {
    sessionId: session.sessionId || randomUUID(),
    browser: session.browser as Exclude<LocalBrowserName, "auto">,
    executablePath: session.executablePath || "",
    userDataDir: session.userDataDir || "",
    debugPort: session.debugPort || 0,
    pid: session.pid ?? null,
    url: session.url,
    permissionLevel: session.permissionLevel || "control-local-browser",
    launchMode: session.launchMode || "spawn",
    recordVideo: session.recordVideo || false,
    recordingDir: session.recordingDir,
    recordingPath: session.recordingPath,
    recordingSegments: Array.isArray(session.recordingSegments) ? session.recordingSegments : [],
    consoleLogs: Array.isArray(session.consoleLogs) ? session.consoleLogs : [],
    networkErrors: Array.isArray(session.networkErrors) ? session.networkErrors : [],
    networkRequests: Array.isArray(session.networkRequests) ? session.networkRequests : [],
    createdAt: session.createdAt || new Date().toISOString(),
    updatedAt: session.updatedAt || new Date().toISOString(),
  };
}

export function getLocalBrowserSession(): StoredLocalBrowserSession | null {
  const filePath = getLocalBrowserSessionFilePath();
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return normalizeLocalBrowserSession(JSON.parse(readFileSync(filePath, "utf8")) as Partial<StoredLocalBrowserSession>);
  } catch {
    return null;
  }
}

export function saveLocalBrowserSession(
  session: Omit<StoredLocalBrowserSession, "createdAt" | "updatedAt" | "consoleLogs" | "networkErrors" | "networkRequests"> & Partial<Pick<StoredLocalBrowserSession, "createdAt" | "updatedAt" | "consoleLogs" | "networkErrors" | "networkRequests">>,
): StoredLocalBrowserSession {
  ensureLocalBrowserSessionDir();
  const now = new Date().toISOString();
  const stored = normalizeLocalBrowserSession({
    ...session,
    createdAt: session.createdAt ?? now,
    updatedAt: session.updatedAt ?? now,
  });
  writeFileSync(getLocalBrowserSessionFilePath(), JSON.stringify(stored, null, 2), "utf8");
  return stored;
}

export function updateLocalBrowserSession(session: StoredLocalBrowserSession): StoredLocalBrowserSession {
  return saveLocalBrowserSession({
    ...session,
    updatedAt: new Date().toISOString(),
  });
}

export function clearLocalBrowserSession(): void {
  rmSync(getLocalBrowserSessionFilePath(), { force: true });
}

export function cleanupLocalBrowserSession(
  session: StoredLocalBrowserSession,
  options?: { clearTrackedSession?: boolean; terminateProcess?: boolean },
): void {
  if (options?.terminateProcess !== false && session.pid) {
    try {
      process.kill(session.pid);
    } catch {
      // noop
    }
  }

  try {
    rmSync(session.userDataDir, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // noop
  }

  if (options?.clearTrackedSession !== false) {
    clearLocalBrowserSession();
  }
}

export async function withLocalBrowserSessionLock<T>(
  fn: () => Promise<T>,
  options?: { timeoutMs?: number; retryDelayMs?: number },
): Promise<T> {
  ensureLocalBrowserSessionDir();

  const lockPath = getLocalBrowserSessionLockPath();
  const timeoutMs = options?.timeoutMs ?? 15000;
  const retryDelayMs = options?.retryDelayMs ?? 150;
  const deadline = Date.now() + timeoutMs;
  const token = randomUUID();

  while (Date.now() < deadline) {
    try {
      writeFileSync(lockPath, JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }), {
        encoding: "utf8",
        flag: "wx",
      });

      try {
        return await fn();
      } finally {
        try {
          const current = JSON.parse(readFileSync(lockPath, "utf8")) as { token?: string };
          if (current.token === token) {
            rmSync(lockPath, { force: true });
          }
        } catch {
          rmSync(lockPath, { force: true });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/EEXIST/i.test(message)) {
        throw error;
      }

      try {
        const current = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: number };
        if (!current.pid || !isProcessRunning(current.pid)) {
          rmSync(lockPath, { force: true });
          continue;
        }
      } catch {
        rmSync(lockPath, { force: true });
        continue;
      }

      await wait(retryDelayMs);
    }
  }

  throw new Error("Timed out waiting for the managed local browser session lock. Another local browser command may still be running.");
}

export function requireLocalBrowserSession(): StoredLocalBrowserSession {
  const session = getLocalBrowserSession();
  if (!session) {
    throw new Error("No active managed local browser session was found. Run `deepsyte browser open <url>` first.");
  }

  return session;
}
