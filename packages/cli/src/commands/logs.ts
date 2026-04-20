import { Command } from "commander";
import chalk from "chalk";
import { callTool, extractText } from "../api.js";

/**
 * Lists recent screenshot/audit jobs by calling the `list_recent_screenshots`
 * MCP tool. Renders as a one-line-per-job table; `--json` gives raw output for
 * scripting.
 */
export const logsCommand = new Command("logs")
  .alias("recent")
  .description("Tail your recent screenshots and audits from the dashboard API")
  .option("-n, --limit <count>", "Maximum number of jobs to print", "10")
  .option("--json", "Print the raw response payload instead of a table")
  .action(async (opts: Record<string, string | boolean>) => {
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(opts.limit ?? "10"), 10) || 10));
    const jsonOnly = Boolean(opts.json);
    try {
      const res = await callTool("list_recent_screenshots", { limit });
      const text = extractText(res);
      if (jsonOnly) {
        process.stdout.write(text + (text.endsWith("\n") ? "" : "\n"));
        return;
      }
      const rows = parseLogText(text);
      if (rows.length === 0) {
        if (text.trim()) {
          // Tool returned something we couldn't parse — fall back to raw output.
          console.log(text);
        } else {
          console.log(chalk.dim("No recent jobs."));
        }
        return;
      }
      console.log(chalk.bold(`Last ${rows.length} job${rows.length === 1 ? "" : "s"}\n`));
      for (const row of rows) {
        const stamp = row.when ? chalk.dim(row.when) : "";
        const url = row.url ? chalk.cyan(row.url) : chalk.dim("(unknown URL)");
        const image = row.imageUrl ? `\n      ${chalk.dim(row.imageUrl)}` : "";
        console.log(`  ${stamp}  ${url}${image}`);
      }
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

interface LogRow {
  when?: string;
  url?: string;
  imageUrl?: string;
}

/**
 * Heuristic parser for the textual response produced by
 * `list_recent_screenshots`. The tool currently returns plain text rather
 * than structured JSON, so we extract URL pairs (page URL + CDN image URL)
 * and timestamps line-by-line.
 */
export function parseLogText(text: string): LogRow[] {
  const lines = text.split(/\r?\n/);
  const rows: LogRow[] = [];
  let current: LogRow | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const url = line.match(/https?:\/\/[^\s)"']+/g);
    const isImage = url?.some((u) => /\.(png|jpe?g|webp|gif|pdf)(\?|$)/i.test(u));
    const isoLike = line.match(/\d{4}-\d{2}-\d{2}[T\s][\d:.]+/);
    if (isoLike && !current) {
      current = { when: isoLike[0] };
    }
    if (url) {
      for (const u of url) {
        if (/\.(png|jpe?g|webp|gif|pdf)(\?|$)/i.test(u)) {
          current = current ?? {};
          current.imageUrl = current.imageUrl ?? u;
        } else {
          current = current ?? {};
          current.url = current.url ?? u;
        }
      }
      if (isImage && current && (current.url || current.imageUrl)) {
        rows.push(current);
        current = null;
      }
    }
  }
  if (current && (current.url || current.imageUrl)) rows.push(current);
  return rows;
}
