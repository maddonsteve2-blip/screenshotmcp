import { Command } from "commander";
import chalk from "chalk";
import { chromium, Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

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

      // Snapshot directory — PNGs are written here and the path is printed so
      // the user / watching agent can open them.
      const runId = randomBytes(4).toString("hex");
      const snapshotDir = join(tmpdir(), `smithery-signup-${runId}`);
      mkdirSync(snapshotDir, { recursive: true });
      console.log(chalk.dim(`  Snapshots → ${snapshotDir}`));
      console.log();

      console.log(
        chalk.yellow.bold(
          "→ Your turn: click the Turnstile checkbox in the Chrome window.",
        ),
      );
      console.log(
        chalk.dim(
          "  (CLI auto-detects every step and walks through password + verify.)",
        ),
      );
      console.log();

      let tickCount = 0;
      const snapshot = async (stepLabel: string, elapsedMs: number) => {
        tickCount += 1;
        const elapsed = `${Math.round(elapsedMs / 1000)}s`;
        const url = page.url();
        const title = await page.title().catch(() => "");
        const h1 =
          (await page
            .locator("h1, h2")
            .first()
            .innerText({ timeout: 500 })
            .catch(() => null)) ?? null;
        // innerText (not textContent) so inline CSS doesn't leak.
        const visibleText = (
          (await page
            .locator("body")
            .innerText({ timeout: 500 })
            .catch(() => "")) ?? ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160);

        const pngPath = join(
          snapshotDir,
          `${String(tickCount).padStart(2, "0")}-${stepLabel}-${elapsed}.png`,
        );
        await page
          .screenshot({ path: pngPath, fullPage: false })
          .catch(() => {});

        console.log(
          chalk.dim(`  [${elapsed}] ${stepLabel}: ${h1 ?? title} — ${url}`),
        );
        if (visibleText)
          console.log(chalk.dim(`         "${visibleText}..."`));
        console.log(chalk.dim(`         png: ${pngPath}`));
      };

      const pathOf = (u: string) => {
        try {
          return new URL(u).pathname;
        } catch {
          return u;
        }
      };

      // Step 1 — wait for Turnstile to clear, signalled by URL path change
      // away from `/sign-up` (usually to `/sign-up/password`).
      console.log(chalk.bold("Step 1: Turnstile"));
      const step1Start = Date.now();
      const SCHEDULE = [2_000, 5_000, 10_000, 20_000, 40_000, 40_000];
      let turnstileCleared = false;
      for (const waitMs of SCHEDULE) {
        await page.waitForTimeout(waitMs);
        const elapsed = Date.now() - step1Start;
        const currentPath = pathOf(page.url());
        if (currentPath !== "/sign-up") {
          turnstileCleared = true;
          await snapshot("turnstile-cleared", elapsed);
          break;
        }
        await snapshot("turnstile-waiting", elapsed);
      }
      if (!turnstileCleared) {
        console.log(
          chalk.red(
            "\n✗ Turnstile never cleared. Browser still open — finish manually.",
          ),
        );
        await page.waitForEvent("close", { timeout: 0 }).catch(() => {});
        return;
      }
      console.log(chalk.green("  ✓ Turnstile cleared — advanced past Cloudflare gate."));
      console.log();

      // Step 2 — Password step. WorkOS shows "Create a password" after a
      // successful signup init. We auto-generate a strong password and fill it.
      if (pathOf(page.url()).startsWith("/sign-up/password")) {
        console.log(chalk.bold("Step 2: Create password"));
        const password =
          "Scr" +
          randomBytes(8).toString("base64").replace(/[+/=]/g, "") +
          "!9A";
        console.log(
          chalk.yellow(
            `  Generated password: ${chalk.bold(password)}  (save this — you'll need it)`,
          ),
        );

        const pwInput = page
          .locator('input[type="password"], input[name="password"]')
          .first();
        if (await pwInput.isVisible().catch(() => false)) {
          await pwInput.fill(password);
          await snapshot("password-filled", 0);

          const pwContinue = page
            .getByRole("button", { name: /continue|sign\s*up/i })
            .first();
          if (await pwContinue.isVisible().catch(() => false)) {
            await pwContinue.click();
            await snapshot("password-submitted", 0);
          }

          // Wait for URL to advance past /password
          const step2Start = Date.now();
          let pwCleared = false;
          for (const waitMs of SCHEDULE) {
            await page.waitForTimeout(waitMs);
            const elapsed = Date.now() - step2Start;
            const p = pathOf(page.url());
            if (!p.startsWith("/sign-up/password")) {
              pwCleared = true;
              await snapshot("password-cleared", elapsed);
              break;
            }
            await snapshot("password-waiting", elapsed);
          }
          if (!pwCleared) {
            console.log(
              chalk.red("  ✗ Password step didn't advance. Finish manually."),
            );
            await page.waitForEvent("close", { timeout: 0 }).catch(() => {});
            return;
          }
          console.log(chalk.green("  ✓ Password accepted."));
          console.log();
        }
      }

      // Step 3 — whatever comes next (verify email, profile, or success
      // redirect). We don't assume — poll and snapshot until the host
      // changes off `authk.` or 60s elapses.
      console.log(chalk.bold("Step 3: Post-password (verify email / redirect)"));
      const step3Start = Date.now();
      for (const waitMs of SCHEDULE) {
        await page.waitForTimeout(waitMs);
        const elapsed = Date.now() - step3Start;
        const host = new URL(page.url()).host;
        await snapshot("post-password", elapsed);
        if (!host.startsWith("authk.")) {
          console.log(
            chalk.green.bold("\n✓ Signup complete — redirected off AuthKit."),
          );
          console.log(`  Final URL: ${chalk.cyan(page.url())}`);
          break;
        }
      }

      console.log();
      console.log(chalk.dim("  Browser stays open. Check email for a"));
      console.log(chalk.dim("  verification link/code if prompted:"));
      console.log(
        chalk.cyan(`    screenshotsmcp inbox:check --inbox-id ${email}`),
      );
      await page.waitForEvent("close", { timeout: 0 }).catch(() => {});
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
