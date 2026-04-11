import Conf from "conf";
import { homedir } from "os";
import { join } from "path";

const config = new Conf({
  projectName: "screenshotsmcp",
  cwd: join(homedir(), ".config", "screenshotsmcp"),
  schema: {
    apiKey: { type: "string", default: "" },
    apiUrl: { type: "string", default: "https://screenshotsmcp-api-production.up.railway.app" },
  },
});

export function getApiKey(): string {
  return (config.get("apiKey") as string) || "";
}

export function setApiKey(key: string): void {
  config.set("apiKey", key);
}

export function getApiUrl(): string {
  return (config.get("apiUrl") as string) || "https://screenshotsmcp-api-production.up.railway.app";
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
