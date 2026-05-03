import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { DEFAULT_ONBOARDING_CLIENT, ONBOARDING_CLIENTS, getSetupCommand } from "@deepsyte/types";
import { getApiUrl } from "../config.js";
import { printSkillSyncResult, syncCoreSkillForCli } from "../skills.js";

const SUPPORTED_CLIENTS = ONBOARDING_CLIENTS.join(", ");

function getMcpUrl(): string {
  return `${getApiUrl()}/mcp`;
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

function upsertCodexMcpConfig(filePath: string, mcpUrl: string): void {
  const lastSeparator = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const dir = lastSeparator >= 0 ? filePath.substring(0, lastSeparator) : "";
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });

  const section = `[mcp_servers.deepsyte]\nurl = "${mcpUrl}"\nscopes = ["mcp:tools"]\noauth_resource = "${mcpUrl}"\n`;
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const sectionPattern = /(^|\r?\n)\[mcp_servers\.deepsyte\]\r?\n[\s\S]*?(?=\r?\n\[|$)/m;

  if (sectionPattern.test(existing)) {
    writeFileSync(filePath, existing.replace(sectionPattern, (prefix) => {
      const leadingNewline = prefix.startsWith("\n") || prefix.startsWith("\r\n")
        ? prefix.match(/^\r?\n/)?.[0] ?? ""
        : "";
      return `${leadingNewline}${section.trimEnd()}`;
    }));
    return;
  }

  const separator = existing.trim().length > 0 ? "\n\n" : "";
  writeFileSync(filePath, `${existing.trimEnd()}${separator}${section}`);
}

export const installCommand = new Command("install")
  .description(`Configure one MCP client. For first-time onboarding, prefer \`${getSetupCommand()}\`.`)
  .argument("<client>", `Client to configure: ${SUPPORTED_CLIENTS}`)
  .action(async (client: string) => {
    console.log(chalk.dim(`For the smoothest first-time setup, run \`${getSetupCommand(DEFAULT_ONBOARDING_CLIENT)}\`.\n`));

    const mcpUrl = getMcpUrl();
    const isWindows = process.platform === "win32";

    switch (client.toLowerCase()) {
      case "codex": {
        const configPath = join(homedir(), ".codex", "config.toml");
        upsertCodexMcpConfig(configPath, mcpUrl);
        console.log(chalk.green(`Configured Codex`));
        console.log(chalk.dim(`  ${configPath}`));
        console.log(chalk.dim("  Restart Codex Desktop or reload MCP servers."));
        console.log(chalk.dim("  Then run: codex mcp login deepsyte"));
        printSkillSyncResult(syncCoreSkillForCli());
        break;
      }

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
        mergeJsonConfig(configPath, {
          mcpServers: {
            deepsyte: { serverUrl: mcpUrl },
          },
        });
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
