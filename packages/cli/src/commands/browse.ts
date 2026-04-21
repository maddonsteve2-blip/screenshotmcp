import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { callTool, extractText, extractImageUrl } from "../api.js";

function splitList(value: string | boolean | undefined) {
  if (typeof value !== "string") return undefined;
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function printRemoteBrowserResult(label: string, response: Awaited<ReturnType<typeof callTool>>) {
  console.log(chalk.green(label));
  const imageUrl = extractImageUrl(response);
  if (imageUrl) {
    console.log(`  Screenshot: ${chalk.cyan(imageUrl)}`);
  }
  const text = extractText(response);
  if (text) {
    console.log(text);
  }
}

export const browseCommand = new Command("browse")
  .description("Open a browser session and navigate to a URL")
  .argument("<url>", "URL to navigate to")
  .option("-w, --width <px>", "Viewport width", "1280")
  .option("-h, --height <px>", "Viewport height", "800")
  .option("--record", "Record a video of the session")
  .option("--task-type <taskType>", "Task type for workflow-aware run outcomes, e.g. site_audit")
  .option("--user-goal <goal>", "Plain-language goal shown in the run UI summary")
  .option("--workflow-name <workflow>", "Workflow name used for the run, e.g. sitewide-performance-audit")
  .option("--workflow-required", "Mark workflow compliance as required for the run")
  .option("--auth-scope <scope>", "Auth scope for the run contract: in, out, mixed, or unknown")
  .option("--page-set <pages>", "Comma-separated representative page set for workflow-driven runs")
  .option("--required-evidence <types>", "Comma-separated required evidence types, e.g. screenshots,console,network")
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const spinner = ora(`Opening browser to ${url}...`).start();
    try {
      const res = await callTool("browser_navigate", {
        url,
        width: parseInt(opts.width as string) || 1280,
        height: parseInt(opts.height as string) || 800,
        record_video: !!opts.record,
        task_type: typeof opts.taskType === "string" ? opts.taskType : undefined,
        user_goal: typeof opts.userGoal === "string" ? opts.userGoal : undefined,
        workflow_name: typeof opts.workflowName === "string" ? opts.workflowName : undefined,
        workflow_required: !!opts.workflowRequired,
        auth_scope: typeof opts.authScope === "string" ? opts.authScope : undefined,
        tool_path: "cli",
        page_set: splitList(opts.pageSet),
        required_evidence: splitList(opts.requiredEvidence),
      });
      spinner.stop();
      const text = extractText(res);
      console.log(chalk.green("✓ Browser session started"));
      // Extract session ID from response
      const sessionMatch = text.match(/Session ID:\s*(\S+)/);
      if (sessionMatch) {
        console.log(`  Session: ${chalk.cyan(sessionMatch[1])}`);
      }
      const runUrlMatch = text.match(/Run URL:\s*(\S+)/);
      if (runUrlMatch) {
        console.log(`  Run URL: ${chalk.cyan(runUrlMatch[1])}  ${chalk.dim("(share this with the user at the end of the task)")}`);
      }
      const imageUrl = extractImageUrl(res);
      if (imageUrl) console.log(`  Screenshot: ${chalk.cyan(imageUrl)}`);
      if (opts.record) console.log(chalk.yellow("  🔴 Recording — use `smcp browse:close <sessionId>` to stop and get the video"));
      if (opts.workflowName || opts.userGoal || opts.taskType) {
        console.log(chalk.dim("  Outcome context saved for run summaries"));
      }
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

export const browseViewportCommand = new Command("browse:viewport")
  .description("Resize the viewport in an existing browser session")
  .argument("<sessionId>", "Session ID")
  .argument("<width>", "Viewport width in pixels")
  .argument("<height>", "Viewport height in pixels")
  .action(async (sessionId: string, width: string, height: string) => {
    const spinner = ora(`Resizing viewport to ${width}x${height}...`).start();
    try {
      const res = await callTool("browser_set_viewport", {
        sessionId,
        width: parseInt(width, 10),
        height: parseInt(height, 10),
      });
      spinner.stop();
      printRemoteBrowserResult("✓ Viewport updated", res);
    } catch (err) {
      spinner.fail(chalk.red("Viewport update failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
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

export const browseClickAtCommand = new Command("browse:click-at")
  .description("Click viewport coordinates in a browser session")
  .argument("<sessionId>", "Session ID")
  .argument("<x>", "X coordinate in pixels")
  .argument("<y>", "Y coordinate in pixels")
  .option("--click-count <count>", "Number of clicks", "1")
  .option("--delay <ms>", "Delay between mouse down and mouse up", "50")
  .action(async (sessionId: string, x: string, y: string, opts: Record<string, string>) => {
    const spinner = ora("Clicking coordinates...").start();
    try {
      const res = await callTool("browser_click_at", {
        sessionId,
        x: parseInt(x, 10),
        y: parseInt(y, 10),
        clickCount: parseInt(opts.clickCount, 10) || 1,
        delay: parseInt(opts.delay, 10) || 50,
      });
      spinner.stop();
      printRemoteBrowserResult("✓ Coordinate click completed", res);
    } catch (err) {
      spinner.fail(chalk.red("Coordinate click failed"));
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

export const browseHoverCommand = new Command("browse:hover")
  .description("Hover over an element in a browser session")
  .argument("<sessionId>", "Session ID")
  .argument("<selector>", "CSS selector for the element")
  .action(async (sessionId: string, selector: string) => {
    const spinner = ora("Hovering...").start();
    try {
      const res = await callTool("browser_hover", { sessionId, selector });
      spinner.stop();
      printRemoteBrowserResult("✓ Hover completed", res);
    } catch (err) {
      spinner.fail(chalk.red("Hover failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseSelectCommand = new Command("browse:select")
  .description("Select an option from a dropdown in a browser session")
  .argument("<sessionId>", "Session ID")
  .argument("<selector>", "CSS selector for the select element")
  .argument("<value>", "Option value or visible text")
  .action(async (sessionId: string, selector: string, value: string) => {
    const spinner = ora("Selecting option...").start();
    try {
      const res = await callTool("browser_select_option", { sessionId, selector, value });
      spinner.stop();
      printRemoteBrowserResult("✓ Selection completed", res);
    } catch (err) {
      spinner.fail(chalk.red("Selection failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseWaitForCommand = new Command("browse:wait-for")
  .description("Wait for an element to appear in a browser session")
  .argument("<sessionId>", "Session ID")
  .argument("<selector>", "CSS selector to wait for")
  .option("-t, --timeout <ms>", "Maximum wait time in milliseconds", "5000")
  .action(async (sessionId: string, selector: string, opts: Record<string, string>) => {
    const spinner = ora(`Waiting for ${selector}...`).start();
    try {
      const res = await callTool("browser_wait_for", {
        sessionId,
        selector,
        timeout: parseInt(opts.timeout, 10) || 5000,
      });
      spinner.stop();
      printRemoteBrowserResult("✓ Wait completed", res);
    } catch (err) {
      spinner.fail(chalk.red("Wait failed"));
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
      const runUrlMatch = text.match(/Run URL:\s*(\S+)/);
      if (runUrlMatch) {
        console.log(`  Run URL: ${chalk.cyan(runUrlMatch[1])}  ${chalk.dim("(share this with the user)")}`);
      }
      const shareUrlMatch = text.match(/Share URL:\s*(\S+)/);
      if (shareUrlMatch) {
        console.log(`  Share URL: ${chalk.cyan(shareUrlMatch[1])}  ${chalk.dim("(public link for teammates)")}`);
      }
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

export const browseBackCommand = new Command("browse:back")
  .description("Navigate backward in browser history")
  .argument("<sessionId>", "Session ID")
  .action(async (sessionId: string) => {
    const spinner = ora("Navigating back...").start();
    try {
      const res = await callTool("browser_go_back", { sessionId });
      spinner.stop();
      printRemoteBrowserResult("✓ Navigated back", res);
    } catch (err) {
      spinner.fail(chalk.red("Back navigation failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseForwardCommand = new Command("browse:forward")
  .description("Navigate forward in browser history")
  .argument("<sessionId>", "Session ID")
  .action(async (sessionId: string) => {
    const spinner = ora("Navigating forward...").start();
    try {
      const res = await callTool("browser_go_forward", { sessionId });
      spinner.stop();
      printRemoteBrowserResult("✓ Navigated forward", res);
    } catch (err) {
      spinner.fail(chalk.red("Forward navigation failed"));
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

export const browseA11yCommand = new Command("browse:a11y")
  .description("Get the accessibility tree from a browser session")
  .argument("<sessionId>", "Session ID")
  .option("--max-depth <depth>", "Maximum tree depth to return", "8")
  .option("--full", "Return the full tree instead of only interesting UX nodes", false)
  .action(async (sessionId: string, opts: Record<string, string | boolean>) => {
    const spinner = ora("Collecting accessibility tree...").start();
    try {
      const res = await callTool("browser_get_accessibility_tree", {
        sessionId,
        maxDepth: parseInt(String(opts.maxDepth || "8"), 10) || 8,
        interestingOnly: !opts.full,
      });
      spinner.stop();
      console.log(chalk.green("✓ Accessibility tree"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Accessibility tree failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseHtmlCommand = new Command("browse:html")
  .description("Get HTML from the page")
  .argument("<sessionId>", "Session ID")
  .option("-s, --selector <css>", "Limit to specific element")
  .option("--inner", "Return innerHTML instead of outerHTML", false)
  .action(async (sessionId: string, opts: Record<string, string | boolean>) => {
    try {
      const res = await callTool("browser_get_html", { sessionId, selector: opts.selector, outer: !opts.inner });
      console.log(extractText(res));
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseEvalCommand = new Command("browse:eval")
  .description("Run JavaScript in a browser session")
  .argument("<sessionId>", "Session ID")
  .argument("<script>", "JavaScript expression to evaluate")
  .action(async (sessionId: string, script: string) => {
    const spinner = ora("Evaluating script...").start();
    try {
      const res = await callTool("browser_evaluate", { sessionId, script });
      spinner.stop();
      console.log(chalk.green("✓ Script evaluated"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Script evaluation failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseConsoleCommand = new Command("browse:console")
  .description("Get console logs from a browser session")
  .argument("<sessionId>", "Session ID")
  .option("--level <level>", "Filter by level: all, error, warning, log, exception", "all")
  .option("--limit <count>", "Maximum number of log entries to return", "50")
  .action(async (sessionId: string, opts: Record<string, string>) => {
    const spinner = ora("Collecting console logs...").start();
    try {
      const res = await callTool("browser_console_logs", {
        sessionId,
        level: opts.level || "all",
        limit: parseInt(opts.limit, 10) || 50,
      });
      spinner.stop();
      console.log(chalk.green("✓ Console logs"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Console log retrieval failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseNetworkErrorsCommand = new Command("browse:network-errors")
  .description("Get failed network requests from a browser session")
  .argument("<sessionId>", "Session ID")
  .option("--limit <count>", "Maximum number of failed requests to return", "50")
  .action(async (sessionId: string, opts: Record<string, string>) => {
    const spinner = ora("Collecting network errors...").start();
    try {
      const res = await callTool("browser_network_errors", {
        sessionId,
        limit: parseInt(opts.limit, 10) || 50,
      });
      spinner.stop();
      console.log(chalk.green("✓ Network errors"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Network error retrieval failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseNetworkRequestsCommand = new Command("browse:network-requests")
  .description("Get the network waterfall from a browser session")
  .argument("<sessionId>", "Session ID")
  .option("--resource-type <type>", "Filter by resource type")
  .option("--min-duration <ms>", "Only show requests slower than this", "0")
  .option("--limit <count>", "Maximum number of requests to return", "100")
  .action(async (sessionId: string, opts: Record<string, string>) => {
    const spinner = ora("Collecting network requests...").start();
    try {
      const res = await callTool("browser_network_requests", {
        sessionId,
        resourceType: opts.resourceType,
        minDuration: parseInt(opts.minDuration, 10) || 0,
        limit: parseInt(opts.limit, 10) || 100,
      });
      spinner.stop();
      console.log(chalk.green("✓ Network requests"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Network request retrieval failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseCookiesCommand = new Command("browse:cookies")
  .description("Get, set, or clear cookies in a browser session")
  .argument("<sessionId>", "Session ID")
  .argument("<action>", "Action: get, set, clear")
  .argument("[cookiesJson]", "JSON array of cookies for the set action")
  .action(async (sessionId: string, action: string, cookiesJson?: string) => {
    const spinner = ora("Updating cookies...").start();
    try {
      const cookies = action === "set" && cookiesJson ? JSON.parse(cookiesJson) : undefined;
      const res = await callTool("browser_cookies", {
        sessionId,
        action,
        cookies,
      });
      spinner.stop();
      console.log(chalk.green("✓ Cookie command completed"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Cookie command failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseStorageCommand = new Command("browse:storage")
  .description("Read or write localStorage/sessionStorage in a browser session")
  .argument("<sessionId>", "Session ID")
  .argument("<action>", "Action: get, getAll, set, remove, clear")
  .argument("[key]", "Storage key for get, set, or remove")
  .argument("[value]", "Value for the set action")
  .option("--type <storageType>", "Storage area: localStorage or sessionStorage", "localStorage")
  .action(async (sessionId: string, action: string, key: string | undefined, value: string | undefined, opts: Record<string, string>) => {
    const spinner = ora("Updating storage...").start();
    try {
      const res = await callTool("browser_storage", {
        sessionId,
        action,
        key,
        value,
        storageType: opts.type || "localStorage",
      });
      spinner.stop();
      console.log(chalk.green("✓ Storage command completed"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Storage command failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseSeoCommand = new Command("browse:seo")
  .description("Run SEO audit against an existing browser session")
  .argument("<sessionId>", "Session ID")
  .action(async (sessionId: string) => {
    const spinner = ora("Running SEO audit...").start();
    try {
      const res = await callTool("browser_seo_audit", { sessionId });
      spinner.stop();
      console.log(chalk.green("✓ SEO audit"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("SEO audit failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browsePerfCommand = new Command("browse:perf")
  .description("Read performance metrics from an existing browser session")
  .argument("<sessionId>", "Session ID")
  .action(async (sessionId: string) => {
    const spinner = ora("Reading performance metrics...").start();
    try {
      const res = await callTool("browser_perf_metrics", { sessionId });
      spinner.stop();
      console.log(chalk.green("✓ Performance metrics"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Performance metrics failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const browseCaptchaCommand = new Command("browse:captcha")
  .description("Solve CAPTCHA in an existing browser session using the MCP solve_captcha tool")
  .argument("<sessionId>", "Session ID")
  .option("--type <type>", "CAPTCHA type: turnstile, recaptchav2, recaptchav3, hcaptcha")
  .option("--sitekey <sitekey>", "Override detected sitekey")
  .option("--page-url <pageUrl>", "Override detected page URL")
  .option("--no-auto-submit", "Do not click submit automatically after solving")
  .action(async (sessionId: string, opts: Record<string, string | boolean>) => {
    const spinner = ora("Solving CAPTCHA...").start();
    try {
      const res = await callTool("solve_captcha", {
        sessionId,
        type: opts.type,
        sitekey: opts.sitekey,
        pageUrl: opts.pageUrl,
        autoSubmit: opts.autoSubmit !== false,
      });
      spinner.stop();
      printRemoteBrowserResult("✓ CAPTCHA solved", res);
    } catch (err) {
      spinner.fail(chalk.red("CAPTCHA solving failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });
