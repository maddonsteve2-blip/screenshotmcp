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
