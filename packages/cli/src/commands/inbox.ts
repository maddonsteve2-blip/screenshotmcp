import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { callTool, extractText } from "../api.js";

export const inboxCreateCommand = new Command("inbox:create")
  .description("Create or reuse the primary disposable test inbox for website auth testing")
  .option("-u, --username <prefix>", "Email username prefix")
  .option("-n, --name <name>", "Display name")
  .option("--force-new", "Force new inbox even if one exists")
  .action(async (opts: Record<string, string | boolean>) => {
    const spinner = ora("Preparing primary test inbox...").start();
    try {
      const res = await callTool("create_test_inbox", {
        username: opts.username,
        display_name: opts.name,
        force_new: !!opts.forceNew,
      });
      spinner.stop();
      console.log(chalk.green("✓ Primary inbox ready"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to create inbox"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const inboxCheckCommand = new Command("inbox:check")
  .description("Check a test inbox for messages")
  .argument("<inboxId>", "Inbox ID or email address")
  .option("-l, --limit <n>", "Max messages to return", "5")
  .action(async (inboxId: string, opts: Record<string, string>) => {
    const spinner = ora("Checking inbox...").start();
    try {
      const res = await callTool("check_inbox", {
        inbox_id: inboxId,
        limit: parseInt(opts.limit) || 5,
      });
      spinner.stop();
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to check inbox"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const inboxSendCommand = new Command("inbox:send")
  .description("Send an email from a test inbox")
  .argument("<inboxId>", "Inbox ID or email address to send from")
  .requiredOption("-t, --to <email>", "Recipient email")
  .requiredOption("-s, --subject <subject>", "Email subject")
  .requiredOption("-b, --body <text>", "Email body")
  .action(async (inboxId: string, opts: Record<string, string>) => {
    const spinner = ora("Sending email...").start();
    try {
      const res = await callTool("send_test_email", {
        inbox_id: inboxId,
        to: opts.to,
        subject: opts.subject,
        text: opts.body,
      });
      spinner.stop();
      console.log(chalk.green("✓ Email sent"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to send email"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });
