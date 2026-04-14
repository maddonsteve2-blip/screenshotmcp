import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { randomUUID } from "crypto";
import type { LocalBrowserLaunchRequest, LocalBrowserPermissionPrompt } from "@screenshotsmcp/types";
import {
  createLocalBrowserPermissionPrompt,
  getLocalBrowserDefaultReason,
  getLocalBrowserInstallHelp,
  isLocalBrowserName,
  launchLocalBrowser,
  resolveLocalBrowser,
} from "../local-browser.js";
import { createInterface } from "readline";
import {
  manageLocalBrowserCookies,
  manageLocalBrowserStorage,
  clickLocalBrowser,
  clickAtLocalBrowser,
  closeLocalBrowser,
  describeLocalBrowserSession,
  evaluateLocalBrowser,
  exportLocalBrowserEvidenceBundle,
  fillLocalBrowser,
  getLocalBrowserConsoleLogs,
  getLocalBrowserNetworkErrors,
  getLocalBrowserNetworkRequests,
  getLocalBrowserAccessibilityTree,
  getLocalBrowserHtml,
  getLocalBrowserPerfMetrics,
  getLocalBrowserSeoAudit,
  getLocalBrowserText,
  goBackLocalBrowser,
  goForwardLocalBrowser,
  hoverLocalBrowser,
  navigateLocalBrowser,
  pressKeyLocalBrowser,
  selectOptionLocalBrowser,
  setViewportLocalBrowser,
  screenshotLocalBrowser,
  scrollLocalBrowser,
  waitForLocalBrowser,
} from "../local-browser-client.js";
import { cleanupLocalBrowserSession, getLocalBrowserSession, saveLocalBrowserSession } from "../local-browser-session.js";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function printApprovalPrompt(model: LocalBrowserPermissionPrompt): void {
  console.log();
  console.log(chalk.bold(model.title));
  console.log(chalk.dim(model.reason));
  console.log();
  for (const detail of model.details) {
    console.log(`- ${detail}`);
  }
  console.log();
}

async function promptForApproval(model: LocalBrowserPermissionPrompt, preApproved = false): Promise<boolean> {
  printApprovalPrompt(model);

  if (preApproved) {
    console.log(chalk.dim("Approval source: explicit --yes flag"));
    return true;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("An interactive terminal is required unless you pass --yes after the user has already explicitly approved local browser access.");
  }

  const answer = (await prompt("Approve local browser launch? [y/N]: ")).toLowerCase();
  return answer === "y" || answer === "yes";
}

