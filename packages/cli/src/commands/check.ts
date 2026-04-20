import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { callTool, extractText } from "../api.js";

/**
 * CI-friendly check command. Reads a URL list (default
 * `.screenshotsmcp/urls.json`), runs `ux_review` on each URL, counts
 * audit findings (heuristic parse), and exits non-zero when the total
 * exceeds the configured threshold.
 *
 * Designed for pre-commit hooks and GitHub Actions.
 */
export const checkCommand = new Command("check")
  .description("CI check: audit URLs from .screenshotsmcp/urls.json and fail if findings exceed thresholds")
  .option("-f, --file <path>", "Path to URL list JSON", ".screenshotsmcp/urls.json")
  .option("--max-findings <n>", "Fail if a single URL has more than this many findings", "10")
  .option("--max-total <n>", "Fail if total findings across all URLs exceed this", "50")
  .option("--json", "Emit the per-URL report as JSON on stdout")
  .option("--only <categories>", "Comma-separated categories to count (accessibility,performance,seo)")
  .action(async (opts: Record<string, string | boolean>) => {
    const file = typeof opts.file === "string" ? opts.file : ".screenshotsmcp/urls.json";
    const maxPer = Number.parseInt(String(opts.maxFindings ?? "10"), 10) || 10;
    const maxTotal = Number.parseInt(String(opts.maxTotal ?? "50"), 10) || 50;
    const only = typeof opts.only === "string"
      ? new Set(opts.only.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))
      : undefined;
    const jsonOnly = Boolean(opts.json);

    const urls = await loadUrls(file);
    if (urls.length === 0) {
      if (!jsonOnly) console.error(chalk.yellow(`No URLs found in ${file}.`));
      process.exit(0);
      return;
    }

    if (!jsonOnly) {
      console.log(chalk.bold(`\n\u{1F4E6} ScreenshotsMCP check\u2014${urls.length} URL${urls.length === 1 ? "" : "s"} from ${file}\n`));
    }

    const report: Array<{
      url: string;
      ok: boolean;
      findings: number;
      categories: Record<string, number>;
      error?: string;
    }> = [];

    for (const url of urls) {
      const spinner = jsonOnly ? undefined : ora(`Auditing ${url}\u2026`).start();
      try {
        const res = await callTool("ux_review", { url, width: 1280, height: 800 });
        const text = extractText(res);
        const findings = parseFindings(text, only);
        const total = Object.values(findings).reduce((a, b) => a + b, 0);
        const ok = total <= maxPer;
        const status = ok ? chalk.green("\u2713") : chalk.red("\u2717");
        spinner?.stop();
        if (!jsonOnly) {
          const breakdown = Object.entries(findings)
            .filter(([, n]) => n > 0)
            .map(([cat, n]) => `${cat}:${n}`)
            .join(" \u00b7 ");
          console.log(`${status} ${url} \u2014 ${total} finding${total === 1 ? "" : "s"}${breakdown ? `  (${breakdown})` : ""}`);
        }
        report.push({ url, ok, findings: total, categories: findings });
      } catch (err) {
        spinner?.fail(`${chalk.red("\u2717")} ${url}`);
        const message = err instanceof Error ? err.message : String(err);
        report.push({ url, ok: false, findings: 0, categories: {}, error: message });
      }
    }

    const totalFindings = report.reduce((acc, r) => acc + r.findings, 0);
    const anyFailed = report.some((r) => !r.ok);
    const exceedsTotal = totalFindings > maxTotal;

    if (jsonOnly) {
      console.log(JSON.stringify({ totalFindings, maxTotal, maxPer, pass: !anyFailed && !exceedsTotal, report }, null, 2));
    } else {
      console.log();
      console.log(chalk.bold(`Total findings: ${totalFindings} / max ${maxTotal}`));
      if (anyFailed) {
        console.log(chalk.red(`\u2717 ${report.filter((r) => !r.ok).length} URL(s) exceeded per-URL threshold (${maxPer}).`));
      }
      if (exceedsTotal) {
        console.log(chalk.red(`\u2717 Total findings exceed ${maxTotal}.`));
      }
      if (!anyFailed && !exceedsTotal) {
        console.log(chalk.green("\u2713 All checks passed."));
      }
    }

    process.exit(anyFailed || exceedsTotal ? 1 : 0);
  });

async function loadUrls(file: string): Promise<string[]> {
  const absolute = resolve(process.cwd(), file);
  let raw: string;
  try {
    raw = await readFile(absolute, "utf8");
  } catch (err) {
    console.error(chalk.red(`Could not read ${absolute}: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(2);
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(chalk.red(`Invalid JSON in ${absolute}: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(2);
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).urls)
      ? ((parsed as Record<string, unknown>).urls as unknown[])
      : [];
  const urls: string[] = [];
  for (const entry of list) {
    if (typeof entry === "string" && isHttp(entry)) urls.push(entry);
    else if (entry && typeof entry === "object") {
      const url = (entry as Record<string, unknown>).url;
      if (typeof url === "string" && isHttp(url)) urls.push(url);
    }
  }
  return Array.from(new Set(urls));
}

function isHttp(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Counts bullets under `## <category>` headings in a ux_review response.
 * Heuristic, mirrored from `parseAuditFindings` in the VS Code extension.
 */
export function parseFindings(text: string, only?: Set<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  let category = "general";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      category = heading[1].toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "general";
      continue;
    }
    if (!/^[-*+]\s+/.test(line)) continue;
    if (only && !only.has(category)) continue;
    if (/\b(great|excellent|well[- ]done|looks good)\b/i.test(line) && !/\b(but|however|although)\b/i.test(line)) continue;
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}
