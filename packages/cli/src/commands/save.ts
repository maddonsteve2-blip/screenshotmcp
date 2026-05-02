import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { callTool, extractImageUrl, extractText } from "../api.js";

const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);

/**
 * Capture a URL and write the resulting image bytes to a local file in one
 * shot. Bridges the gap between `screenshot` (prints URL) and what most users
 * actually want when scripting ("give me the file").
 */
export const saveCommand = new Command("save")
  .description("Capture a URL (or every URL in .deepsyte/urls.json) and download the image locally")
  .argument("[url]", "URL to capture (omit when using --batch)")
  .option("-t, --to <path>", "Output file path (single mode) or directory (batch mode)")
  .option("--batch", "Read URLs from .deepsyte/urls.json and save each one to --to directory")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("-h, --height <px>", "Viewport height", "800")
  .option("--fullPage", "Capture the entire scrollable page", false)
  .option("--delay <ms>", "Wait N ms after page load before capturing", "0")
  .option("--concurrency <n>", "Max parallel captures in batch mode", "3")
  .option("--manifest <path>", "Batch mode: write a JSON manifest of every saved file to this path")
  .action(async (url: string | undefined, opts: Record<string, string | boolean>) => {
    const width = Number.parseInt(String(opts.width ?? "1280"), 10) || 1280;
    const height = Number.parseInt(String(opts.height ?? "800"), 10) || 800;
    const delay = Number.parseInt(String(opts.delay ?? "0"), 10) || 0;
    const fullPage = Boolean(opts.fullPage);
    const batchMode = Boolean(opts.batch);

    if (batchMode) {
      await runBatch({
        outDir: typeof opts.to === "string" && opts.to ? opts.to : "./shots",
        width,
        height,
        fullPage,
        delay,
        concurrency: Math.max(1, Number.parseInt(String(opts.concurrency ?? "3"), 10) || 3),
        manifestPath: typeof opts.manifest === "string" && opts.manifest ? opts.manifest : undefined,
      });
      return;
    }

    if (!url) {
      console.error(chalk.red("URL is required when not using --batch."));
      process.exit(2);
      return;
    }
    if (!opts.to) {
      console.error(chalk.red("-t/--to <path> is required in single mode."));
      process.exit(2);
      return;
    }
    const out = resolve(process.cwd(), String(opts.to));
    await captureOne({ url, out, width, height, fullPage, delay });
  });

interface CaptureOpts {
  url: string;
  out: string;
  width: number;
  height: number;
  fullPage: boolean;
  delay: number;
}

async function captureOne(opts: CaptureOpts): Promise<void> {
  const { url, out, width, height, fullPage, delay } = opts;
  const spinner = ora(`Capturing ${url}\u2026`).start();
  try {
    const res = await callTool("take_screenshot", {
      url,
      width,
      height,
      fullPage,
      delay,
      format: inferFormat(out),
    });
    const imageUrl = extractImageUrl(res);
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
}

interface BatchOpts {
  outDir: string;
  width: number;
  height: number;
  fullPage: boolean;
  delay: number;
  concurrency: number;
  manifestPath?: string;
}

interface ManifestEntry {
  url: string;
  file: string;
  relativeFile: string;
  bytes: number;
  sourceUrl: string;
  capturedAt: string;
}

async function runBatch(opts: BatchOpts): Promise<void> {
  const entries = await loadUrlsForBatch();
  if (entries.length === 0) {
    console.error(chalk.red("No URLs found in .deepsyte/urls.json. Run `deepsyte init` first."));
    process.exit(1);
    return;
  }
  const outDir = resolve(process.cwd(), opts.outDir);
  await mkdir(outDir, { recursive: true });
  console.log(chalk.bold(`Capturing ${entries.length} URL${entries.length === 1 ? "" : "s"} to ${chalk.cyan(outDir)}\n`));

  const manifest: ManifestEntry[] = [];
  let index = 0;
  let successes = 0;
  let failures = 0;
  const run = async () => {
    while (index < entries.length) {
      const i = index++;
      const entry = entries[i];
      const filename = `${filenameFor(entry.url)}.png`;
      const out = join(outDir, filename);
      try {
        const res = await callTool("take_screenshot", {
          url: entry.url,
          width: opts.width,
          height: opts.height,
          fullPage: opts.fullPage,
          delay: opts.delay,
          format: "png",
        });
        const imageUrl = extractImageUrl(res);
        if (!imageUrl) {
          console.log(`  ${chalk.red("\u2717")} ${entry.url} \u2014 no image URL`);
          failures++;
          continue;
        }
        const fetched = await fetch(imageUrl);
        if (!fetched.ok) {
          console.log(`  ${chalk.red("\u2717")} ${entry.url} \u2014 HTTP ${fetched.status}`);
          failures++;
          continue;
        }
        const buffer = Buffer.from(await fetched.arrayBuffer());
        await writeFile(out, buffer);
        console.log(`  ${chalk.green("\u2713")} ${entry.url} \u2192 ${chalk.dim(filename)} (${formatBytes(buffer.length)})`);
        successes++;
        manifest.push({
          url: entry.url,
          file: out,
          relativeFile: join(opts.outDir, filename).replace(/\\/g, "/"),
          bytes: buffer.length,
          sourceUrl: imageUrl,
          capturedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.log(`  ${chalk.red("\u2717")} ${entry.url} \u2014 ${err instanceof Error ? err.message : String(err)}`);
        failures++;
      }
    }
  };
  const workers = Array.from({ length: Math.min(opts.concurrency, entries.length) }, () => run());
  await Promise.all(workers);

  if (opts.manifestPath) {
    const manifestOut = resolve(process.cwd(), opts.manifestPath);
    await mkdir(dirname(manifestOut), { recursive: true });
    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      outDir: opts.outDir,
      captures: manifest.sort((a, b) => a.url.localeCompare(b.url)),
    };
    await writeFile(manifestOut, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log(`\nManifest written \u2192 ${chalk.cyan(manifestOut)}`);
  }

  console.log("");
  if (failures === 0) {
    console.log(chalk.green.bold(`All ${successes} captures saved.`));
  } else {
    console.log(chalk.yellow.bold(`${successes} saved, ${failures} failed.`));
    if (successes === 0) process.exit(1);
  }
}

async function loadUrlsForBatch(): Promise<Array<{ url: string }>> {
  const path = resolve(process.cwd(), ".deepsyte/urls.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).urls)
      ? ((parsed as Record<string, unknown>).urls as unknown[])
      : [];
  const urls = new Set<string>();
  for (const entry of list) {
    if (typeof entry === "string" && isHttpUrl(entry)) urls.add(entry);
    else if (entry && typeof entry === "object") {
      const url = (entry as Record<string, unknown>).url;
      if (typeof url === "string" && isHttpUrl(url)) urls.add(url);
    }
  }
  return Array.from(urls).map((url) => ({ url }));
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function filenameFor(url: string): string {
  // Prefer a human-readable slug; fall back to a short hash for weirdly-shaped URLs.
  const slug = url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
  if (slug.length >= 3) return slug;
  return createHash("sha1").update(url).digest("hex").slice(0, 12);
}

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
