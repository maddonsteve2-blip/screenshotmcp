import { Command } from "commander";
import chalk from "chalk";
import { writeRunOutcome, finishCliRun } from "../api.js";

/**
 * Write the developer-facing problem/outcome story for a CLI-driven run so
 * the dashboard Summary tab renders it above the narrated timeline.
 *
 * Usage:
 *   deepsyte run:finish <runId> \
 *     --problem "Publish DeepSyte to Smithery" \
 *     --outcome "Listing is live at <url>" \
 *     --verdict passed \
 *     --next "Monitor install count" --next "Update README"
 */
export const runFinishCommand = new Command("run:finish")
  .description("Write the problem/outcome summary for a run and mark it completed")
  .argument("<runId>", "The run id from browser:start")
  .requiredOption("-p, --problem <text>", "What were you trying to do?")
  .requiredOption("-o, --outcome <text>", "What actually happened?")
  .option("-v, --verdict <value>", "passed | failed | inconclusive | flaky", "inconclusive")
  .option("-n, --next <text...>", "Follow-up step (repeatable)")
  .option("--no-close", "Do not mark the run status=completed (only write the outcome)")
  .action(async (runId: string, opts: {
    problem: string;
    outcome: string;
    verdict: string;
    next?: string[];
    close: boolean;
  }) => {
    try {
      const verdict = ["passed", "failed", "inconclusive", "flaky"].includes(opts.verdict)
        ? (opts.verdict as "passed" | "failed" | "inconclusive" | "flaky")
        : "inconclusive";

      await writeRunOutcome(runId, {
        problem: opts.problem,
        summary: opts.outcome,
        verdict,
        nextActions: opts.next,
      });
      console.log(chalk.green("✓ Run outcome saved."));

      if (opts.close) {
        await finishCliRun(runId, { status: verdict === "failed" ? "failed" : "completed" });
        console.log(chalk.dim("  Run marked completed."));
      }

      console.log(
        chalk.cyan(`  View: https://web-phi-eight-56.vercel.app/dashboard/runs/${runId}`),
      );
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exitCode = 1;
    }
  });
