import Conf from "conf";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const WINDSURF_MCP_CONFIG_PATH = join(homedir(), ".codeium", "windsurf", "mcp_config.json");

interface WindsurfMcpConfig {
  mcpServers?: {
    deepsyte?: {
      headers?: Record<string, string>;
      serverUrl?: string;
      url?: string;
    };
  };
}

const config = new Conf({
  projectName: "deepsyte",
  cwd: join(homedir(), ".config", "deepsyte"),
  schema: {
    apiKey: { type: "string", default: "" },
    apiUrl: { type: "string", default: "https://api.deepsyte.com" },
  },
});

export function getApiKey(): string {
  return (config.get("apiKey") as string) || "";
}

export function setApiKey(key: string): void {
  config.set("apiKey", key);
}

export function getWindsurfApiKey(): string {
  if (!existsSync(WINDSURF_MCP_CONFIG_PATH)) {
    return "";
  }

  try {
    const parsed = JSON.parse(readFileSync(WINDSURF_MCP_CONFIG_PATH, "utf8")) as WindsurfMcpConfig;
    const server = parsed.mcpServers?.deepsyte;
    const headerKey = server?.headers?.["x-api-key"];
    if (headerKey?.startsWith("dso_")) {
      return headerKey;
    }
    const authHeader = server?.headers?.Authorization ?? server?.headers?.authorization;
    const bearerMatch = authHeader?.match(/^Bearer\s+(dso_[A-Za-z0-9_-]+)$/);
    if (bearerMatch) {
      return bearerMatch[1];
    }

    const urlValue = server?.serverUrl ?? server?.url ?? "";
    const match = urlValue.match(/\/mcp\/(dso_[A-Za-z0-9_-]+)/);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

export function syncApiKeyFromEditorConfigs(currentKey = ""): string {
  const windsurfKey = getWindsurfApiKey();
  if (windsurfKey && windsurfKey !== currentKey) {
    setApiKey(windsurfKey);
    return windsurfKey;
  }

  return currentKey;
}

export function getApiUrl(): string {
  return (config.get("apiUrl") as string) || "https://api.deepsyte.com";
}

export function setApiUrl(url: string): void {
  config.set("apiUrl", url);
}

export function clearConfig(): void {
  config.clear();
}

export function getConfigPath(): string {
  return config.path;
}
