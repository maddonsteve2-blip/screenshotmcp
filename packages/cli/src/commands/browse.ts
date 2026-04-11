import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { callTool, extractText, extractImageUrl } from "../api.js";

export const browseCommand = new Command("browse")
  .description("Open a browser session and navigate to a URL")
  .argument("<url>", "URL to navigate to")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("-h, --height <px>", "Viewport height", "800")
  .option("--record", "Record a video of the session")
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const spinner = ora(`Opening browser to ${url}...`).start();
    try {
      const res = await callTool("browser_navigate", {
        url,
        width: parseInt(opts.width as string) || 1280,
        height: parseInt(opts.height as string) || 800,
        record_video: !!opts.record,
      });
      spinner.stop();
      const text = extractText(res);
      console.log(chalk.green("✓ Browser session started"));
      // Extract session ID from response
      const sessionMatch = text.match(/Session ID:\s*(\S+)/);
      if (sessionMatch) {
        console.log(`  Session: ${chalk.cyan(sessionMatch[1])}`);
      }
      const imageUrl = extractImageUrl(res);
      if (imageUrl) console.log(`  Screenshot: ${chalk.cyan(imageUrl)}`);
      if (opts.record) console.log(chalk.yellow("  🔴 Recording — use `smcp browse:close <sessionId>` to stop and get the video"));
      console.log(chalk.dim("\nUse browser sub-commands with the session ID:"));
      console.log(chalk.dim("  smcp browse:click <sessionId> <selector>"));
      console.log(chalk.dim("  smcp browse:fill <sessionId> <selector> <value>"));
      console.log(chalk.dim("  smcp browse:screenshot <sessionId>"));
      console.log(chalk.dim("  smcp browse:close <sessionId>"));
    } catch (err) {
      spinner.fail(chalk.red("Browse failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const browseClickCommand = new Command("browse:click")
  .description("Click an element in a browser session")
  .argument("<sessionId>", "Session ID")
  .argument("<selector>", "CSS selector or visible text to click")
  .action(async (sessionId: string, selector: string) => {
    const spinner = ora("Clicking...").start();
    try {
      const res = await callTool("browser_click", { sessionId, selector });
      spinner.stop();
      const imageUrl = extractImageUrl(res);
      console.log(chalk.green("✓ Clicked"));
      if (imageUrl) console.log(`  Screenshot: ${chalk.cyan(imageUrl)}`);
    } catch (err) {
      spinner.fail(chalk.red("Click failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseFillCommand = new Command("browse:fill")
  .description("Type text into an input field")
  .argument("<sessionId>", "Session ID")
  .argument("<selector>", "CSS selector for the input")
  .argument("<value>", "Text to type")
  .action(async (sessionId: string, selector: string, value: string) => {
    const spinner = ora("Filling...").start();
    try {
      const res = await callTool("browser_fill", { sessionId, selector, value });
      spinner.stop();
      console.log(chalk.green("✓ Filled"));
      const imageUrl = extractImageUrl(res);
      if (imageUrl) console.log(`  Screenshot: ${chalk.cyan(imageUrl)}`);
    } catch (err) {
      spinner.fail(chalk.red("Fill failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseScreenshotCommand = new Command("browse:screenshot")
  .description("Take a screenshot of the current browser page")
  .argument("<sessionId>", "Session ID")
  .action(async (sessionId: string) => {
    const spinner = ora("Capturing...").start();
    try {
      const res = await callTool("browser_screenshot", { sessionId });
      spinner.stop();
      const imageUrl = extractImageUrl(res);
      console.log(chalk.green("✓ Screenshot captured"));
      if (imageUrl) console.log(`  ${chalk.cyan(imageUrl)}`);
    } catch (err) {
      spinner.fail(chalk.red("Screenshot failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseCloseCommand = new Command("browse:close")
  .description("Close a browser session")
  .argument("<sessionId>", "Session ID")
  .action(async (sessionId: string) => {
    const spinner = ora("Closing session...").start();
    try {
      const res = await callTool("browser_close", { sessionId });
      spinner.stop();
      const text = extractText(res);
      console.log(chalk.green("✓ Session closed"));
      const videoUrl = text.match(/https?:\/\/[^\s"]+\.webm/i);
      if (videoUrl) {
        console.log(`  🎬 Video: ${chalk.cyan(videoUrl[0])}`);
      }
    } catch (err) {
      spinner.fail(chalk.red("Close failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseNavigateCommand = new Command("browse:goto")
  .description("Navigate to a new URL in an existing session")
  .argument("<sessionId>", "Session ID")
  .argument("<url>", "URL to navigate to")
  .action(async (sessionId: string, url: string) => {
    const spinner = ora(`Navigating to ${url}...`).start();
    try {
      const res = await callTool("browser_navigate", { sessionId, url });
      spinner.stop();
      console.log(chalk.green("✓ Navigated"));
      const imageUrl = extractImageUrl(res);
      if (imageUrl) console.log(`  Screenshot: ${chalk.cyan(imageUrl)}`);
    } catch (err) {
      spinner.fail(chalk.red("Navigation failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseScrollCommand = new Command("browse:scroll")
  .description("Scroll the page")
  .argument("<sessionId>", "Session ID")
  .option("-y, --y <px>", "Vertical scroll amount (positive = down)", "500")
  .action(async (sessionId: string, opts: Record<string, string>) => {
    try {
      const res = await callTool("browser_scroll", { sessionId, y: parseInt(opts.y) || 500 });
      console.log(chalk.green("✓ Scrolled"));
      const imageUrl = extractImageUrl(res);
      if (imageUrl) console.log(`  Screenshot: ${chalk.cyan(imageUrl)}`);
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseKeyCommand = new Command("browse:key")
  .description("Press a keyboard key")
  .argument("<sessionId>", "Session ID")
  .argument("<key>", "Key to press (Enter, Tab, Escape, etc.)")
  .action(async (sessionId: string, key: string) => {
    try {
      const res = await callTool("browser_press_key", { sessionId, key });
      console.log(chalk.green(`✓ Pressed ${key}`));
      const imageUrl = extractImageUrl(res);
      if (imageUrl) console.log(`  Screenshot: ${chalk.cyan(imageUrl)}`);
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseTextCommand = new Command("browse:text")
  .description("Get visible text from the page")
  .argument("<sessionId>", "Session ID")
  .option("-s, --selector <css>", "Limit to specific element")
  .action(async (sessionId: string, opts: Record<string, string>) => {
    try {
      const res = await callTool("browser_get_text", { sessionId, selector: opts.selector });
      console.log(extractText(res));
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseHtmlCommand = new Command("browse:html")
  .description("Get HTML from the page")
  .argument("<sessionId>", "Session ID")
  .option("-s, --selector <css>", "Limit to specific element")
  .action(async (sessionId: string, opts: Record<string, string>) => {
    try {
      const res = await callTool("browser_get_html", { sessionId, selector: opts.selector });
      console.log(extractText(res));
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });
