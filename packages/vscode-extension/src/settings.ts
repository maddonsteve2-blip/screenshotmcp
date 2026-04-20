import * as vscode from "vscode";
import {
  CONFIG_NAMESPACE,
  DEFAULT_API_URL,
  DEFAULT_DASHBOARD_URL,
  DEFAULT_KEYS_URL,
} from "./constants";

function getConfig() {
  return vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
}

function normalizeWebUrl(value: string, fallback: string): string {
  try {
    const url = new URL(value || fallback);
    if (url.hostname === "screenshotsmcp.com") {
      url.hostname = "www.screenshotmcp.com";
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

export function getApiUrl(): string {
  return getConfig().get<string>("apiUrl", DEFAULT_API_URL);
}

export function getDashboardUrl(): string {
  return normalizeWebUrl(getConfig().get<string>("dashboardUrl", DEFAULT_DASHBOARD_URL), DEFAULT_DASHBOARD_URL);
}

export function getKeysUrl(): string {
  return normalizeWebUrl(getConfig().get<string>("keysUrl", DEFAULT_KEYS_URL), DEFAULT_KEYS_URL);
}

export type ScreenshotFormat = "png" | "jpeg" | "webp";

export interface ScreenshotDefaults {
  width: number;
  height: number;
  fullPage: boolean;
  delay: number;
  format: ScreenshotFormat;
}

const ALLOWED_FORMATS: ReadonlySet<ScreenshotFormat> = new Set(["png", "jpeg", "webp"]);

export function getScreenshotDefaults(): ScreenshotDefaults {
  const cfg = getConfig();
  const rawFormat = cfg.get<string>("screenshot.format", "png");
  const format: ScreenshotFormat = ALLOWED_FORMATS.has(rawFormat as ScreenshotFormat)
    ? (rawFormat as ScreenshotFormat)
    : "png";
  return {
    width: clamp(cfg.get<number>("screenshot.width", 1280), 320, 3840, 1280),
    height: clamp(cfg.get<number>("screenshot.height", 800), 240, 2160, 800),
    fullPage: cfg.get<boolean>("screenshot.fullPage", true),
    delay: clamp(cfg.get<number>("screenshot.delay", 0), 0, 10000, 0),
    format,
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, num));
}
