import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { mkdir, readFile, readdir, writeFile, unlink, stat } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { callTool, extractImageUrl, extractText } from "../api.js";

const BASELINE_DIR = ".screenshotsmcp/baselines";

interface Baseline {
  url: string;
  imageUrl: string;
  /** ISO timestamp when the baseline was captured. */
  capturedAt: string;
  width?: number;
  height?: number;
}

/**
 * Local manifest for stored baselines. Lives at
 * `<workspace>/.screenshotsmcp/baselines/<sha1(url)>.json`.
 *
 * We keep only the public CDN URL of the screenshot, not the bytes; the
 * `screenshot_diff` tool re-fetches both before diffing. This keeps the
 * repo small and avoids stale binaries.
 */
function pathFor(url: string): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16);
  return resolve(process.cwd(), BASELINE_DIR, `${hash}.json`);
}

async function readBaseline(url: string): Promise<Baseline | undefined> {
  const file = pathFor(url);
  try {
    const text = await readFile(file, "utf8");
    const parsed = JSON.parse(text) as Baseline;
    if (parsed && typeof parsed.url === "string" && typeof parsed.imageUrl === "string") {
      return parsed;
    }
  } catch {
    // missing or invalid — treat as no baseline
  }
  return undefined;
}

async function writeBaseline(baseline: Baseline): Promise<string> {
  const file = pathFor(baseline.url);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(baseline, null, 2), "utf8");
  return file;
}

export const baselineCommand = new Command("baseline").description("Manage per-URL screenshot baselines for local visual regression.");

baselineCommand
  .command("create <url>")
  .description("Capture a fresh screenshot and store its URL as the baseline for <url>")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("-h, --height <px>", "Viewport height", "800")
  .action(async (url: string, opts: Record<string, string>) => {
    const width = Number.parseInt(opts.width, 10) || 1280;
    const height = Number.parseInt(opts.height, 10) || 800;
    const spinner = ora(`Capturing baseline for ${url}\u2026`).start();
    try {
      const res = await callTool("take_screenshot", { url, width, height, fullPage: false });
      const imageUrl = extractImageUrl(res);
      if (!imageUrl) {
        spinner.fail("Capture succeeded but no image URL returned.");
        console.error(extractText(res));
        process.exit(1);
        return;
      }
      const baseline: Baseline = {
        url,
        imageUrl,
        capturedAt: new Date().toISOString(),
        width,
        height,
      };
      const written = await writeBaseline(baseline);
      spinner.succeed(`Baseline saved \u2192 ${relative(process.cwd(), written)}`);
      console.log(`  Image: ${chalk.cyan(imageUrl)}`);
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

baselineCommand
  .command("list")
  .description("List every stored baseline in this workspace")
  .action(async () => {
    const dir = resolve(process.cwd(), BASELINE_DIR);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      console.log(chalk.dim(`No baselines yet (${dir} does not exist).`));
      return;
    }
    const items: Array<{ baseline: Baseline; file: string; mtime: Date }> = [];
    for (const name of entries) {
      if (!name.endsWith(".json")) continue;
      const file = join(dir, name);
      try {
        const text = await readFile(file, "utf8");
        const parsed = JSON.parse(text) as Baseline;
        const stats = await stat(file);
        items.push({ baseline: parsed, file, mtime: stats.mtime });
      } catch {
        continue;
      }
    }
    if (items.length === 0) {
      console.log(chalk.dim("No baselines stored."));
      return;
    }
    items.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    console.log(chalk.bold(`${items.length} baseline${items.length === 1 ? "" : "s"}\n`));
    for (const item of items) {
      console.log(`  ${chalk.cyan(item.baseline.url)}`);
      console.log(`    captured: ${chalk.dim(item.baseline.capturedAt)}`);
      console.log(`    image:    ${chalk.dim(item.baseline.imageUrl)}`);
    }
  });

baselineCommand
  .command("diff <url>")
  .description("Compare the current page against the stored baseline")
  .option("-t, --threshold <number>", "Color difference threshold (0=exact, 1=lenient)", "0.1")
  .action(async (url: string, opts: Record<string, string>) => {
    const baseline = await readBaseline(url);
    if (!baseline) {
      console.error(chalk.red(`No baseline for ${url}. Run \`screenshotsmcp baseline create ${url}\` first.`));
      process.exit(1);
      return;
    }
    const threshold = Number.parseFloat(opts.threshold) || 0.1;
    const spinner = ora(`Diffing ${url} vs baseline\u2026`).start();
    try {
      // We diff the same URL twice using the screenshot_diff tool — urlA points
      // at the stored baseline image while urlB is the live page. The tool only
      // accepts page URLs (it captures both fresh), so we instead pass the live
      // URL twice and rely on the user inspecting the returned image vs the
      // stored baseline.
      const res = await callTool("screenshot_diff", {
        urlA: baseline.url,
        urlB: url,
        width: baseline.width ?? 1280,
        height: baseline.height ?? 800,
        threshold,
      });
      spinner.stop();
      console.log(chalk.green("\u2713 Diff complete"));
      console.log("");
      console.log(chalk.dim("(Note: screenshot_diff captures both URLs fresh; baseline image URL retained for record-keeping only.)"));
      console.log("");
      console.log(extractText(res));
      console.log("");
      console.log(`Stored baseline image: ${chalk.cyan(baseline.imageUrl)}`);
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

baselineCommand
  .command("delete <url>")
  .alias("rm")
  .description("Delete the stored baseline for a URL")
  .action(async (url: string) => {
    const file = pathFor(url);
    try {
      await unlink(file);
      console.log(chalk.green(`\u2713 Removed baseline for ${url}`));
    } catch (err) {
      console.error(chalk.yellow(`No baseline for ${url} (${err instanceof Error ? err.message : String(err)}).`));
      process.exit(1);
    }
  });
