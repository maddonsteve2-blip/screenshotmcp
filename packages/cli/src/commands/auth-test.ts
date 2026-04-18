import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { callTool, extractImageUrl, extractText } from "../api.js";

const VALID_INTENTS = new Set(["auto", "sign_in", "sign_up"]);
const VALID_OUTCOMES = new Set([
  "login_success",
  "login_failed",
  "signup_success",
  "signup_failed",
  "verification_required",
  "verification_success",
]);

export const authTestCommand = new Command("auth:test")
  .description("Start-here helper to plan or record reusable website auth workflow with broad strategy plus per-site evidence")
  .argument("<url>", "Site URL or auth page URL")
  .option("--login-url <loginUrl>", "Known login URL for the site")
  .option("--intent <intent>", "Auth intent: auto, sign_in, sign_up", "auto")
  .option("--record", "Record an auth outcome instead of planning the next step")
  .option("--outcome <outcome>", "Outcome to record: login_success, login_failed, signup_success, signup_failed, verification_required, verification_success")
  .option("--notes <notes>", "Optional note to save with the auth memory")
  .option("--username <username>", "Username prefix when forcing a fresh inbox")
  .option("--name <name>", "Display name when forcing a fresh inbox")
  .option("--force-new-inbox", "Force a brand new inbox instead of reusing the saved primary inbox")
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const intent = String(opts.intent || "auto");
    if (!VALID_INTENTS.has(intent)) {
      console.error(chalk.red(`Invalid intent: ${intent}`));
      process.exit(1);
    }

    const action = opts.record ? "record" : "plan";
    const outcome = opts.outcome ? String(opts.outcome) : undefined;
    if (action === "record" && (!outcome || !VALID_OUTCOMES.has(outcome))) {
      console.error(chalk.red("When using --record you must pass a valid --outcome value."));
      process.exit(1);
    }

    const spinner = ora(action === "record" ? "Saving auth outcome..." : "Planning auth workflow...").start();
    try {
      const res = await callTool("auth_test_assist", {
        url,
        action,
        intent,
        loginUrl: opts.loginUrl,
        outcome,
        notes: opts.notes,
        username: opts.username,
        display_name: opts.name,
        force_new_inbox: !!opts.forceNewInbox,
      });
      spinner.stop();
      console.log(action === "record" ? chalk.green("✓ Auth memory updated") : chalk.green("✓ Auth workflow planned"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red(action === "record" ? "Failed to save auth memory" : "Failed to plan auth workflow"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

/**
 * Ergonomic alias: `auth:plan <url>` — same as `auth:test <url>` without `--record`.
 * Agents should call this FIRST for any website auth task. Returns the saved inbox,
 * password, and remembered per-site auth state so the next attempt can resume at
 * the right stage.
 */
export const authPlanCommand = new Command("auth:plan")
  .description("Plan the next auth step for a site. Returns saved email/password + known auth state from the DB. Call this before any signup/login attempt.")
  .argument("<url>", "Site URL or auth page URL")
  .option("--login-url <loginUrl>", "Known login URL for the site")
  .option("--intent <intent>", "Auth intent: auto, sign_in, sign_up", "auto")
  .option("--username <username>", "Username prefix when forcing a fresh inbox")
  .option("--name <name>", "Display name when forcing a fresh inbox")
  .option("--force-new-inbox", "Force a brand new inbox instead of reusing the saved primary inbox")
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const intent = String(opts.intent || "auto");
    if (!VALID_INTENTS.has(intent)) {
      console.error(chalk.red(`Invalid intent: ${intent}`));
      process.exit(1);
    }
    const spinner = ora(`Planning auth workflow for ${url}...`).start();
    try {
      const res = await callTool("auth_test_assist", {
        url,
        action: "plan",
        intent,
        loginUrl: opts.loginUrl,
        username: opts.username,
        display_name: opts.name,
        force_new_inbox: !!opts.forceNewInbox,
      });
      spinner.stop();
      console.log(chalk.green("✓ Auth plan"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to plan auth workflow"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

/**
 * Ergonomic alias: `auth:record <url> <outcome>` — persists the result of an
 * auth attempt to `websiteAuthMemories` so the next run resumes correctly.
 * Call this at the end of every signup/login attempt (success OR failure).
 */
export const authRecordCommand = new Command("auth:record")
  .description("Record the outcome of an auth attempt to the DB so the next run remembers what worked.")
  .argument("<url>", "Site URL the auth was attempted against")
  .argument("<outcome>", `Outcome: ${Array.from(VALID_OUTCOMES).join(" | ")}`)
  .option("--notes <notes>", "Optional freeform note to save with the auth memory")
  .action(async (url: string, outcome: string, opts: Record<string, string>) => {
    if (!VALID_OUTCOMES.has(outcome)) {
      console.error(chalk.red(`Invalid outcome: ${outcome}. Must be one of: ${Array.from(VALID_OUTCOMES).join(", ")}`));
      process.exit(1);
    }
    const spinner = ora(`Recording ${outcome} for ${url}...`).start();
    try {
      const res = await callTool("auth_test_assist", {
        url,
        action: "record",
        outcome,
        notes: opts.notes,
      });
      spinner.stop();
      console.log(chalk.green(`✓ Auth memory updated: ${outcome}`));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to save auth memory"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

export const authFindLoginCommand = new Command("auth:find-login")
  .description("Discover likely login or sign-in URLs for a site before attempting auth")
  .argument("<url>", "Base site URL")
  .action(async (url: string) => {
    const spinner = ora(`Finding login pages for ${url}...`).start();
    try {
      const res = await callTool("find_login_page", { url });
      spinner.stop();
      console.log(chalk.green("✓ Login page candidates found"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to find login pages"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const authSmartLoginCommand = new Command("auth:smart-login")
  .description("Attempt automated login with known credentials using the MCP smart_login flow")
  .argument("<loginUrl>", "Login page URL")
  .requiredOption("-u, --username <username>", "Username or email")
  .requiredOption("-p, --password <password>", "Password")
  .option("--username-selector <selector>", "Override username/email field selector")
  .option("--password-selector <selector>", "Override password field selector")
  .option("--submit-selector <selector>", "Override submit button selector")
  .action(async (loginUrl: string, opts: Record<string, string>) => {
    const spinner = ora(`Attempting smart login at ${loginUrl}...`).start();
    try {
      const res = await callTool("smart_login", {
        loginUrl,
        username: opts.username,
        password: opts.password,
        usernameSelector: opts.usernameSelector,
        passwordSelector: opts.passwordSelector,
        submitSelector: opts.submitSelector,
      });
      spinner.stop();
      console.log(chalk.green("✓ Smart login completed"));
      const screenshotUrl = extractImageUrl(res);
      if (screenshotUrl) {
        console.log(`  Screenshot: ${chalk.cyan(screenshotUrl)}`);
      }
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Smart login failed"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const authorizeEmailAccessCommand = new Command("auth:authorize-email")
  .description("Start Gmail OAuth so ScreenshotsMCP can read verification codes from the user's inbox")
  .action(async () => {
    const spinner = ora("Requesting Gmail authorization URL...").start();
    try {
      const res = await callTool("authorize_email_access");
      spinner.stop();
      console.log(chalk.green("✓ Gmail authorization started"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to start Gmail authorization"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });

export const readVerificationEmailCommand = new Command("auth:read-email")
  .description("Read the latest Gmail verification code after email access has been authorized")
  .option("--sender <sender>", "Optional sender email filter")
  .option("--subject <keyword>", "Optional subject keyword filter")
  .option("--max-age-minutes <minutes>", "Only search recent emails", "5")
  .action(async (opts: Record<string, string>) => {
    const spinner = ora("Reading verification email...").start();
    try {
      const res = await callTool("read_verification_email", {
        sender: opts.sender,
        subject_keyword: opts.subject,
        max_age_minutes: parseInt(opts.maxAgeMinutes, 10) || 5,
      });
      spinner.stop();
      console.log(chalk.green("✓ Verification email checked"));
      console.log(extractText(res));
    } catch (err) {
      spinner.fail(chalk.red("Failed to read verification email"));
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }
  });
