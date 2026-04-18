import { Command } from "commander";
import chalk from "chalk";
import { chromium, Page, BrowserContext } from "playwright";
import { spawn } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createCliRun,
  postRunStep,
  finishCliRun,
} from "../api.js";

/**
 * Interactive local browser driven one action at a time by a calling agent
 * (Windsurf / Cascade / any MCP client). Unlike `smithery-signup` which runs
 * a preset flow, this exposes atomic primitives: start, click, fill, press,
 * screenshot, eval, stop.
 *
 * Each command:
 *   1. Connects to the persistent Chrome via CDP (port stored in a session
 *      file on first `start`).
 *   2. Performs exactly one action.
 *   3. Captures a PNG of the resulting state and prints its path.
 *   4. Exits. The Chrome process keeps running between commands.
 *
 * The agent reads each PNG, reasons about what to do next, and fires the
 * next command. No preset script — full closed-loop.
 */

const SESSION_FILE = join(tmpdir(), "screenshotsmcp-local-session.json");

interface SessionState {
  port: number;
  pid: number;
  userDataDir: string;
  snapshotDir: string;
  tickCount: number;
  /** Dashboard run id (optional — null means --no-upload or unauth). */
  runId?: string | null;
  /** Last seen URL/title/heading so we can compute deltas for narration. */
  lastUrl?: string | null;
  lastTitle?: string | null;
  lastHeading?: string | null;
  /** Whether the user passed --no-upload. */
  uploadDisabled?: boolean;
}

function loadSession(): SessionState {
  if (!existsSync(SESSION_FILE)) {
    throw new Error(
      "No active local browser session. Run `screenshotsmcp browser:start <url>` first.",
    );
  }
  return JSON.parse(readFileSync(SESSION_FILE, "utf8"));
}

function saveSession(state: SessionState) {
  writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));
}

async function connect(state: SessionState) {
  const browser = await chromium.connectOverCDP(
    `http://127.0.0.1:${state.port}`,
  );
  const context: BrowserContext =
    browser.contexts()[0] ?? (await browser.newContext({ viewport: null }));
  const page: Page =
    context.pages().find((p) => !p.url().startsWith("devtools://")) ??
    (await context.newPage());
  return { browser, context, page };
}

