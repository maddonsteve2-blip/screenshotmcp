import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { callTool, extractText } from "../api.js";

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
      const navRes = await callTool("browser_navigate", { url });
      const text = extractText(navRes);
      const sessionMatch = text.match(/Session ID:\s*(\S+)/);
      if (!sessionMatch) throw new Error("Failed to start browser session");

      const res = await callTool("browser_seo_audit", { sessionId: sessionMatch[1] });
      spinner.stop();
      console.log(chalk.green("✓ SEO Audit\n"));
      console.log(extractText(res));

      // Close the session
      await callTool("browser_close", { sessionId: sessionMatch[1] }).catch(() => {});
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
      const navRes = await callTool("browser_navigate", { url });
      const text = extractText(navRes);
      const sessionMatch = text.match(/Session ID:\s*(\S+)/);
      if (!sessionMatch) throw new Error("Failed to start browser session");

      const res = await callTool("browser_perf_metrics", { sessionId: sessionMatch[1] });
      spinner.stop();
      console.log(chalk.green("✓ Performance Metrics\n"));
      console.log(extractText(res));

      await callTool("browser_close", { sessionId: sessionMatch[1] }).catch(() => {});
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
