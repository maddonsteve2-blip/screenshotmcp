import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { callTool, extractText } from "../api.js";

/**
 * Outbound webhook management. These commands are thin wrappers around the
 * matching MCP tools (`webhook_list`, `webhook_create`, `webhook_test`,
 * `webhook_rotate`, `webhook_deliveries`, `webhook_delete`) so the behaviour
 * stays in lock-step with the AI-agent surface.
 */

export const webhooksListCommand = new Command("webhooks:list")
  .description("List all outbound webhook endpoints registered for your account")
  .action(async () => {
    const spinner = ora("Fetching webhooks...").start();
    try {
      const res = await callTool("webhook_list", {});
      spinner.stop();
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to list webhooks"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const webhooksCreateCommand = new Command("webhooks:create")
  .description("Create a new outbound webhook endpoint. Signing secret is shown ONCE.")
  .requiredOption("-u, --url <url>", "HTTPS URL that will receive POST requests")
  .option(
    "-e, --events <events>",
    "Comma-separated event types (e.g. 'screenshot.completed,quota.warning'). Default: '*' (all events).",
  )
  .option("-d, --description <description>", "Optional human-readable description")
  .action(async (opts: Record<string, string>) => {
    const spinner = ora("Creating webhook...").start();
    try {
      const events = opts.events
        ? opts.events.split(",").map((e) => e.trim()).filter(Boolean)
        : undefined;
      const res = await callTool("webhook_create", {
        url: opts.url,
        events,
        description: opts.description,
      });
      spinner.stop();
      console.log(chalk.green("✓ Webhook created"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to create webhook"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const webhooksTestCommand = new Command("webhooks:test")
  .description("Fire a test.ping event to a webhook endpoint")
  .argument("<endpointId>", "Endpoint id from webhooks:list / webhooks:create")
  .action(async (endpointId: string) => {
    const spinner = ora("Firing test ping...").start();
    try {
      const res = await callTool("webhook_test", { endpointId });
      spinner.stop();
      console.log(chalk.green("✓ Test ping enqueued"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to fire test ping"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const webhooksRotateCommand = new Command("webhooks:rotate")
  .description("Rotate the signing secret for a webhook endpoint")
  .argument("<endpointId>", "Endpoint id to rotate")
  .action(async (endpointId: string) => {
    const spinner = ora("Rotating secret...").start();
    try {
      const res = await callTool("webhook_rotate", { endpointId });
      spinner.stop();
      console.log(chalk.green("✓ Secret rotated"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to rotate secret"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const webhooksDeliveriesCommand = new Command("webhooks:deliveries")
  .description("List recent delivery attempts for a webhook endpoint")
  .argument("<endpointId>", "Endpoint id")
  .option("-l, --limit <n>", "Maximum rows to return", "10")
  .action(async (endpointId: string, opts: Record<string, string>) => {
    const spinner = ora("Loading deliveries...").start();
    try {
      const res = await callTool("webhook_deliveries", {
        endpointId,
        limit: parseInt(opts.limit, 10) || 10,
      });
      spinner.stop();
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to load deliveries"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const webhooksDeleteCommand = new Command("webhooks:delete")
  .description("Permanently delete a webhook endpoint")
  .argument("<endpointId>", "Endpoint id to delete")
  .action(async (endpointId: string) => {
    const spinner = ora("Deleting webhook...").start();
    try {
      const res = await callTool("webhook_delete", { endpointId });
      spinner.stop();
      console.log(chalk.yellow("✓ Webhook deleted"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to delete webhook"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });
