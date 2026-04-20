import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { spawn } from "node:child_process";
import { callTool, extractImageUrl, extractText } from "../api.js";

/**
 * One-shot capture + share. Captures the URL, prints the CDN image link,
 * copies it to the system clipboard if a copy helper is available, and
 * optionally opens it in the user's browser.
 */
export const shareCommand = new Command("share")
  .description("Capture a URL and copy the resulting image link to the clipboard")
  .argument("<url>", "URL to capture")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("-h, --height <px>", "Viewport height", "800")
  .option("--fullPage", "Capture the entire scrollable page")
  .option("--no-clipboard", "Skip copying to clipboard")
  .option("--open", "Open the image in your default browser after capture")
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const width = Number.parseInt(String(opts.width ?? "1280"), 10) || 1280;
    const height = Number.parseInt(String(opts.height ?? "800"), 10) || 800;
    const fullPage = Boolean(opts.fullPage);
    const useClipboard = opts.clipboard !== false;
    const shouldOpen = Boolean(opts.open);

    const spinner = ora(`Capturing ${url}\u2026`).start();
    let imageUrl: string | null = null;
    try {
      const res = await callTool("take_screenshot", {
        url,
        width,
        height,
        fullPage,
        format: "png",
      });
      imageUrl = extractImageUrl(res);
      if (!imageUrl) {
        spinner.fail("Capture succeeded but no image URL was returned.");
        console.error(extractText(res));
        process.exit(1);
        return;
      }
      spinner.succeed(`Captured ${url}`);
      console.log(`  ${chalk.cyan(imageUrl)}`);
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : String(err));
      process.exit(1);
      return;
    }

    if (useClipboard && imageUrl) {
      const copied = await copyToClipboard(imageUrl);
      if (copied) {
        console.log(chalk.dim("  copied to clipboard"));
      } else {
        console.log(chalk.dim("  (clipboard helper not found; pass --no-clipboard to silence)"));
      }
    }

    if (shouldOpen && imageUrl) {
      try {
        // Lazy-import `open` so we don't pay startup cost on every CLI call.
        const { default: openBrowser } = await import("open");
        await openBrowser(imageUrl);
        console.log(chalk.dim("  opened in browser"));
      } catch (err) {
        console.log(chalk.yellow(`  could not open browser: ${err instanceof Error ? err.message : String(err)}`));
      }
    }
  });

/**
 * Best-effort clipboard write using the platform-native helper. Returns
 * `true` on success, `false` if no helper was available or the spawn
 * exited non-zero. Never throws so callers can degrade gracefully.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  const platform = process.platform;
  const candidates: Array<{ cmd: string; args: string[] }> = platform === "darwin"
    ? [{ cmd: "pbcopy", args: [] }]
    : platform === "win32"
      ? [{ cmd: "clip", args: [] }]
      : [
          { cmd: "wl-copy", args: [] },
          { cmd: "xclip", args: ["-selection", "clipboard"] },
          { cmd: "xsel", args: ["--clipboard", "--input"] },
        ];

  for (const { cmd, args } of candidates) {
    const ok = await tryCopy(cmd, args, text);
    if (ok) return true;
  }
  return false;
}

function tryCopy(cmd: string, args: string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
      child.stdin.end(text);
    } catch {
      resolve(false);
    }
  });
}
