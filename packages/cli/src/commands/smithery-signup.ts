import { Command } from "commander";
import chalk from "chalk";
import { chromium } from "playwright";

/**
 * Local-browser Smithery signup.
 *
 * Why this exists: the remote MCP browser runs on Railway (datacenter IP)
 * and cannot clear Cloudflare Turnstile's Siteverify score on WorkOS-backed
 * flows. A local browser on the user's residential IP, using their real
 * Chrome, clears it trivially with a single human click on the checkbox.
 *
 * The CLI auto-fills the deterministic parts and pauses at the Turnstile
 * widget for the user. After the widget checks itself, the form auto-posts
 * and WorkOS accepts because the token was minted by a real browser on a
 * real IP.
 */
export const smitherySignupCommand = new Command("smithery-signup")
  .description(
    "Open your local Chrome, prefill the Smithery signup form, and pause at the Turnstile checkbox.",
  )
  .option("-e, --email <email>", "Email for signup")
  .option("-f, --first <name>", "First name", "ScreenshotsMCP")
  .option("-l, --last <name>", "Last name", "Publisher")
  .option("--headless", "Run headless (NOT recommended — kills the trust score)")
  .option(
    "--start-url <url>",
    "Starting URL",
    "https://smithery.ai/servers/new",
  )
  .action(async (opts: Record<string, string | boolean>) => {
    const email = typeof opts.email === "string" ? opts.email : undefined;
    const first = typeof opts.first === "string" ? opts.first : "ScreenshotsMCP";
    const last = typeof opts.last === "string" ? opts.last : "Publisher";
    const startUrl =
      typeof opts.startUrl === "string"
        ? opts.startUrl
        : "https://smithery.ai/servers/new";
    const headless = !!opts.headless;

    if (!email) {
      console.error(
        chalk.red("✗ --email is required. Use --email foo@example.com"),
      );
      process.exit(1);
    }

    console.log(chalk.bold("\nSmithery signup — local browser path\n"));
    console.log(
      chalk.dim(
        "  This uses your real Chrome and your residential IP, which is what",
      ),
    );
    console.log(
      chalk.dim(
        "  gets Turnstile's Siteverify score high enough for WorkOS to accept.",
      ),
    );
    console.log();
    console.log(`  First name: ${chalk.cyan(first)}`);
    console.log(`  Last name:  ${chalk.cyan(last)}`);
    console.log(`  Email:      ${chalk.cyan(email)}`);
    console.log(`  Start URL:  ${chalk.cyan(startUrl)}`);
    console.log();

    // Launch REAL Chrome (not Chromium) if available — this is the key.
    // Fallback to Chromium if Chrome isn't installed.
    let browser;
    try {
      browser = await chromium.launch({
        channel: "chrome",
        headless,
        args: ["--disable-blink-features=AutomationControlled"],
      });
    } catch (err) {
      console.log(
        chalk.yellow(
          "  (Chrome channel not available — falling back to Chromium. Install Chrome for best results.)",
        ),
      );
      browser = await chromium.launch({ headless });
    }

    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();

    try {
      console.log(chalk.dim("→ Navigating to Smithery..."));
      await page.goto(startUrl, { waitUntil: "domcontentloaded" });

      // Smithery's /servers/new redirects to the login page. From there we
      // click "Sign up" to reach the signup form on authk.smithery.ai.
      console.log(chalk.dim("→ Waiting for login page..."));
      await page.waitForLoadState("networkidle").catch(() => {});

      // Try to click the "Sign up" link if we're on the login page.
      const signUpLink = page.getByText(/Sign\s*up/i).first();
      if (await signUpLink.isVisible().catch(() => false)) {
        console.log(chalk.dim("→ Clicking Sign up..."));
        await signUpLink.click();
        await page.waitForLoadState("networkidle").catch(() => {});
      }

      // Wait for the signup form fields.
      console.log(chalk.dim("→ Filling signup form..."));
      await page
        .waitForSelector('input[placeholder*="first" i], input[name="first_name"]', {
          timeout: 10_000,
        })
        .catch(() => {});

      const firstInput = page.locator(
        'input[placeholder*="first" i], input[name="first_name"]',
      ).first();
      const lastInput = page.locator(
        'input[placeholder*="last" i], input[name="last_name"]',
      ).first();
      const emailInput = page.locator(
        'input[type="email"], input[name="email"]',
      ).first();

      if (await firstInput.isVisible().catch(() => false))
        await firstInput.fill(first);
      if (await lastInput.isVisible().catch(() => false))
        await lastInput.fill(last);
      if (await emailInput.isVisible().catch(() => false))
        await emailInput.fill(email);

      console.log(
        chalk.dim("→ Clicking Continue (form will go to Turnstile)..."),
      );
      const continueBtn = page
        .getByRole("button", { name: /continue|sign\s*up/i })
        .first();
      if (await continueBtn.isVisible().catch(() => false)) {
        await continueBtn.click();
      }

      console.log();
      console.log(
        chalk.yellow.bold(
          "→ Your turn: click the Turnstile checkbox in the Chrome window.",
        ),
      );
      console.log(
        chalk.dim(
          "  (The CLI will poll with escalating intervals and print progress snapshots.)",
        ),
      );
      console.log();

      const startUrlHost = new URL(page.url()).host;

      // Progressive Visibility: escalating poll intervals with a state snapshot
      // on each tick. This avoids the silent-hang pattern — any caller (agent
      // or human) can always see current URL + H1 text and decide whether to
      // keep waiting or abort, rather than sitting blind on a long wait.
      const POLL_SCHEDULE_MS = [2_000, 5_000, 10_000, 20_000, 40_000, 40_000, 40_000];
      let succeeded = false;
      let totalElapsed = 0;

      const checkTerminal = async (): Promise<
        "done" | "still-authk" | "error"
      > => {
        try {
          const currentHost = new URL(page.url()).host;
          if (currentHost !== startUrlHost && !currentHost.startsWith("authk.")) {
            return "done";
          }
          const verifyMarker = page.getByText(
            /verify|check.*email|code.*sent|enter.*code/i,
          ).first();
          if (await verifyMarker.isVisible().catch(() => false)) {
            return "done";
          }
          return "still-authk";
        } catch {
          return "error";
        }
      };

      for (const waitMs of POLL_SCHEDULE_MS) {
        await page.waitForTimeout(waitMs);
        totalElapsed += waitMs;

        const state = await checkTerminal();
        if (state === "done") {
          succeeded = true;
          break;
        }

        // Progress snapshot — visible to any watching agent.
        const snap = {
          elapsed: `${Math.round(totalElapsed / 1000)}s`,
          url: page.url(),
          title: await page.title().catch(() => ""),
          h1:
            (await page
              .locator("h1, h2")
              .first()
              .textContent({ timeout: 500 })
              .catch(() => null)) ?? null,
          visibleText: (
            (await page
              .locator("body")
              .textContent({ timeout: 500 })
              .catch(() => "")) ?? ""
          )
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 200),
        };
        console.log(
          chalk.dim(
            `  [${snap.elapsed}] ${snap.h1 ?? snap.title} — ${snap.url}`,
          ),
        );
        if (snap.visibleText) {
          console.log(chalk.dim(`         ${snap.visibleText}`));
        }
      }

      if (succeeded) {
        console.log(chalk.green.bold("\n✓ Turnstile cleared — WorkOS accepted."));
        console.log(`  Current URL: ${chalk.cyan(page.url())}`);
        console.log();
        console.log(
          chalk.dim(
            "  If the next step is email verification, check the inbox:",
          ),
        );
        console.log(
          chalk.cyan(`    screenshotsmcp inbox:check --inbox-id ${email}`),
        );
        console.log();
        console.log(
          chalk.dim(
            "  Browser stays open so you can finish any remaining steps.",
          ),
        );
        await page.waitForEvent("close", { timeout: 0 }).catch(() => {});
      } else {
        console.log(
          chalk.red(
            `\n✗ No state change after ${Math.round(totalElapsed / 1000)}s. The browser window is still open — finish manually, or re-run with a higher --max-wait.`,
          ),
        );
        console.log(
          chalk.dim(
            "  If you saw the Turnstile checkbox never appear, the Siteverify may have rejected your client silently. Try with a different IP / VPN off.",
          ),
        );
      }
    } catch (err) {
      console.error(
        chalk.red(
          `\n✗ Error during signup: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      process.exitCode = 1;
    } finally {
      // Do not auto-close; let the user finish any remaining steps.
    }
  });
