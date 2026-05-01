import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { callTool, extractText } from "../api.js";

function requireSessionId(text: string): string {
  const sessionMatch = text.match(/Session ID:\s*(\S+)/);
  if (!sessionMatch) throw new Error("Failed to start browser session");
  return sessionMatch[1];
}

export const uxReviewCommand = new Command("review")
  .description("Run an AI-powered UX review on a URL")
  .argument("<url>", "URL to review")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("-h, --height <px>", "Viewport height", "800")
  .action(async (url: string, opts: Record<string, string>) => {
    const spinner = ora(`Running UX review on ${url}...`).start();
    try {
      const res = await callTool("ux_review", {
        url,
        width: parseInt(opts.width) || 1280,
        height: parseInt(opts.height) || 800,
      });
      spinner.stop();
      console.log(chalk.green("✓ UX Review complete\n"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("UX review failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const seoCommand = new Command("seo")
  .description("Extract SEO metadata from a URL")
  .argument("<url>", "URL to audit")
  .action(async (url: string) => {
    const spinner = ora(`Running SEO audit on ${url}...`).start();
    try {
      // Need a browser session for SEO audit
      const navRes = await callTool("browser_navigate", {
        url,
        task_type: "seo_scan",
        user_goal: `Review SEO metadata and page structure for ${url}`,
        auth_scope: "out",
        tool_path: "cli",
        page_set: [url],
        required_evidence: ["screenshots", "console", "network", "seo"],
      });
      const sessionId = requireSessionId(extractText(navRes));

      const res = await callTool("browser_seo_audit", { sessionId });
      spinner.stop();
      console.log(chalk.green("✓ SEO Audit\n"));
      console.log(extractText(res));

      // Close the session
      await callTool("browser_close", { sessionId }).catch(() => {});
    } catch (err) {
      spinner.fail(chalk.red("SEO audit failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const perfCommand = new Command("perf")
  .description("Get Core Web Vitals and performance metrics")
  .argument("<url>", "URL to measure")
  .action(async (url: string) => {
    const spinner = ora(`Measuring performance of ${url}...`).start();
    try {
      const navRes = await callTool("browser_navigate", {
        url,
        task_type: "performance_audit",
        user_goal: `Measure page performance and review related failures for ${url}`,
        workflow_name: "sitewide-performance-audit",
        workflow_required: true,
        auth_scope: "out",
        tool_path: "cli",
        page_set: [url],
        required_evidence: ["screenshots", "console", "network", "perf"],
      });
      const sessionId = requireSessionId(extractText(navRes));

      const res = await callTool("browser_perf_metrics", { sessionId });
      spinner.stop();
      console.log(chalk.green("✓ Performance Metrics\n"));
      console.log(extractText(res));

      await callTool("browser_close", { sessionId }).catch(() => {});
    } catch (err) {
      spinner.fail(chalk.red("Performance measurement failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const a11yCommand = new Command("a11y")
  .description("Get accessibility tree for a URL")
  .argument("<url>", "URL to analyze")
  .option("--full", "Include all nodes, not just interesting ones", false)
  .action(async (url: string, opts: Record<string, boolean>) => {
    const spinner = ora(`Analyzing accessibility of ${url}...`).start();
    try {
      const res = await callTool("accessibility_snapshot", {
        url,
        interestingOnly: !opts.full,
      });
      spinner.stop();
      console.log(chalk.green("✓ Accessibility Tree\n"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Accessibility analysis failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const ogPreviewCommand = new Command("og-preview")
  .description("Preview how a URL looks when shared on social media (OG tags + mockup)")
  .argument("<url>", "URL to preview")
  .option("-p, --platform <name>", "Platform: twitter, facebook, linkedin, slack, all", "all")
  .action(async (url: string, opts: Record<string, string>) => {
    const spinner = ora(`Generating OG preview for ${url}...`).start();
    try {
      const res = await callTool("og_preview", {
        url,
        platform: opts.platform || "all",
      });
      spinner.stop();
      console.log(chalk.green("✓ OG Preview\n"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("OG preview failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const ocrCommand = new Command("ocr")
  .description("Extract text from an image using AI vision (OCR)")
  .argument("[imageUrl]", "Public URL of the image to extract text from")
  .option("--session <sessionId>", "Use a browser session screenshot instead of a URL")
  .option("-s, --selector <css>", "CSS selector to screenshot a specific element (requires --session)")
  .option("-p, --prompt <text>", "Custom prompt for the vision model")
  .action(async (imageUrl: string | undefined, opts: Record<string, string>) => {
    if (!imageUrl && !opts.session) {
      console.error(chalk.red("Provide an image URL or --session <sessionId>"));
      process.exit(1);
    }
    const spinner = ora("Extracting text from image...").start();
    try {
      const res = await callTool("extract_text_from_image", {
        image_url: imageUrl,
        sessionId: opts.session,
        selector: opts.selector,
        prompt: opts.prompt,
      });
      spinner.stop();
      console.log(chalk.green("✓ OCR complete\n"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("OCR failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const breakpointsCommand = new Command("breakpoints")
  .description("Detect responsive layout breakpoints")
  .argument("<url>", "URL to analyze")
  .action(async (url: string) => {
    const spinner = ora(`Detecting breakpoints for ${url}...`).start();
    try {
      const res = await callTool("find_breakpoints", { url });
      spinner.stop();
      console.log(chalk.green("✓ Breakpoints detected\n"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Breakpoint detection failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });
