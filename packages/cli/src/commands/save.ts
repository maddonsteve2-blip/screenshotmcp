import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { callTool, extractImageUrl, extractText } from "../api.js";

const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);

/**
 * Capture a URL and write the resulting image bytes to a local file in one
 * shot. Bridges the gap between `screenshot` (prints URL) and what most users
 * actually want when scripting ("give me the file").
 */
export const saveCommand = new Command("save")
  .description("Capture a URL and download the image to a local file")
  .argument("<url>", "URL to capture")
  .requiredOption("-t, --to <path>", "Output file path (e.g. ./shot.png)")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("-h, --height <px>", "Viewport height", "800")
  .option("--fullPage", "Capture the entire scrollable page", false)
  .option("--delay <ms>", "Wait N ms after page load before capturing", "0")
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const out = resolve(process.cwd(), String(opts.to));
    const inferredFormat = inferFormat(out);
    const width = Number.parseInt(String(opts.width ?? "1280"), 10) || 1280;
    const height = Number.parseInt(String(opts.height ?? "800"), 10) || 800;
    const delay = Number.parseInt(String(opts.delay ?? "0"), 10) || 0;
    const fullPage = Boolean(opts.fullPage);

    const spinner = ora(`Capturing ${url}\u2026`).start();
    let imageUrl: string | null = null;
    try {
      const res = await callTool("take_screenshot", {
        url,
        width,
        height,
        fullPage,
        delay,
        format: inferredFormat,
      });
      imageUrl = extractImageUrl(res);
      if (!imageUrl) {
        spinner.fail("Capture succeeded but no image URL was returned.");
        console.error(extractText(res));
        process.exit(1);
        return;
      }
      spinner.text = `Downloading ${imageUrl}\u2026`;
      const fetched = await fetch(imageUrl);
      if (!fetched.ok) {
        spinner.fail(`Download failed: HTTP ${fetched.status}`);
        process.exit(1);
        return;
      }
      const buffer = Buffer.from(await fetched.arrayBuffer());
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, buffer);
      spinner.succeed(`Saved ${url}`);
      console.log(`  ${chalk.cyan(out)}  (${formatBytes(buffer.length)})`);
      console.log(chalk.dim(`  source: ${imageUrl}`));
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

function inferFormat(path: string): "png" | "jpeg" | "webp" {
  const ext = extname(path).toLowerCase().replace(/^\./, "");
  if (ext === "jpg") return "jpeg";
  if (ALLOWED_FORMATS.has(ext)) return ext as "png" | "jpeg" | "webp";
  return "png";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