function parseJsonArgument<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Invalid ${label} JSON. Pass a valid JSON value.`);
  }
}

export const browserCommand = new Command("browser")
  .description("Launch and control an extension-free managed local browser for ScreenshotsMCP workflows");

browserCommand
  .command("open")
  .description("Open a local browser in a dedicated ScreenshotsMCP profile after explicit approval")
  .argument("[url]", "Optional URL to open immediately")
  .option("-b, --browser <browser>", "Browser to use: auto, chrome, edge, chromium", "auto")
  .option("--headless", "Launch in headless mode for debugging future local automation flows")
  .option("--record-video", "Record the entire managed local browser session and return a local .webm path on close")
  .option("-y, --yes", "Use explicit pre-approval instead of an interactive confirmation prompt")
  .option("--reason <reason>", "Override the approval prompt reason")
  .action(async (url: string | undefined, opts: Record<string, string | boolean>) => {
    const browserValue = String(opts.browser || "auto").toLowerCase();
    if (!isLocalBrowserName(browserValue)) {
      console.error(chalk.red(`Unsupported browser '${browserValue}'. Use auto, chrome, edge, or chromium.`));
      process.exit(1);
    }

    const request: LocalBrowserLaunchRequest = {
      browser: browserValue,
      url,
      headless: !!opts.headless,
      recordVideo: !!opts.recordVideo,
      reason: typeof opts.reason === "string" && opts.reason.trim()
        ? opts.reason.trim()
        : getLocalBrowserDefaultReason(url),
      permissionLevel: "control-local-browser",
    };

    const spinner = ora("Looking for a compatible local browser...").start();
    const resolved = resolveLocalBrowser(request.browser);
    if (!resolved) {
      spinner.fail(chalk.red("No compatible local browser installation was found."));
      for (const line of getLocalBrowserInstallHelp()) {
        console.log(chalk.dim(`  ${line}`));
      }
      console.log(chalk.dim("  Managed Chromium bootstrap is planned next, but this first slice currently depends on an installed browser."));
      process.exit(1);
    }

    spinner.stop();

    const permissionPrompt = createLocalBrowserPermissionPrompt(request, resolved);
    const approved = await promptForApproval(permissionPrompt, !!opts.yes);
    if (!approved) {
      console.log(chalk.yellow("Local browser launch cancelled."));
      return;
    }

    const launchSpinner = ora(`Launching ${resolved.browser}...`).start();
    try {
      const sessionId = randomUUID();
      const result = await launchLocalBrowser(request, resolved, sessionId);
      const previousSession = getLocalBrowserSession();
      if (previousSession) {
        cleanupLocalBrowserSession(previousSession);
      }
      const storedSession = saveLocalBrowserSession({
        sessionId,
        browser: result.browser,
        executablePath: result.executablePath,
        userDataDir: result.userDataDir,
        debugPort: result.debugPort,
        pid: result.pid,
        url: result.url,
        permissionLevel: "control-local-browser",
        launchMode: result.launchMode,
        recordVideo: result.recordVideo,
        recordingDir: result.recordingDir,
        recordingSegments: [],
      });
      launchSpinner.succeed(chalk.green("Local browser launched"));
      console.log(`  Session: ${chalk.cyan(storedSession.sessionId)}`);
      console.log(`  Browser: ${chalk.cyan(result.browser)}`);
      console.log(`  Executable: ${chalk.dim(result.executablePath)}`);
      console.log(`  Profile: ${chalk.dim(result.userDataDir)}`);
      console.log(`  Debug port: ${chalk.cyan(String(result.debugPort))}`);
      if (result.pid) {
        console.log(`  PID: ${chalk.cyan(String(result.pid))}`);
      }
      if (result.url) {
        console.log(`  URL: ${chalk.cyan(result.url)}`);
      }
      if (result.recordVideo) {
        console.log(`  Recording: ${chalk.cyan("enabled")}`);
        if (result.recordingDir) {
          console.log(`  Recording dir: ${chalk.dim(result.recordingDir)}`);
        }
      }
      console.log(chalk.dim("  This is an isolated ScreenshotsMCP browser profile for future local automation and evidence capture flows."));
      console.log(chalk.dim("  Use `screenshotsmcp browser status` or `screenshotsmcp browser click ...` to control this managed local browser."));
    } catch (err) {
      launchSpinner.fail(chalk.red("Local browser launch failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("back")
  .description("Navigate back in the managed local browser history")
  .action(async () => {
    const spinner = ora("Navigating back in local browser...").start();
    try {
      const result = await goBackLocalBrowser();
      spinner.succeed(chalk.green("Local browser navigated back"));
      console.log(`  URL: ${chalk.cyan(result.url)}`);
      console.log(`  Screenshot: ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local browser back navigation failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("forward")
  .description("Navigate forward in the managed local browser history")
  .action(async () => {
    const spinner = ora("Navigating forward in local browser...").start();
    try {
      const result = await goForwardLocalBrowser();
      spinner.succeed(chalk.green("Local browser navigated forward"));
      console.log(`  URL: ${chalk.cyan(result.url)}`);
      console.log(`  Screenshot: ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local browser forward navigation failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("click-at")
  .description("Click specific viewport coordinates in the managed local browser")
  .argument("<x>", "X coordinate in pixels")
  .argument("<y>", "Y coordinate in pixels")
  .option("--click-count <count>", "Number of clicks", "1")
  .option("--delay <ms>", "Delay between mouse down and mouse up", "50")
  .action(async (x: string, y: string, opts: Record<string, string>) => {
    const spinner = ora("Clicking coordinates in local browser...").start();
    try {
      const result = await clickAtLocalBrowser(
        parseInt(x, 10),
        parseInt(y, 10),
        parseInt(opts.clickCount, 10) || 1,
        parseInt(opts.delay, 10) || 50,
      );
      spinner.succeed(chalk.green("Local browser coordinate click complete"));
      console.log(`  Screenshot: ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local browser coordinate click failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("status")
  .description("Show the tracked managed local browser session")
  .action(async () => {
    const spinner = ora("Checking managed local browser status...").start();
    try {
      const session = await describeLocalBrowserSession();
      spinner.succeed(chalk.green("Managed local browser is available"));
      console.log(`  Session: ${chalk.cyan(session.sessionId)}`);
      console.log(`  Browser: ${chalk.cyan(session.browser)}`);
      console.log(`  Title: ${chalk.cyan(session.title || "(untitled)")}`);
      console.log(`  Debug port: ${chalk.cyan(String(session.debugPort))}`);
      if (session.url) {
        console.log(`  URL: ${chalk.cyan(session.url)}`);
      }
      if (session.recordVideo) {
        console.log(`  Recording: ${chalk.cyan("enabled")}`);
        if (session.recordingPath) {
          console.log(`  Recording path: ${chalk.dim(session.recordingPath)}`);
        }
      }
    } catch (err) {
      spinner.fail(chalk.red("Managed local browser unavailable"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("goto")
  .description("Navigate the managed local browser to a new URL")
  .argument("<url>", "URL to navigate to")
  .action(async (url: string) => {
    const spinner = ora(`Navigating local browser to ${url}...`).start();
    try {
      const result = await navigateLocalBrowser(url);
      spinner.succeed(chalk.green("Local browser navigated"));
      console.log(`  URL: ${chalk.cyan(result.url)}`);
      console.log(`  Screenshot: ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local navigation failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("click")
  .description("Click a selector or visible text in the managed local browser")
  .argument("<selector>", "CSS selector or visible text")
  .action(async (selector: string) => {
    const spinner = ora("Clicking in local browser...").start();
    try {
      const result = await clickLocalBrowser(selector);
      spinner.succeed(chalk.green("Local browser click complete"));
      console.log(`  Screenshot: ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local browser click failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("fill")
  .description("Fill an input in the managed local browser")
  .argument("<selector>", "CSS selector for the input")
  .argument("<value>", "Text to type")
  .action(async (selector: string, value: string) => {
    const spinner = ora("Filling in local browser...").start();
    try {
      const result = await fillLocalBrowser(selector, value);
      spinner.succeed(chalk.green("Local browser fill complete"));
      console.log(`  Screenshot: ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local browser fill failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("hover")
  .description("Hover over an element in the managed local browser")
  .argument("<selector>", "CSS selector for the element")
  .action(async (selector: string) => {
    const spinner = ora("Hovering in local browser...").start();
    try {
      const result = await hoverLocalBrowser(selector);
      spinner.succeed(chalk.green("Local browser hover complete"));
      console.log(`  Screenshot: ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local browser hover failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("wait-for")
  .description("Wait for an element to appear in the managed local browser")
  .argument("<selector>", "CSS selector to wait for")
  .option("-t, --timeout <ms>", "Maximum wait time in milliseconds", "5000")
  .action(async (selector: string, opts: Record<string, string>) => {
    const spinner = ora(`Waiting for ${selector} in local browser...`).start();
    try {
      const result = await waitForLocalBrowser(selector, parseInt(opts.timeout, 10) || 5000);
      spinner.succeed(chalk.green("Local browser wait complete"));
      console.log(`  Screenshot: ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local browser wait failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("select")
  .description("Select an option in a managed local browser dropdown")
  .argument("<selector>", "CSS selector for the select element")
  .argument("<value>", "Option value or visible text")
  .action(async (selector: string, value: string) => {
    const spinner = ora("Selecting option in local browser...").start();
    try {
      const result = await selectOptionLocalBrowser(selector, value);
      spinner.succeed(chalk.green("Local browser selection complete"));
      console.log(`  Screenshot: ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local browser selection failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("key")
  .description("Press a keyboard key in the managed local browser")
  .argument("<key>", "Key to press")
  .action(async (key: string) => {
    const spinner = ora(`Pressing ${key} in local browser...`).start();
    try {
      const result = await pressKeyLocalBrowser(key);
      spinner.succeed(chalk.green("Local browser key press complete"));
      console.log(`  Screenshot: ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local browser key press failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("scroll")
  .description("Scroll the managed local browser")
  .option("-y, --y <px>", "Vertical scroll amount", "500")
  .action(async (opts: Record<string, string>) => {
    const spinner = ora("Scrolling local browser...").start();
    try {
      const result = await scrollLocalBrowser(parseInt(opts.y, 10) || 500);
      spinner.succeed(chalk.green("Local browser scroll complete"));
      console.log(`  Screenshot: ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local browser scroll failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("viewport")
  .description("Resize the managed local browser viewport")
  .argument("<width>", "Viewport width in pixels")
  .argument("<height>", "Viewport height in pixels")
  .action(async (width: string, height: string) => {
    const spinner = ora(`Resizing local browser viewport to ${width}x${height}...`).start();
    try {
      const result = await setViewportLocalBrowser(parseInt(width, 10), parseInt(height, 10));
      spinner.succeed(chalk.green("Local browser viewport updated"));
      console.log(`  Screenshot: ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local browser viewport update failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("screenshot")
  .description("Capture a local screenshot from the managed browser")
  .action(async () => {
    const spinner = ora("Capturing local browser screenshot...").start();
    try {
      const result = await screenshotLocalBrowser();
      spinner.succeed(chalk.green("Local browser screenshot saved"));
      console.log(`  ${chalk.cyan(result.screenshotPath)}`);
    } catch (err) {
      spinner.fail(chalk.red("Local browser screenshot failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("evidence")
  .description("Export a local evidence bundle with screenshot, page state, observability logs, and session metadata")
  .option("--label <label>", "Optional incident or test label to include in the bundle directory name")
  .action(async (opts: Record<string, string>) => {
    const spinner = ora("Exporting local browser evidence bundle...").start();
    try {
      const result = await exportLocalBrowserEvidenceBundle(opts.label);
      spinner.succeed(chalk.green("Local browser evidence bundle exported"));
      console.log(`  Bundle: ${chalk.cyan(result.bundleDir)}`);
      console.log(`  Files: ${chalk.cyan(String(result.fileCount))}`);
      if (result.recordingIncluded) {
        console.log(`  Recording: ${chalk.cyan("included")}`);
      } else if (result.recordingPending) {
        console.log(`  Recording: ${chalk.yellow("pending browser close to finalize .webm")}`);
      }
    } catch (err) {
      spinner.fail(chalk.red("Local browser evidence export failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("text")
  .description("Get visible text from the managed local browser")
  .option("-s, --selector <css>", "Limit to a specific element")
  .action(async (opts: Record<string, string>) => {
    try {
      console.log(await getLocalBrowserText(opts.selector));
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("html")
  .description("Get HTML from the managed local browser")
  .option("-s, --selector <css>", "Limit to a specific element")
  .action(async (opts: Record<string, string>) => {
    try {
      console.log(await getLocalBrowserHtml(opts.selector));
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("console")
  .description("Get captured console logs from the managed local browser")
  .option("--level <level>", "Filter by level: all, error, warning, log, exception", "all")
  .option("--limit <count>", "Maximum number of log entries to return", "50")
  .action(async (opts: Record<string, string>) => {
    const spinner = ora("Collecting local browser console logs...").start();
    try {
      const result = await getLocalBrowserConsoleLogs(
        (opts.level as "all" | "error" | "warning" | "log" | "exception") || "all",
        parseInt(opts.limit, 10) || 50,
      );
      spinner.stop();
      console.log(result);
    } catch (err) {
      spinner.fail(chalk.red("Local browser console log retrieval failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("network-errors")
  .description("Get failed network requests captured from the managed local browser")
  .option("--limit <count>", "Maximum number of failed requests to return", "50")
  .action(async (opts: Record<string, string>) => {
    const spinner = ora("Collecting local browser network errors...").start();
    try {
      const result = await getLocalBrowserNetworkErrors(parseInt(opts.limit, 10) || 50);
      spinner.stop();
      console.log(result);
    } catch (err) {
      spinner.fail(chalk.red("Local browser network error retrieval failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("network-requests")
  .description("Get captured network requests from the managed local browser")
  .option("--resource-type <type>", "Filter by resource type (document, stylesheet, script, image, font, xhr, fetch)")
  .option("--min-duration <ms>", "Only show requests slower than this", "0")
  .option("--limit <count>", "Maximum number of requests to return", "100")
  .action(async (opts: Record<string, string>) => {
    const spinner = ora("Collecting local browser network requests...").start();
    try {
      const result = await getLocalBrowserNetworkRequests({
        resourceType: opts.resourceType,
        minDuration: parseInt(opts.minDuration, 10) || 0,
        limit: parseInt(opts.limit, 10) || 100,
      });
      spinner.stop();
      console.log(result);
    } catch (err) {
      spinner.fail(chalk.red("Local browser network request retrieval failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("cookies")
  .description("Get, set, or clear cookies in the managed local browser")
  .argument("<action>", "Action to perform: get, set, clear")
  .argument("[cookiesJson]", "JSON array of cookies for the set action")
  .action(async (action: string, cookiesJson?: string) => {
    const spinner = ora("Updating local browser cookies...").start();
    try {
      const normalizedAction = action as "get" | "set" | "clear";
      const cookies = normalizedAction === "set" && cookiesJson
        ? parseJsonArgument<Array<{ name: string; value: string; domain?: string; path?: string; httpOnly?: boolean; secure?: boolean }>>(cookiesJson, "cookies")
        : undefined;
      const result = await manageLocalBrowserCookies(normalizedAction, cookies);
      spinner.stop();
      console.log(result);
    } catch (err) {
      spinner.fail(chalk.red("Local browser cookie command failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("storage")
  .description("Read or write localStorage/sessionStorage in the managed local browser")
  .argument("<action>", "Action to perform: get, getAll, set, remove, clear")
  .argument("[key]", "Storage key for get, set, or remove")
  .argument("[value]", "Value for the set action")
  .option("--type <storageType>", "Storage area: localStorage or sessionStorage", "localStorage")
  .action(async (action: string, key: string | undefined, value: string | undefined, opts: Record<string, string>) => {
    const spinner = ora("Updating local browser storage...").start();
    try {
      const result = await manageLocalBrowserStorage(
        action as "get" | "getAll" | "set" | "remove" | "clear",
        (opts.type as "localStorage" | "sessionStorage") || "localStorage",
        key,
        value,
      );
      spinner.stop();
      console.log(result);
    } catch (err) {
      spinner.fail(chalk.red("Local browser storage command failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("eval")
  .description("Run JavaScript in the managed local browser and print the result")
  .argument("<script>", "JavaScript expression to evaluate")
  .action(async (script: string) => {
    const spinner = ora("Evaluating script in local browser...").start();
    try {
      const result = await evaluateLocalBrowser(script);
      spinner.stop();
      console.log(result);
    } catch (err) {
      spinner.fail(chalk.red("Local browser script evaluation failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("a11y")
  .description("Get the accessibility tree from the managed local browser")
  .option("--max-depth <depth>", "Maximum tree depth to return", "8")
  .option("--full", "Return the full tree instead of only interesting UX nodes")
  .action(async (opts: Record<string, string | boolean>) => {
    const spinner = ora("Collecting local browser accessibility tree...").start();
    try {
      const result = await getLocalBrowserAccessibilityTree(
        parseInt(String(opts.maxDepth || "8"), 10) || 8,
        !opts.full,
      );
      spinner.stop();
      console.log(result);
    } catch (err) {
      spinner.fail(chalk.red("Local browser accessibility snapshot failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("perf")
  .description("Get performance metrics from the managed local browser")
  .action(async () => {
    const spinner = ora("Collecting local browser performance metrics...").start();
    try {
      const result = await getLocalBrowserPerfMetrics();
      spinner.stop();
      console.log(result);
    } catch (err) {
      spinner.fail(chalk.red("Local browser performance metrics failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("seo")
  .description("Get SEO metadata from the managed local browser")
  .action(async () => {
    const spinner = ora("Collecting local browser SEO audit...").start();
    try {
      const result = await getLocalBrowserSeoAudit();
      spinner.stop();
      console.log(result);
    } catch (err) {
      spinner.fail(chalk.red("Local browser SEO audit failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

browserCommand
  .command("close")
  .description("Close the tracked managed local browser")
  .option("--evidence", "Export a final local evidence bundle before closing so finalized video can be included")
  .option("--label <label>", "Optional incident or test label to include in the evidence bundle directory name")
  .action(async (opts: Record<string, string | boolean>) => {
    const spinner = ora("Closing managed local browser...").start();
    try {
      const result = await closeLocalBrowser({
        exportEvidence: !!opts.evidence,
        evidenceLabel: typeof opts.label === "string" ? opts.label : undefined,
      });
      spinner.succeed(chalk.green("Managed local browser closed"));
      if (result.recordingPath) {
        console.log(`  Recording: ${chalk.cyan(result.recordingPath)}`);
      }
      if (result.evidenceBundleDir) {
        console.log(`  Evidence bundle: ${chalk.cyan(result.evidenceBundleDir)}`);
        if (result.evidenceFileCount) {
          console.log(`  Evidence files: ${chalk.cyan(String(result.evidenceFileCount))}`);
        }
        if (result.evidenceRecordingIncluded) {
          console.log(`  Evidence recording: ${chalk.cyan("included")}`);
        } else if (result.evidenceRecordingPending) {
          console.log(`  Evidence recording: ${chalk.yellow("pending")}`);
        }
      }
    } catch (err) {
      spinner.fail(chalk.red("Managed local browser close failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });
