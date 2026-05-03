import * as vscode from "vscode";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { SECRET_API_KEY } from "../constants";
import { getApiUrl } from "../settings";

const CLI_CONFIG_PATH = join(homedir(), ".config", "deepsyte", "config.json");

interface CliConfigShape {
  apiKey?: string;
  apiUrl?: string;
}

function isWebsiteSessionToken(value: string): boolean {
  return value.startsWith("dso_");
}

export class AuthStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getApiKey(): Promise<string> {
    const secret = (await this.context.secrets.get(SECRET_API_KEY)) ?? "";
    if (secret) {
      if (!isWebsiteSessionToken(secret)) {
        await this.clearApiKey();
        return "";
      }
      return secret;
    }

    const cliConfig = readCliConfig();
    if (cliConfig.apiKey && isWebsiteSessionToken(cliConfig.apiKey)) {
      await this.context.secrets.store(SECRET_API_KEY, cliConfig.apiKey);
      return cliConfig.apiKey;
    }

    return "";
  }

  async hasApiKey(): Promise<boolean> {
    return Boolean(await this.getApiKey());
  }

  async setApiKey(apiKey: string): Promise<void> {
    await this.context.secrets.store(SECRET_API_KEY, apiKey);
    writeCliConfig({
      apiKey,
      apiUrl: getApiUrl(),
    });
  }

  async clearApiKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_API_KEY);
    writeCliConfig({
      apiKey: "",
      apiUrl: getApiUrl(),
    });
  }
}

function readCliConfig(): CliConfigShape {
  if (!existsSync(CLI_CONFIG_PATH)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(CLI_CONFIG_PATH, "utf8")) as CliConfigShape;
  } catch {
    return {};
  }
}

function writeCliConfig(config: CliConfigShape): void {
  mkdirSync(join(homedir(), ".config", "deepsyte"), { recursive: true });
  writeFileSync(CLI_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
