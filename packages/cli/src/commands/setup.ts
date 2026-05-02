import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ONBOARDING_CLIENTS, getNpxSetupCommand, type OnboardingClient } from "@deepsyte/types";
import { oauthLogin } from "../auth.js";
import { getApiKey } from "../config.js";
import { installCommand } from "./install.js";
import { createInterface } from "readline";

const CLIENTS: readonly OnboardingClient[] = ONBOARDING_CLIENTS;
const CLIENT_LIST = CLIENTS.join(", ");
const CLIENT_EXAMPLES = CLIENTS.map((client: OnboardingClient) => `  ${getNpxSetupCommand(client)}`).join("\n");

function detectClient(): string | null {
  const env = process.env;

  // Claude Code
  if (env.CLAUDE_CODE || env.CLAUDE_CODE_VERSION) return "claude-code";
  if (/claude/i.test(env._ || "")) return "claude-code";

  // Cursor
  if (env.CURSOR_LAYOUT || env.CURSOR_SPAWNED_BY_EXTENSION_ID || env.CURSOR_CLI) return "cursor";
  const ipc = env.VSCODE_IPC_HOOK || env.VSCODE_IPC_HOOK_CLI || "";
  if (/cursor/i.test(ipc)) return "cursor";

  // Windsurf
  if (env.WINDSURF_IS_REMOTE) return "windsurf";
  if (/windsurf|codeium/i.test(ipc)) return "windsurf";

  // VS Code
  if (env.TERM_PROGRAM === "vscode" || /code/i.test(ipc)) return "vscode";

  return null;
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export const setupCommand = new Command("setup")
  .description(
    "Interactive setup: login + configure your MCP client in one step.\n" +
    "Always prompts the user to choose their IDE client.\n\n" +
    "AI agents: use --client to skip the interactive prompt:\n" +
    CLIENT_EXAMPLES
  )
  .option("--client <client>", `Skip interactive prompt (for AI agents): ${CLIENT_LIST}`)
  .action(async (opts) => {
    console.log(chalk.bold("\n  DeepSyte Setup\n"));

    // Step 1: Check auth
    let key = getApiKey();
    if (key) {
      console.log(chalk.green(`✓ Already authenticated (${key.slice(0, 12)}...${key.slice(-4)})`));
    } else {
      console.log(chalk.dim("Step 1/2: Authentication\n"));
      const spinner = ora("Opening browser for OAuth login...").start();
      try {
        const result = await oauthLogin();
        spinner.succeed(chalk.green("Logged in successfully!"));
        key = result.apiKey;
      } catch (err) {
        spinner.fail(chalk.red("Login failed"));
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        console.log(chalk.dim("\nYou can also run: deepsyte login --key sk_live_..."));
        process.exit(1);
      }
    }

    // Step 2: Choose client
    console.log(chalk.dim("\nStep 2/2: Configure MCP client\n"));

    let client = opts.client?.toLowerCase();

    // --client flag = agent override, skip prompt entirely
    if (client) {
      if (!CLIENTS.includes(client as typeof CLIENTS[number])) {
        console.error(chalk.red(`Unknown client: ${client}`));
        console.log(chalk.dim(`Valid: ${CLIENT_LIST}`));
        process.exit(1);
      }
    } else {
      // Interactive: always show the list, highlight detected one
      const detected = detectClient();

      console.log("  Which client would you like to configure?\n");
      CLIENTS.forEach((c: OnboardingClient, i: number) => {
        const marker = c === detected ? chalk.cyan(" (detected)") : "";
        const num = c === detected ? chalk.cyan(chalk.bold(String(i + 1))) : chalk.bold(String(i + 1));
        console.log(`    ${num}. ${c}${marker}`);
      });
      console.log();

      const defaultIdx = detected ? CLIENTS.indexOf(detected as typeof CLIENTS[number]) + 1 : null;
      const promptMsg = defaultIdx
        ? `  Enter number (1-5) [${defaultIdx}]: `
        : "  Enter number (1-5): ";

      const choice = await prompt(promptMsg);
      const raw = choice === "" && defaultIdx ? defaultIdx : parseInt(choice, 10);
      const idx = raw - 1;

      if (idx >= 0 && idx < CLIENTS.length) {
        client = CLIENTS[idx];
      } else {
        console.error(chalk.red("Invalid choice."));
        process.exit(1);
      }
    }

    // Step 3: Run install
    console.log();
    await installCommand.parseAsync([client], { from: "user" });

    console.log(chalk.bold(chalk.green("\n  Setup complete! ✓\n")));
    console.log(chalk.dim("  Try asking your AI: \"Take a screenshot of https://example.com\""));
    console.log(chalk.dim("  For login or sign-up testing, start with: `deepsyte auth:test https://example.com`"));
    console.log();
  });
