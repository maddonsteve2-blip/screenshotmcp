import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { oauthLogin } from "../auth.js";
import { getApiKey, setApiKey, getConfigPath } from "../config.js";

export const loginCommand = new Command("login")
  .description("Authenticate with ScreenshotsMCP")
  .option("--key <apiKey>", "Use an API key directly instead of OAuth")
  .action(async (opts) => {
    if (opts.key) {
      if (!opts.key.startsWith("sk_live_")) {
        console.error(chalk.red("Invalid API key. Must start with sk_live_"));
        process.exit(1);
      }
      setApiKey(opts.key);
      console.log(chalk.green("✓ API key saved."));
      console.log(chalk.dim(`  Config: ${getConfigPath()}`));
      return;
    }

    const existing = getApiKey();
    if (existing) {
      console.log(chalk.yellow(`Already logged in (key: ${existing.slice(0, 12)}...${existing.slice(-4)})`));
      console.log(chalk.dim("Use --key to replace, or `screenshotsmcp logout` to clear."));
    }

    const spinner = ora("Opening browser for authentication...").start();
    try {
      const result = await oauthLogin();
      spinner.succeed(chalk.green("Logged in successfully!"));
      console.log(chalk.dim(`  Key: ${result.apiKey.slice(0, 12)}...${result.apiKey.slice(-4)}`));
      console.log(chalk.dim(`  Config: ${getConfigPath()}`));
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
    console.log(chalk.green("✓ Logged out. Credentials cleared."));
  });

export const whoamiCommand = new Command("whoami")
  .description("Show current authentication status")
  .action(() => {
    const key = getApiKey();
    if (!key) {
      console.log(chalk.yellow("Not logged in. Run `screenshotsmcp login` to authenticate."));
      return;
    }
    console.log(chalk.green("✓ Authenticated"));
    console.log(`  Key: ${key.slice(0, 12)}...${key.slice(-4)}`);
    console.log(chalk.dim(`  Config: ${getConfigPath()}`));
  });
