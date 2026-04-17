import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { callTool, extractText, extractImageUrl } from "../api.js";

function printResult(response: ReturnType<typeof extractText>, imageUrl: string | null) {
  if (imageUrl) {
    console.log(chalk.green("✓ Screenshot captured"));
    console.log(`  ${chalk.cyan(imageUrl)}`);
  }
  // Print any additional text (dimensions, etc)
  const text = typeof response === "string" ? response : "";
  const lines = text.split("\n").filter((l: string) => !l.startsWith("http"));
  if (lines.length > 0 && lines[0]) {
    console.log(chalk.dim(lines.join("\n")));
  }
}

export const screenshotCommand = new Command("screenshot")
  .description("Take a screenshot of a URL")
  .argument("<url>", "URL to screenshot")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("-h, --height <px>", "Viewport height", "800")
  .option("-f, --format <fmt>", "Image format (png, jpeg, webp)", "png")
  .option("--full-page", "Capture entire scrollable page", true)
  .option("--no-full-page", "Capture viewport only")
  .option("--delay <ms>", "Wait ms after page load", "0")
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const spinner = ora(`Capturing ${url}...`).start();
    try {
      const res = await callTool("take_screenshot", {
        url,
        width: parseInt(opts.width as string) || 1280,
        height: parseInt(opts.height as string) || 800,
        format: opts.format || "png",
        fullPage: opts.fullPage !== false,
        delay: parseInt(opts.delay as string) || 0,
      });
      spinner.stop();
      printResult(extractText(res), extractImageUrl(res));
    } catch (err) {
      spinner.fail(chalk.red("Screenshot failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const fullpageCommand = new Command("fullpage")
  .description("Capture the entire scrollable page with optional height cap")
  .argument("<url>", "URL to screenshot")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("-f, --format <fmt>", "Image format (png, jpeg, webp)", "png")
  .option("--max-height <px>", "Cap extremely tall full-page captures")
  .action(async (url: string, opts: Record<string, string>) => {
    const spinner = ora(`Capturing full-page screenshot of ${url}...`).start();
    try {
      const res = await callTool("screenshot_fullpage", {
        url,
        width: parseInt(opts.width, 10) || 1280,
        format: opts.format || "png",
        maxHeight: opts.maxHeight ? parseInt(opts.maxHeight, 10) : undefined,
      });
      spinner.stop();
      printResult(extractText(res), extractImageUrl(res));
    } catch (err) {
      spinner.fail(chalk.red("Full-page screenshot failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const responsiveCommand = new Command("responsive")
  .description("Capture at desktop, tablet, and mobile viewports")
  .argument("<url>", "URL to screenshot")
  .option("-f, --format <fmt>", "Image format", "png")
  .option("--full-page", "Capture full scrollable page", false)
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const spinner = ora(`Capturing responsive screenshots of ${url}...`).start();
    try {
      const res = await callTool("screenshot_responsive", {
        url,
        format: opts.format || "png",
        fullPage: !!opts.fullPage,
      });
      spinner.stop();
      const text = extractText(res);
      console.log(chalk.green("✓ Responsive screenshots captured"));
      // Extract all URLs from the response
      const urls = text.match(/https?:\/\/[^\s"]+\.(png|jpg|jpeg|webp)/gi) || [];
      urls.forEach((u: string) => console.log(`  ${chalk.cyan(u)}`));
      if (urls.length === 0) console.log(chalk.dim(text));
    } catch (err) {
      spinner.fail(chalk.red("Responsive screenshot failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const mobileCommand = new Command("mobile")
  .description("Screenshot at mobile viewport (393×852)")
  .argument("<url>", "URL to screenshot")
  .option("--full-page", "Capture full page", false)
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const spinner = ora(`Capturing mobile screenshot of ${url}...`).start();
    try {
      const res = await callTool("screenshot_mobile", { url, fullPage: !!opts.fullPage });
      spinner.stop();
      printResult(extractText(res), extractImageUrl(res));
    } catch (err) {
      spinner.fail(chalk.red("Mobile screenshot failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const tabletCommand = new Command("tablet")
  .description("Screenshot at tablet viewport (820×1180)")
  .argument("<url>", "URL to screenshot")
  .option("--full-page", "Capture full page", false)
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const spinner = ora(`Capturing tablet screenshot of ${url}...`).start();
    try {
      const res = await callTool("screenshot_tablet", { url, fullPage: !!opts.fullPage });
      spinner.stop();
      printResult(extractText(res), extractImageUrl(res));
    } catch (err) {
      spinner.fail(chalk.red("Tablet screenshot failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const darkCommand = new Command("dark")
  .description("Screenshot with dark mode emulated")
  .argument("<url>", "URL to screenshot")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("-h, --height <px>", "Viewport height", "800")
  .action(async (url: string, opts: Record<string, string>) => {
    const spinner = ora(`Capturing dark mode screenshot of ${url}...`).start();
    try {
      const res = await callTool("screenshot_dark", {
        url,
        width: parseInt(opts.width) || 1280,
        height: parseInt(opts.height) || 800,
      });
      spinner.stop();
      printResult(extractText(res), extractImageUrl(res));
    } catch (err) {
      spinner.fail(chalk.red("Dark screenshot failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const elementCommand = new Command("element")
  .description("Screenshot a specific element by CSS selector")
  .argument("<url>", "URL to screenshot")
  .requiredOption("-s, --selector <css>", "CSS selector of element to capture")
  .option("--delay <ms>", "Extra wait for SPAs", "0")
  .action(async (url: string, opts: Record<string, string>) => {
    const spinner = ora(`Capturing element "${opts.selector}" on ${url}...`).start();
    try {
      const res = await callTool("screenshot_element", {
        url,
        selector: opts.selector,
        delay: parseInt(opts.delay) || 0,
      });
      spinner.stop();
      printResult(extractText(res), extractImageUrl(res));
    } catch (err) {
      spinner.fail(chalk.red("Element screenshot failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const diffCommand = new Command("diff")
  .description("Compare two URLs pixel-by-pixel")
  .argument("<urlA>", "First URL (before)")
  .argument("<urlB>", "Second URL (after)")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("-h, --height <px>", "Viewport height", "800")
  .option("-t, --threshold <n>", "Color difference threshold (0=exact, 1=lenient)", "0.1")
  .action(async (urlA: string, urlB: string, opts: Record<string, string>) => {
    const spinner = ora(`Comparing ${urlA} vs ${urlB}...`).start();
    try {
      const res = await callTool("screenshot_diff", {
        urlA,
        urlB,
        width: parseInt(opts.width) || 1280,
        height: parseInt(opts.height) || 800,
        threshold: parseFloat(opts.threshold) || 0.1,
      });
      spinner.stop();
      const text = extractText(res);
      console.log(chalk.green("✓ Diff complete"));
      console.log(text);
    } catch (err) {
      spinner.fail(chalk.red("Diff failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const pdfCommand = new Command("pdf")
  .description("Export a webpage as PDF")
  .argument("<url>", "URL to export")
  .action(async (url: string) => {
    const spinner = ora(`Exporting ${url} as PDF...`).start();
    try {
      const res = await callTool("screenshot_pdf", { url });
      spinner.stop();
      const imageUrl = extractImageUrl(res);
      if (imageUrl) {
        console.log(chalk.green("✓ PDF exported"));
        console.log(`  ${chalk.cyan(imageUrl)}`);
      } else {
        console.log(extractText(res));
      }
    } catch (err) {
      spinner.fail(chalk.red("PDF export failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const crossBrowserCommand = new Command("cross-browser")
  .description("Capture in Chromium, Firefox, and WebKit simultaneously")
  .argument("<url>", "URL to screenshot")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("--full-page", "Capture full page", false)
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const spinner = ora(`Capturing cross-browser screenshots of ${url}...`).start();
    try {
      const res = await callTool("screenshot_cross_browser", {
        url,
        width: parseInt(opts.width as string) || 1280,
        fullPage: !!opts.fullPage,
      });
      spinner.stop();
      const text = extractText(res);
      console.log(chalk.green("✓ Cross-browser screenshots captured"));
      const urls = text.match(/https?:\/\/[^\s"]+\.(png|jpg|jpeg|webp)/gi) || [];
      urls.forEach((u: string) => console.log(`  ${chalk.cyan(u)}`));
      if (urls.length === 0) console.log(chalk.dim(text));
    } catch (err) {
      spinner.fail(chalk.red("Cross-browser screenshot failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const batchCommand = new Command("batch")
  .description("Screenshot multiple URLs at once (max 10)")
  .argument("<urls...>", "URLs to screenshot")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("--full-page", "Capture full page", false)
  .action(async (urls: string[], opts: Record<string, string | boolean>) => {
    const spinner = ora(`Capturing ${urls.length} screenshots...`).start();
    try {
      const res = await callTool("screenshot_batch", {
        urls,
        width: parseInt(opts.width as string) || 1280,
        fullPage: !!opts.fullPage,
      });
      spinner.stop();
      const text = extractText(res);
      console.log(chalk.green(`✓ ${urls.length} screenshots captured`));
      const imageUrls = text.match(/https?:\/\/[^\s"]+\.(png|jpg|jpeg|webp)/gi) || [];
      imageUrls.forEach((u: string) => console.log(`  ${chalk.cyan(u)}`));
      if (imageUrls.length === 0) console.log(chalk.dim(text));
    } catch (err) {
      spinner.fail(chalk.red("Batch screenshot failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const screenshotsCommand = new Command("screenshots")
  .description("List recent screenshot jobs and URLs")
  .option("-l, --limit <n>", "Number of screenshots to return", "5")
  .action(async (opts: Record<string, string>) => {
    const spinner = ora("Fetching recent screenshots...").start();
    try {
      const res = await callTool("list_recent_screenshots", {
        limit: parseInt(opts.limit, 10) || 5,
      });
      spinner.stop();
      console.log(chalk.green("✓ Recent screenshots"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to fetch recent screenshots"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const screenshotStatusCommand = new Command("screenshot:status")
  .description("Check the status of a screenshot job by ID")
  .argument("<id>", "Screenshot job ID")
  .action(async (id: string) => {
    const spinner = ora(`Checking screenshot job ${id}...`).start();
    try {
      const res = await callTool("get_screenshot_status", { id });
      spinner.stop();
      console.log(chalk.green("✓ Screenshot status"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to check screenshot status"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });
