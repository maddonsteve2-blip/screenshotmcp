import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { oauthLogin } from "../auth.js";
import { getApiKey, setApiKey, getConfigPath } from "../config.js";
import { printSkillSyncResult, syncCoreSkillForCli } from "../skills.js";
import { ensureWebsiteAuthenticated } from "../api.js";

export const loginCommand = new Command("login")
  .description("Authenticate with DeepSyte")
  .option("--key <apiKey>", "Deprecated: raw API keys can no longer be used for CLI/MCP sign-in")
  .action(async (opts) => {
    if (opts.key) {
      console.error(chalk.red("Raw API keys can no longer authenticate CLI/MCP access."));
      console.error(chalk.dim("Run `deepsyte login` and approve the connection in the DeepSyte website."));
      process.exit(1);
    }

    const existing = getApiKey();
    if (existing) {
      console.log(chalk.yellow(`Already logged in (session: ${existing.slice(0, 12)}...${existing.slice(-4)})`));
      console.log(chalk.dim("Use `deepsyte logout` to clear it, then run `deepsyte login` to reauthorize."));
    }

    const spinner = ora("Opening browser for authentication...").start();
    try {
      const result = await oauthLogin();
      spinner.succeed(chalk.green("Logged in successfully!"));
      console.log(chalk.dim(`  Session: ${result.apiKey.slice(0, 12)}...${result.apiKey.slice(-4)}`));
      console.log(chalk.dim(`  Config: ${getConfigPath()}`));
      printSkillSyncResult(syncCoreSkillForCli());
      console.log(chalk.dim("  Tip: use `deepsyte auth:test https://example.com` before login or sign-up testing."));
    } catch (err) {
      spinner.fail(chalk.red("Login failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const logoutCommand = new Command("logout")
  .description("Clear stored credentials")
  .action(() => {
    setApiKey("");
    console.log(chalk.green("Logged out. Credentials cleared."));
  });

export const whoamiCommand = new Command("whoami")
  .description("Show current authentication status")
  .action(async () => {
    const key = getApiKey();
    if (!key) {
      console.log(chalk.yellow("Not logged in. Run `deepsyte login` to authenticate."));
      return;
    }
    try {
      await ensureWebsiteAuthenticated();
    } catch (err) {
      console.log(chalk.red("Not authenticated"));
      console.log(chalk.dim(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.green("Authenticated"));
    console.log(`  Session: ${key.slice(0, 12)}...${key.slice(-4)}`);
    console.log(chalk.dim(`  Config: ${getConfigPath()}`));
  });