async function snapshot(
  page: Page,
  state: SessionState,
  label: string,
  narration: { agentNote?: string; arg?: string; arg2?: string } = {},
): Promise<string> {
  state.tickCount += 1;
  const file = join(
    state.snapshotDir,
    `${String(state.tickCount).padStart(3, "0")}-${label.replace(/[^\w-]/g, "_")}.png`,
  );
  const buf = await page.screenshot({ path: file, fullPage: false }).catch(() => null);

  // Capture after-state for dashboard upload.
  let nextUrl: string | null = null;
  let nextTitle: string | null = null;
  let nextHeading: string | null = null;
  try { nextUrl = page.url(); } catch { /* ignore */ }
  try { nextTitle = await page.title(); } catch { /* ignore */ }
  try {
    nextHeading = await page
      .locator("h1, h2, [role=heading]")
      .first()
      .innerText({ timeout: 500 })
      .catch(() => null);
  } catch { /* ignore */ }

  // Best-effort upload to dashboard.
  if (state.runId && !state.uploadDisabled && buf) {
    try {
      const result = await postRunStep(state.runId, {
        pngBase64: buf.toString("base64"),
        toolName: `cli:browser:${label.split("-")[0]}`,
        prevUrl: state.lastUrl ?? null,
        nextUrl,
        prevTitle: state.lastTitle ?? null,
        pageTitle: nextTitle,
        prevHeading: state.lastHeading ?? null,
        heading: nextHeading,
        arg: narration.arg ?? null,
        arg2: narration.arg2 ?? null,
        agentNote: narration.agentNote ?? null,
      });
      console.log(
        chalk.dim(
          `  dashboard: step #${result.stepIndex} — ${result.actionLabel} ${result.outcome}`,
        ),
      );
    } catch (err) {
      // Non-fatal — local PNG still saved.
      console.log(
        chalk.dim(`  dashboard upload skipped: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  }

  state.lastUrl = nextUrl;
  state.lastTitle = nextTitle;
  state.lastHeading = nextHeading;
  saveSession(state);
  return file;
}

async function printState(page: Page, snap: string, prefix = "OK") {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const h1 =
    (await page
      .locator("h1, h2, [role=heading]")
      .first()
      .innerText({ timeout: 500 })
      .catch(() => null)) ?? null;
  // The evaluateAll callback runs in the browser page context (NOT in Node),
  // so DOM globals like HTMLInputElement are available there even though the
  // CLI tsconfig targets `node` and doesn't include lib.dom. We silence the
  // resulting TypeScript warnings with a narrow `any` inside the callback.
  const inputs = (await page
    .locator("input:visible, button:visible")
    .evaluateAll((nodes) =>
      nodes.slice(0, 20).map((node) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const el = node as any;
        return {
          tag: String(el.tagName || "").toLowerCase(),
          type: el.type ?? null,
          name: el.name ?? null,
          placeholder: el.placeholder ?? null,
          text: (el.textContent ?? "").trim().slice(0, 40),
          value: el.value ? String(el.value).slice(0, 40) : null,
        };
      }),
    )
    .catch(() => [])) as Array<Record<string, string | null>>;

  console.log(chalk.green(`${prefix}`));
  console.log(`  snapshot: ${chalk.cyan(snap)}`);
  console.log(`  url:      ${url}`);
  console.log(`  title:    ${title}`);
  if (h1) console.log(`  heading:  ${chalk.bold(h1)}`);
  if (inputs.length) {
    console.log(`  inputs/buttons:`);
    for (const i of inputs) {
      const desc = [
        i.tag,
        i.type && `type=${i.type}`,
        i.name && `name=${i.name}`,
        i.placeholder && `placeholder=${JSON.stringify(i.placeholder)}`,
        i.text && `text=${JSON.stringify(i.text)}`,
        i.value && `value=${JSON.stringify(i.value)}`,
      ]
        .filter(Boolean)
        .join(" ");
      console.log(`    - ${desc}`);
    }
  }
}

function findChromeExecutable(): string {
  // Prefer real Chrome (higher Turnstile trust). Fall back to Playwright's Chromium.
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return chromium.executablePath();
}

export const browserStartCommand = new Command("browser:start")
  .description(
    "Launch a persistent local Chrome with remote debugging. Subsequent browser:* commands drive it. Streams every snapshot to the dashboard unless --no-upload is passed.",
  )
  .argument("[url]", "Initial URL to load", "about:blank")
  .option("--port <port>", "CDP port", String(9222 + Math.floor(Math.random() * 200)))
  .option("--no-upload", "Do not upload snapshots to the dashboard (local-only)")
  .option("--goal <text>", "Optional user goal, saved to run_outcomes.userGoal")
  .option("--workflow <name>", "Optional workflow name, saved to run_outcomes.workflowUsed")
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    // Clean up any stale session.
    if (existsSync(SESSION_FILE)) {
      try {
        const old = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
        if (old.pid) {
          try {
            process.kill(old.pid, 0); // probe
            console.log(
              chalk.yellow(
                `  Warning: existing session (pid=${old.pid}) still alive. Run browser:stop first or kill manually.`,
              ),
            );
            process.exitCode = 1;
            return;
          } catch {
            // Dead; safe to replace.
          }
        }
      } catch {
        // corrupt session file; ignore.
      }
    }

    const port = parseInt(opts.port, 10);
    const userDataDir = join(tmpdir(), `screenshotsmcp-chrome-${Date.now()}`);
    const snapshotDir = join(tmpdir(), `screenshotsmcp-snaps-${Date.now()}`);
    mkdirSync(userDataDir, { recursive: true });
    mkdirSync(snapshotDir, { recursive: true });

    const exe = findChromeExecutable();
    console.log(chalk.dim(`  Chrome: ${exe}`));
    console.log(chalk.dim(`  CDP port: ${port}`));
    console.log(chalk.dim(`  Snapshots: ${snapshotDir}`));

    const child = spawn(
      exe,
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled",
        url,
      ],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
    const pid = child.pid ?? 0;

    // Wait for CDP endpoint.
    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) {
      console.error(
        chalk.red(`✗ Chrome didn't expose CDP on port ${port} within 15s.`),
      );
      process.exitCode = 1;
      return;
    }

    const uploadDisabled = opts.upload === false;
    let runId: string | null = null;
    if (!uploadDisabled) {
      try {
        const created = await createCliRun({
          startUrl: url === "about:blank" ? undefined : url,
          userGoal: typeof opts.goal === "string" ? opts.goal : undefined,
          workflowName: typeof opts.workflow === "string" ? opts.workflow : undefined,
        });
        runId = created.runId;
        console.log(chalk.dim(`  Dashboard run: ${runId}`));
      } catch (err) {
        console.log(
          chalk.yellow(
            `  dashboard disabled: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
          ),
        );
      }
    }

    const state: SessionState = {
      port,
      pid,
      userDataDir,
      snapshotDir,
      tickCount: 0,
      runId,
      uploadDisabled,
    };
    saveSession(state);

    const { browser, page } = await connect(state);
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const snap = await snapshot(page, state, "start");
    await printState(page, snap, "✓ browser:start");
    await browser.close();
  });

function makeActionCommand(
  name: string,
  description: string,
  args: { name: string; description: string; optional?: boolean }[],
  action: (
    page: Page,
    state: SessionState,
    ...a: string[]
  ) => Promise<{ label: string; extra?: Record<string, unknown> }>,
) {
  const cmd = new Command(name).description(description);
  for (const a of args) {
    cmd.argument(a.optional ? `[${a.name}]` : `<${a.name}>`, a.description);
  }
  // Every action command accepts --note "..." which becomes agentNote on the
  // uploaded step (surfaces in the dashboard run timeline).
  cmd.option("-n, --note <text>", "Agent narration for this step (surfaces in the dashboard timeline)");
  cmd.action(async (...cliArgs: unknown[]) => {
    // commander passes positional args, then options object, then the Command
    const positional = cliArgs.slice(0, args.length) as string[];
    const optsObj = cliArgs[args.length] as { note?: string } | undefined;
    const agentNote = optsObj?.note;
    const state = loadSession();
    const { browser, page } = await connect(state);
    try {
      const { label, extra } = await action(page, state, ...positional);
      await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => {});
      const snap = await snapshot(page, state, label, {
        agentNote,
        arg: positional[0] ?? null,
        arg2: positional[1] ?? null,
      });
      if (extra) {
        for (const [k, v] of Object.entries(extra)) {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        }
      }
      await printState(page, snap, `✓ ${name}`);
    } finally {
      await browser.close().catch(() => {});
    }
  });
  return cmd;
}

export const browserClickLocalCommand = makeActionCommand(
  "browser:click",
  "Click an element by selector or visible text",
  [{ name: "selector", description: "CSS selector or visible text" }],
  async (page, _state, selector) => {
    const byRole = page.getByRole("button", { name: new RegExp(selector, "i") }).first();
    const byText = page.getByText(selector, { exact: false }).first();
    const byCss = page.locator(selector).first();
    for (const loc of [byCss, byRole, byText]) {
      if (await loc.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await loc.click();
        return { label: `click` };
      }
    }
    throw new Error(`No visible element matched: ${selector}`);
  },
);

export const browserFillLocalCommand = makeActionCommand(
  "browser:fill",
  "Fill an input by selector with a value",
  [
    { name: "selector", description: "CSS selector" },
    { name: "value", description: "Value to type" },
  ],
  async (page, _state, selector, value) => {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: "visible", timeout: 5_000 });
    await loc.fill(value);
    return { label: `fill` };
  },
);

export const browserPressLocalCommand = makeActionCommand(
  "browser:press",
  "Press a key (e.g. Enter, Tab, ArrowDown, Control+a)",
  [{ name: "key", description: "Key combination" }],
  async (page, _state, key) => {
    await page.keyboard.press(key);
    return { label: `press-${key}` };
  },
);

export const browserScreenshotLocalCommand = makeActionCommand(
  "browser:screenshot",
  "Capture the current state without any action",
  [],
  async () => ({ label: "screenshot" }),
);

export const browserEvalLocalCommand = makeActionCommand(
  "browser:eval",
  "Run arbitrary JavaScript in the page and return the result",
  [{ name: "script", description: "JavaScript expression" }],
  async (page, _state, script) => {
    const result = await page.evaluate(
      // eslint-disable-next-line no-new-func
      new Function(`return (async()=>{ return (${script}) })()`) as () => unknown,
    );
    return {
      label: `eval`,
      extra: { result: typeof result === "string" ? result.slice(0, 500) : result },
    };
  },
);

export const browserWaitLocalCommand = makeActionCommand(
  "browser:wait",
  "Wait for a number of milliseconds, then screenshot",
  [{ name: "ms", description: "Milliseconds to wait" }],
  async (page, _state, ms) => {
    const millis = parseInt(ms, 10);
    await page.waitForTimeout(Number.isFinite(millis) ? millis : 1_000);
    return { label: `wait-${ms}ms` };
  },
);

export const browserNavigateLocalCommand = makeActionCommand(
  "browser:goto",
  "Navigate the current page to a new URL",
  [{ name: "url", description: "URL" }],
  async (page, _state, url) => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return { label: `goto` };
  },
);

/**
 * Wait for a selector to become visible, using a Progressive Visibility schedule
 * [2s, 5s, 10s, 20s, 40s]. Between each tick, snapshot the page so the calling
 * agent can decide whether to keep waiting or abort. Returns as soon as the
 * selector is visible. Total max wait ≈ 77 seconds.
 *
 * This is the preferred wait command — `browser:wait <ms>` is blind and should
 * only be used when nothing specific needs to appear.
 */
export const browserWaitForLocalCommand = makeActionCommand(
  "browser:wait-for",
  "Wait for a CSS selector to become visible using the Progressive Visibility schedule",
  [{ name: "selector", description: "CSS selector to wait for" }],
  async (page, _state, selector) => {
    const schedule = [2_000, 5_000, 10_000, 20_000, 40_000];
    let elapsed = 0;
    for (const tick of schedule) {
      const loc = page.locator(selector).first();
      try {
        await loc.waitFor({ state: "visible", timeout: tick });
        return { label: `wait-for`, extra: { matched: selector, elapsedMs: elapsed + tick } };
      } catch {
        elapsed += tick;
        // Tick failed; fall through to next, but first allow a screenshot
        // between ticks by yielding. The outer command will snapshot once
        // after the whole call — so we continue without extra screenshots
        // here to keep the output compact.
      }
    }
    throw new Error(
      `Selector never became visible within ${elapsed}ms: ${selector}`,
    );
  },
);

/**
 * React-compatible value setter + event dispatch. Works on controlled inputs
 * where plain `fill()` gets reverted by React's state machine (e.g. OTP code
 * inputs, Radix forms). Fills all 6 digit fields when passed a 6-char value
 * and the selector matches multiple inputs.
 */
export const browserPasteLocalCommand = makeActionCommand(
  "browser:paste",
  "Paste a value into input(s) using React-compatible setter + input event dispatch",
  [
    { name: "selector", description: "CSS selector (may match multiple inputs for OTP fields)" },
    { name: "value", description: "Value to paste; distributed one char per matched input if >1 matches" },
  ],
  async (page, _state, selector, value) => {
    const result = await page.evaluate(
      ({ sel, val }: { sel: string; val: string }) => {
        // The callback runs in the browser page context, so DOM globals are
        // available even though the Node tsconfig doesn't include lib.dom.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = globalThis as any;
        const setter = Object.getOwnPropertyDescriptor(
          g.HTMLInputElement.prototype,
          "value",
        )?.set;
        if (!setter) return { filled: 0, error: "no native setter" };
        const matches = Array.from(
          g.document.querySelectorAll(sel),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any[];
        if (matches.length === 0) return { filled: 0, error: "no matches" };
        if (matches.length === 1) {
          setter.call(matches[0], val);
          matches[0].dispatchEvent(new g.Event("input", { bubbles: true }));
          matches[0].dispatchEvent(new g.Event("change", { bubbles: true }));
          return { filled: 1 };
        }
        // Multi-match: distribute one char per element.
        for (let i = 0; i < matches.length && i < val.length; i += 1) {
          setter.call(matches[i], val[i]);
          matches[i].dispatchEvent(new g.Event("input", { bubbles: true }));
        }
        return { filled: Math.min(matches.length, val.length) };
      },
      { sel: selector, val: value },
    );
    return { label: "paste", extra: { result } };
  },
);

/**
 * DOM form inspector. Returns every input, button, and link on the page with
 * the actual selectors an agent can click. Removes the "guess the selector"
 * problem that causes most failed clicks.
 */
export const browserInspectLocalCommand = makeActionCommand(
  "browser:inspect",
  "Dump all inputs, buttons, and links on the page with their actionable selectors",
  [],
  async (page) => {
    const result = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = globalThis as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const describe = (el: any, idx: number) => {
        const tag = String(el.tagName || "").toLowerCase();
        const id = el.id ? `#${el.id}` : "";
        const name = el.getAttribute("name");
        const type = el.getAttribute("type");
        const href = el.getAttribute("href");
        const ariaLabel = el.getAttribute("aria-label");
        const placeholder = el.getAttribute("placeholder");
        const text = (el.textContent || "").trim().slice(0, 80);
        const cls = (el.className || "").toString().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
        const selectorCandidates = [
          id,
          name ? `${tag}[name="${name}"]` : "",
          href ? `a[href="${href}"]` : "",
          ariaLabel ? `[aria-label="${ariaLabel}"]` : "",
          cls ? `${tag}.${cls}` : "",
          `${tag}:nth-of-type(${idx + 1})`,
        ].filter(Boolean);
        return {
          tag,
          type: type ?? undefined,
          name: name ?? undefined,
          text: text || undefined,
          placeholder: placeholder ?? undefined,
          ariaLabel: ariaLabel ?? undefined,
          href: href ?? undefined,
          preferredSelector: selectorCandidates[0] || selectorCandidates[4] || `${tag}`,
          selectors: selectorCandidates,
        };
      };
      const inputs = Array.from(g.document.querySelectorAll("input, textarea, select")).slice(0, 40);
      const buttons = Array.from(g.document.querySelectorAll("button")).slice(0, 40);
      const links = Array.from(g.document.querySelectorAll("a[href]")).slice(0, 40);
      return {
        inputs: inputs.map(describe),
        buttons: buttons.map(describe),
        links: links.map(describe),
      };
    });
    return { label: "inspect", extra: { dom: result } };
  },
);

export const browserStopCommand = new Command("browser:stop")
  .description("Close the persistent local Chrome and clean up session state")
  .action(async () => {
    if (!existsSync(SESSION_FILE)) {
      console.log(chalk.dim("No active session."));
      return;
    }
    const state = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as SessionState;
    if (state.runId && !state.uploadDisabled) {
      try {
        await finishCliRun(state.runId, {
          status: "completed",
          finalUrl: state.lastUrl ?? undefined,
          pageTitle: state.lastTitle ?? undefined,
        });
        console.log(chalk.dim(`  Dashboard run ${state.runId} finalized.`));
      } catch (err) {
        console.log(
          chalk.yellow(
            `  Could not finalize run: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
          ),
        );
      }
    }
    try {
      if (state.pid) {
        try {
          process.kill(state.pid);
        } catch {
          /* already dead */
        }
      }
    } finally {
      rmSync(SESSION_FILE, { force: true });
      console.log(chalk.green("✓ Session closed."));
      console.log(chalk.dim(`  Snapshots remain at: ${state.snapshotDir}`));
      if (state.runId && !state.uploadDisabled) {
        console.log(chalk.cyan(`  View run: https://web-phi-eight-56.vercel.app/dashboard/runs/${state.runId}`));
      }
    }
  });
