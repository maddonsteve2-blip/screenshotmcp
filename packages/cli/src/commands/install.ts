import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { DEFAULT_ONBOARDING_CLIENT, ONBOARDING_CLIENTS, getSetupCommand } from "@deepsyte/types";
import { getApiKey, getApiUrl } from "../config.js";
import { printSkillSyncResult, syncCoreSkillForCli } from "../skills.js";

const API_URL_DEFAULT = "https://deepsyte-api-production.up.railway.app";
const SUPPORTED_CLIENTS = ONBOARDING_CLIENTS.join(", ");

function getMcpUrl(): string {
  const apiUrl = getApiUrl();
  const key = getApiKey();
  if (key) return `${apiUrl}/mcp/${key}`;
  return `${apiUrl}/mcp`;
}

function mergeJsonConfig(filePath: string, newConfig: Record<string, unknown>): void {
  let existing: Record<string, unknown> = {};
  if (existsSync(filePath)) {
    try {
      existing = JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
      // corrupted file, start fresh
    }
  }
  const dir = filePath.substring(0, filePath.lastIndexOf("/") || filePath.lastIndexOf("\\"));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Deep merge mcpServers
  const merged = { ...existing };
  if (newConfig.mcpServers) {
    merged.mcpServers = {
      ...(existing.mcpServers as Record<string, unknown> || {}),
      ...(newConfig.mcpServers as Record<string, unknown>),
    };
  }
  if (newConfig.mcp) {
    const existingMcp = (existing.mcp as Record<string, unknown>) || {};
    const newMcp = newConfig.mcp as Record<string, unknown>;
    merged.mcp = {
      ...existingMcp,
      servers: {
        ...((existingMcp.servers as Record<string, unknown>) || {}),
        ...((newMcp.servers as Record<string, unknown>) || {}),
      },
    };
  }

  writeFileSync(filePath, JSON.stringify(merged, null, 2) + "\n");
}

export const installCommand = new Command("install")
  .description(`Configure one MCP client. For first-time onboarding, prefer \`${getSetupCommand()}\`.`)
  .argument("<client>", `Client to configure: ${SUPPORTED_CLIENTS}`)
  .action(async (client: string) => {
    const key = getApiKey();
    if (!key) {
      console.log(chalk.yellow(`Not logged in. For the smoothest first-time setup, run \`${getSetupCommand(DEFAULT_ONBOARDING_CLIENT)}\` instead.`));
      console.log(chalk.dim("Or use `deepsyte login --key sk_live_...` to set a key manually before running install.\n"));
    }

    const mcpUrl = getMcpUrl();
    const isWindows = process.platform === "win32";

    switch (client.toLowerCase()) {
      case "cursor": {
        const configPath = join(homedir(), ".cursor", "mcp.json");
        mergeJsonConfig(configPath, {
          mcpServers: {
            deepsyte: { url: mcpUrl },
          },
        });
        console.log(chalk.green(`✓ Configured Cursor`));
        console.log(chalk.dim(`  ${configPath}`));
        console.log(chalk.dim("  Restart Cursor to load the MCP server."));
        printSkillSyncResult(syncCoreSkillForCli());
        break;
      }

      case "vscode": {
        const configPath = join(process.cwd(), ".vscode", "mcp.json");
        mergeJsonConfig(configPath, {
          mcp: {
            servers: {
              deepsyte: { type: "http", url: mcpUrl },
            },
          },
        });
        console.log(chalk.green(`✓ Configured VS Code`));
        console.log(chalk.dim(`  ${configPath}`));
        console.log(chalk.dim("  This is a workspace-local config written relative to your current directory."));
        console.log(chalk.dim("  Enable chat.mcp.enabled in VS Code settings."));
        printSkillSyncResult(syncCoreSkillForCli());
        break;
      }

      case "windsurf": {
        const configPath = join(homedir(), ".codeium", "windsurf", "mcp_config.json");
        if (key) {
          mergeJsonConfig(configPath, {
            mcpServers: {
              deepsyte: {
                headers: { "x-api-key": key },
                serverUrl: `${getApiUrl()}/mcp`,
              },
            },
          });
        } else {
          mergeJsonConfig(configPath, {
            mcpServers: {
              deepsyte: { serverUrl: mcpUrl },
            },
          });
        }
        console.log(chalk.green(`✓ Configured Windsurf`));
        console.log(chalk.dim(`  ${configPath}`));
        console.log(chalk.dim("  Reload MCP Servers in Windsurf."));
        printSkillSyncResult(syncCoreSkillForCli());
        break;
      }

      case "claude": {
        const configDir = isWindows
          ? join(process.env.APPDATA || "", "Claude")
          : join(homedir(), "Library", "Application Support", "Claude");
        const configPath = join(configDir, "claude_desktop_config.json");

        const args = isWindows
          ? ["/c", "npx", "-y", "mcp-remote@latest", mcpUrl]
          : ["-y", "mcp-remote@latest", mcpUrl];
        const command = isWindows ? "cmd" : "npx";

        mergeJsonConfig(configPath, {
          mcpServers: {
            deepsyte: { command, args },
          },
        });
        console.log(chalk.green(`✓ Configured Claude Desktop`));
        console.log(chalk.dim(`  ${configPath}`));
        console.log(chalk.dim("  Restart Claude Desktop to load the MCP server."));
        printSkillSyncResult(syncCoreSkillForCli());
        break;
      }

      case "claude-code": {
        console.log(chalk.cyan("Claude Code is configured by running this command manually:\n"));
        console.log(`  claude mcp add --transport http deepsyte -s user ${mcpUrl}\n`);
        printSkillSyncResult(syncCoreSkillForCli());
        break;
      }

      default:
        console.error(chalk.red(`Unknown client: ${client}`));
        console.log(chalk.dim(`Supported: ${SUPPORTED_CLIENTS}`));
        process.exit(1);
    }
  });
