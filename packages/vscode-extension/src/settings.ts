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
