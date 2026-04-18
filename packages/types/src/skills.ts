import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export const CORE_SKILL_NAME = "screenshotsmcp";
export const CORE_SKILL_VERSION = "2.5.0";
const MANIFEST_SCHEMA_VERSION = 1;
const INLINE_CODE_TOKEN = "__INLINE_CODE__";

export const CORE_SKILL_CONTENT = `---
name: screenshotsmcp
description: >
  This skill should be used when the user asks to inspect, test, or verify a website, take screenshots, debug browser behavior, audit SEO or performance, test sign-in or sign-up flows, solve CAPTCHAs, create test inboxes, or otherwise needs browser truth from ScreenshotsMCP.
license: MIT
compatibility: Requires the ScreenshotsMCP MCP server connected and authenticated, or the ScreenshotsMCP CLI when terminal access is available.
metadata:
  author: screenshotsmcp
  version: "2.4.0"
  website: https://www.screenshotmcp.com
  api: https://screenshotsmcp-api-production.up.railway.app
---

# ScreenshotsMCP

Use this skill to give the assistant eyes and hands for the web. Use it to choose the right tool path, then read only the relevant workflow or reference for the task.

## Discovery model

- Treat ScreenshotsMCP tools as atomic actions.
- Treat this skill as broad guidance for choosing the right path.
- Treat packaged workflows as targeted procedures for repeatable multi-step jobs.
- When the task is an audit, verification flow, or another repeatable multi-step procedure, check the available workflows before improvising.
- For any site audit, performance audit, SEO audit, UX audit, full audit, or another repeatable multi-page public-site review, read ${INLINE_CODE_TOKEN}workflows/sitewide-performance-audit/WORKFLOW.md${INLINE_CODE_TOKEN} before opening browser sessions, running audit tools, or drafting findings.
- Do not read every workflow up front. Read only the workflow that matches the task.
- If terminal access exists and repeated tool calls are likely, prefer the CLI when it is clearly faster than repeated MCP round-trips. If terminal access is not available, stay in MCP.
- For multi-page performance audits in MCP, avoid opening many new browser sessions in parallel. Measure sequentially unless there is a proven reason to increase concurrency.

## Available workflows

- ${INLINE_CODE_TOKEN}workflows/sitewide-performance-audit/WORKFLOW.md${INLINE_CODE_TOKEN} — use when the user asks why a site is slow, wants the slowest pages identified, or wants a repeatable multi-page performance review.

## Escalation ladder (when MCP silently stalls)

Some sites reject traffic from the Railway-hosted cloud browser at the fingerprint level: Cloudflare Turnstile, WorkOS AuthKit (${INLINE_CODE_TOKEN}authk.*.ai${INLINE_CODE_TOKEN}, e.g. Smithery), Clerk bot-detection, and Akamai/PerimeterX-protected signups. ${INLINE_CODE_TOKEN}solve_captcha${INLINE_CODE_TOKEN} returns a valid token but Siteverify rejects it. Retrying is futile.

When a valid-looking submit silently does nothing (URL does not change, no error, form resets), escalate instead of retrying:

1. Start with MCP tools: ${INLINE_CODE_TOKEN}browser_navigate${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}smart_login${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}solve_captcha${INLINE_CODE_TOKEN}.
2. If MCP stalls, switch to the CLI local browser: ${INLINE_CODE_TOKEN}npx screenshotsmcp browser:start <url>${INLINE_CODE_TOKEN}, then drive real Chrome one atomic command at a time with ${INLINE_CODE_TOKEN}browser:click${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}browser:fill${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}browser:paste${INLINE_CODE_TOKEN} (React-compatible), ${INLINE_CODE_TOKEN}browser:wait-for${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}browser:inspect${INLINE_CODE_TOKEN}, and ${INLINE_CODE_TOKEN}browser:eval${INLINE_CODE_TOKEN}. Real Chrome on the user's residential IP passes trust checks the cloud browser cannot, often without even showing a CAPTCHA checkbox.
3. Always call ${INLINE_CODE_TOKEN}screenshotsmcp auth:plan <url>${INLINE_CODE_TOKEN} before a fresh auth attempt and ${INLINE_CODE_TOKEN}screenshotsmcp auth:record <url> <outcome>${INLINE_CODE_TOKEN} after. Inbox, password, and per-site auth state persist so the next run resumes correctly.
4. Use ${INLINE_CODE_TOKEN}+alias${INLINE_CODE_TOKEN} emails (e.g. ${INLINE_CODE_TOKEN}you+smithery@agentmail.to${INLINE_CODE_TOKEN}) to reuse a single inbox for multiple signups.

The interactive rule: after every ${INLINE_CODE_TOKEN}browser:*${INLINE_CODE_TOKEN} command, read the returned PNG, confirm the state, then issue the next command. No preset scripts.

## Choose the right tool path

### 1. One-shot capture
Use screenshot tools when the user only needs an image, diff, PDF, or responsive set.

- Prefer ${INLINE_CODE_TOKEN}screenshot_responsive${INLINE_CODE_TOKEN} over separate desktop, tablet, and mobile captures.
- Use ${INLINE_CODE_TOKEN}screenshot_element${INLINE_CODE_TOKEN} when the user only cares about a selector.
- For very long pages, avoid unreadable strips by using ${INLINE_CODE_TOKEN}fullPage: false${INLINE_CODE_TOKEN} or ${INLINE_CODE_TOKEN}maxHeight${INLINE_CODE_TOKEN}.

### 2. Interactive browser task
Use browser session tools when the user needs clicks, typing, hover states, navigation, or data extraction from a live page.

- Start with ${INLINE_CODE_TOKEN}browser_navigate${INLINE_CODE_TOKEN} and carry the returned ${INLINE_CODE_TOKEN}sessionId${INLINE_CODE_TOKEN} through the workflow.
- Prefer ${INLINE_CODE_TOKEN}browser_get_accessibility_tree${INLINE_CODE_TOKEN} when you need structure, forms, buttons, and labels.
- Always call ${INLINE_CODE_TOKEN}browser_close${INLINE_CODE_TOKEN} when the workflow is finished.

### 3. Auth, sign-up, and verification
Use the auth workflow when the user needs to test protected or multi-step flows.

- Start with ${INLINE_CODE_TOKEN}auth_test_assist${INLINE_CODE_TOKEN} for website auth work. It is the primary auth entrypoint: it reuses the saved inbox/password, checks remembered auth history for the site's origin, and returns recommended auth path, account-exists confidence, likely auth method, and expected follow-up.
- Treat the helper's reusable strategy as the default cross-site guidance, and treat per-site hints as evidence rather than universal rules.
- Find the login page with ${INLINE_CODE_TOKEN}find_login_page${INLINE_CODE_TOKEN} when the URL is not known.
- Ask the user for credentials before using ${INLINE_CODE_TOKEN}smart_login${INLINE_CODE_TOKEN}. Never guess passwords.
- If ${INLINE_CODE_TOKEN}smart_login${INLINE_CODE_TOKEN} is uncertain on Clerk or multi-step auth UIs, fall back to ${INLINE_CODE_TOKEN}browser_fill${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}browser_press_key${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}browser_evaluate${INLINE_CODE_TOKEN}, and inspect ${INLINE_CODE_TOKEN}browser_network_requests${INLINE_CODE_TOKEN} or ${INLINE_CODE_TOKEN}browser_console_logs${INLINE_CODE_TOKEN} before concluding the login failed.
- Use ${INLINE_CODE_TOKEN}create_test_inbox${INLINE_CODE_TOKEN} only when you explicitly need a fresh inbox or a standalone inbox workflow.
- Use ${INLINE_CODE_TOKEN}check_inbox${INLINE_CODE_TOKEN} for OTP and verification flows.
- Use ${INLINE_CODE_TOKEN}read_verification_email${INLINE_CODE_TOKEN} only after the user has authorized Gmail access.
- Use ${INLINE_CODE_TOKEN}solve_captcha${INLINE_CODE_TOKEN} when a CAPTCHA blocks progress.
- After a successful or failed auth attempt, call ${INLINE_CODE_TOKEN}auth_test_assist${INLINE_CODE_TOKEN} with ${INLINE_CODE_TOKEN}action: "record"${INLINE_CODE_TOKEN} to save what happened for future runs.

### 4. Audit and debugging
Use audit and debug tools when the user wants findings, not just screenshots.

- If the task is a repeatable multi-page performance audit or another repeatable multi-page public-site audit, read ${INLINE_CODE_TOKEN}workflows/sitewide-performance-audit/WORKFLOW.md${INLINE_CODE_TOKEN} first.
- If the user provides the site or base URL but not a page list, infer a representative public page set and start without blocking on clarification.
- Default authenticated pages to out of scope unless the user explicitly asks for login, dashboard, account, or another protected flow.
- Ask a blocking clarification question only when the base URL is missing or when protected-page scope is essential and still ambiguous.
- Before tool use, explicitly state that you read the workflow, the page set you will audit, whether authenticated pages are in scope, and whether you will use MCP or CLI first.
- If you start a generic live audit before reading the workflow, the audit is invalid and must be restarted from the workflow.
- Use ${INLINE_CODE_TOKEN}browser_perf_metrics${INLINE_CODE_TOKEN} for Core Web Vitals and network weight.
- For repeatable public-page performance audits in MCP, run ${INLINE_CODE_TOKEN}browser_navigate${INLINE_CODE_TOKEN} and ${INLINE_CODE_TOKEN}browser_perf_metrics${INLINE_CODE_TOKEN} sequentially page by page instead of fanning out multiple new sessions at once.
- If the CLI path would need approval and MCP is already available, begin with MCP instead of stalling mid-audit.
- Use ${INLINE_CODE_TOKEN}browser_seo_audit${INLINE_CODE_TOKEN} for metadata, heading structure, and structured data.
- Use ${INLINE_CODE_TOKEN}browser_console_logs${INLINE_CODE_TOKEN} and ${INLINE_CODE_TOKEN}browser_network_errors${INLINE_CODE_TOKEN} to investigate failures.
- Use ${INLINE_CODE_TOKEN}ux_review${INLINE_CODE_TOKEN} when the user wants a broader product or UX assessment.

## Default operating style

- Say briefly what you are about to capture or inspect before starting.
- Prefer the fewest tools that answer the question.
- If a session already exists, reuse it instead of opening a new one.
- When the user wants a report, summarize the most important findings first, then cite the supporting outputs.

## Common patterns

### Responsive check
- Use ${INLINE_CODE_TOKEN}screenshot_responsive${INLINE_CODE_TOKEN}.
- Compare layout shifts across desktop, tablet, and mobile.
- Call out breakpoints, clipping, and hierarchy issues.

### Site audit
- Read ${INLINE_CODE_TOKEN}workflows/sitewide-performance-audit/WORKFLOW.md${INLINE_CODE_TOKEN} first for repeatable multi-page public-site audits.
- If the user gives you a site URL but no page list, infer the public page set and proceed instead of asking permission to start.
- Use ${INLINE_CODE_TOKEN}browser_navigate${INLINE_CODE_TOKEN}.
- Gather ${INLINE_CODE_TOKEN}browser_get_accessibility_tree${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}browser_perf_metrics${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}browser_seo_audit${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}browser_console_logs${INLINE_CODE_TOKEN}, and ${INLINE_CODE_TOKEN}browser_network_errors${INLINE_CODE_TOKEN}.
- Summarize the highest-impact issues first.

### Login or sign-up test
- Start with ${INLINE_CODE_TOKEN}auth_test_assist${INLINE_CODE_TOKEN} for the site URL.
- Reuse the saved primary inbox and password unless you have a reason to force a fresh inbox.
- Read the helper's account-exists confidence, likely auth method, and expected follow-up before deciding whether to sign in or sign up first.
- Discover the login page if needed.
- Solve CAPTCHA only if it appears.
- Use ${INLINE_CODE_TOKEN}check_inbox${INLINE_CODE_TOKEN} for verification steps.
- When reporting results, summarize reusable auth-system heuristics first, then cite the site-specific evidence that supported them.
- Record the outcome with ${INLINE_CODE_TOKEN}auth_test_assist${INLINE_CODE_TOKEN} before finishing.

## Guardrails

- Never guess credentials.
- Close sessions when finished.
- Prefer accessibility and DOM inspection over visual guessing when structure matters.
- Use the CLI workflow if terminal access is clearly faster than repeated MCP round-trips.
`.replaceAll(INLINE_CODE_TOKEN, "`");

export const CORE_SITEWIDE_PERFORMANCE_WORKFLOW_CONTENT = `---
name: sitewide-performance-audit
description: >
  This workflow must be used when the user asks to "run a sitewide performance audit", "check why a site is slow", "find the slowest pages", "measure Core Web Vitals across key pages", asks for a site audit, or otherwise wants a repeatable multi-page public-site review.
---
# Sitewide Performance Audit
Read this workflow before opening browser sessions, running audit tools, or drafting findings for any repeatable multi-page public-site audit. If you start a generic live audit before reading this workflow, the audit is invalid and must be restarted from here.
Use this workflow for repeatable performance investigations across multiple pages. Infer a practical default scope when the user gives you enough to start, gather comparable evidence page by page, and summarize the highest-impact patterns before listing isolated issues.
Before tool use, explicitly state:
- that you read ${INLINE_CODE_TOKEN}workflows/sitewide-performance-audit/WORKFLOW.md${INLINE_CODE_TOKEN}
- the page set you will audit
- whether authenticated pages are in scope
- whether you will use MCP or CLI first
## Inputs to confirm
- Confirm the base URL. If it is missing, ask for it before starting.
- If the user does not provide a page set, infer a representative public set such as homepage, pricing, docs, install, sign-in, and one heavier content page or public product surface.
- Default authenticated pages to out of scope unless the user explicitly asks for login, dashboard, account, or another protected flow.
- If authenticated scope is essential to the user's request and still ambiguous, ask one blocking clarification question before starting protected-page checks.
- Confirm whether terminal access exists. If it does and repeated page checks are likely, the CLI may be faster than repeated MCP round-trips.
- Confirm whether command approval is likely to interrupt progress. If approval would stall the run, prefer MCP first.
## Tool path selection
- Use MCP directly when terminal access is unavailable.
- Use the CLI when repeated page checks make it clearly faster and the command path is already available or can be approved up front.
- If the CLI path would block on approval and MCP is already available, begin with MCP instead of stalling.
- Use remote ${INLINE_CODE_TOKEN}browse:*${INLINE_CODE_TOKEN} / browser session tools for public pages.
- Use the managed local browser only for localhost, VPN-only, or explicitly approval-gated environments.
## Evidence to capture for each page
- URL tested
- LCP
- FCP
- CLS
- TTFB
- DOM size and resource count when available
- The slowest requests or heaviest assets when they materially affect the page
- Console or network failures if they appear related
## Execution sequence
1. Define the page list before starting measurements.
2. If the user did not specify pages, infer the page list and proceed without waiting for permission.
3. Start with the most business-critical page so early findings are useful even if scope changes.
4. For each page, capture performance metrics first.
5. In MCP, open and measure pages sequentially. Do not fan out multiple new ${INLINE_CODE_TOKEN}browser_navigate${INLINE_CODE_TOKEN} sessions at once for a public performance audit.
6. If a page looks slow, inspect the network waterfall or failed requests before moving on.
7. If an MCP transport call fails mid-run, reuse the sessions that succeeded and continue sequentially instead of restarting the audit.
8. Keep the evidence format consistent across pages so rankings are comparable.
9. Reuse an active session when that reduces overhead without changing the measurement goal.
10. Close active sessions when the audit is complete.
## Preferred tools
- MCP path: for each page, run ${INLINE_CODE_TOKEN}browser_navigate${INLINE_CODE_TOKEN} → ${INLINE_CODE_TOKEN}browser_perf_metrics${INLINE_CODE_TOKEN} → ${INLINE_CODE_TOKEN}browser_network_requests${INLINE_CODE_TOKEN} / ${INLINE_CODE_TOKEN}browser_network_errors${INLINE_CODE_TOKEN} as needed. Keep the MCP path sequential unless there is a proven reason to increase concurrency.
- CLI path for repeated checks: ${INLINE_CODE_TOKEN}screenshotsmcp perf <url>${INLINE_CODE_TOKEN} for quick page-level metrics, or ${INLINE_CODE_TOKEN}screenshotsmcp browse <url>${INLINE_CODE_TOKEN} followed by ${INLINE_CODE_TOKEN}browse:perf${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}browse:network-requests${INLINE_CODE_TOKEN}, and ${INLINE_CODE_TOKEN}browse:network-errors${INLINE_CODE_TOKEN} when deeper evidence is needed. If this path needs approval, ask once up front instead of switching mid-audit.
## Output shape
Always structure the result like this:
# Sitewide Performance Audit
## Executive summary
## Slowest pages
## Cross-site patterns
## Page-by-page evidence
## Recommended fixes
## Reporting rules
- Rank the worst pages first.
- Highlight cross-site patterns before one-off issues.
- Separate measured evidence from hypotheses.
- Keep recommendations concrete and tied to the captured evidence.
- If the audit was partial, say which pages were included and which were not.
`.replaceAll(INLINE_CODE_TOKEN, "`");

export const CORE_WORKOS_AUTHKIT_WORKFLOW_CONTENT = `---
name: workos-authkit-signup
description: >
  Use this workflow when the sign-up or sign-in page redirects to an ${INLINE_CODE_TOKEN}authk.*.ai${INLINE_CODE_TOKEN} host (WorkOS AuthKit). The flow is automatable right up to the Cloudflare Turnstile checkbox, where a human click is required.
---
# WorkOS AuthKit sign-up

## Identify
The site uses WorkOS AuthKit if any of these are true:
- The URL is under ${INLINE_CODE_TOKEN}authk.<vendor>.ai${INLINE_CODE_TOKEN} (e.g. ${INLINE_CODE_TOKEN}authk.smithery.ai${INLINE_CODE_TOKEN}).
- Telemetry requests hit ${INLINE_CODE_TOKEN}forwarder.workos.com${INLINE_CODE_TOKEN} or ${INLINE_CODE_TOKEN}o207216.ingest.sentry.io${INLINE_CODE_TOKEN}.
- The page loads ${INLINE_CODE_TOKEN}challenges.cloudflare.com/turnstile/v0/api.js?...render=explicit${INLINE_CODE_TOKEN}.

## Flow that works
1. ${INLINE_CODE_TOKEN}auth_test_assist${INLINE_CODE_TOKEN} with ${INLINE_CODE_TOKEN}intent: sign_up${INLINE_CODE_TOKEN} to reuse or provision a disposable inbox.
2. ${INLINE_CODE_TOKEN}browser_navigate${INLINE_CODE_TOKEN} to the sign-up URL.
3. ${INLINE_CODE_TOKEN}browser_fill input[type=email]${INLINE_CODE_TOKEN} with the disposable address, then ${INLINE_CODE_TOKEN}browser_click 'Sign up'${INLINE_CODE_TOKEN}.
4. Fill the first-name, last-name, and email fields (emails can be duplicated).
5. ${INLINE_CODE_TOKEN}browser_click button:has-text('Continue')${INLINE_CODE_TOKEN}. You will land on a Turnstile gate.

## Extract the Turnstile sitekey (not in the DOM)
WorkOS uses ${INLINE_CODE_TOKEN}render=explicit${INLINE_CODE_TOKEN} so the sitekey is not in ${INLINE_CODE_TOKEN}data-sitekey${INLINE_CODE_TOKEN}. Pull it from the resource list via ${INLINE_CODE_TOKEN}browser_evaluate${INLINE_CODE_TOKEN}:

${INLINE_CODE_TOKEN}${INLINE_CODE_TOKEN}${INLINE_CODE_TOKEN}js
performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('turnstile/f/'))
${INLINE_CODE_TOKEN}${INLINE_CODE_TOKEN}${INLINE_CODE_TOKEN}

The sitekey is embedded in the path after ${INLINE_CODE_TOKEN}/turnstile/f/ov2/av0/rch/{slot}/${INLINE_CODE_TOKEN}.

## Hard wall: do not try to bypass Turnstile
- ${INLINE_CODE_TOKEN}solve_captcha${INLINE_CODE_TOKEN} returns a valid token. The token verifies on Cloudflare's side.
- Token injection into the iframed widget is blocked. Synthetic clicks on the checkbox are fingerprinted and rejected.
- This is anti-automation working as designed. Stop when you reach the checkbox.

## Hand off to the human
1. Record the attempt via ${INLINE_CODE_TOKEN}auth_test_assist${INLINE_CODE_TOKEN} with ${INLINE_CODE_TOKEN}action: 'record', outcome: 'signup_failed'${INLINE_CODE_TOKEN} and notes describing the Turnstile stop.
2. Give the user:
   - The sign-up URL you paused on.
   - The disposable inbox email.
   - The command to check it: ${INLINE_CODE_TOKEN}screenshotsmcp inbox:check --inbox-id <email>${INLINE_CODE_TOKEN}.
3. Ask them to click the Turnstile checkbox and submit. Typically 10 seconds.

## After the human click
WorkOS flows usually follow one of these paths:
- Session cookie set immediately — resume automation.
- Magic link emailed — ${INLINE_CODE_TOKEN}check_inbox${INLINE_CODE_TOKEN}, then ${INLINE_CODE_TOKEN}browser_navigate${INLINE_CODE_TOKEN} to the link.
- OTP emailed — ${INLINE_CODE_TOKEN}check_inbox${INLINE_CODE_TOKEN}, then ${INLINE_CODE_TOKEN}browser_fill${INLINE_CODE_TOKEN} the code.

## Contrast with Clerk
Clerk exposes a programmatic sign-up API (${INLINE_CODE_TOKEN}window.Clerk.client.signUp.create(...)${INLINE_CODE_TOKEN}) that accepts solved CAPTCHA tokens, and its sitekey is readable from ${INLINE_CODE_TOKEN}/v1/environment${INLINE_CODE_TOKEN}. WorkOS has no equivalent programmatic path — the Turnstile click is the gate.

## Known WorkOS-backed sites
- Smithery (${INLINE_CODE_TOKEN}authk.smithery.ai${INLINE_CODE_TOKEN}) — publish flow at ${INLINE_CODE_TOKEN}/servers/new${INLINE_CODE_TOKEN}.

Add more as you encounter them. If a site pretends to be WorkOS but does not redirect to ${INLINE_CODE_TOKEN}authk.*.ai${INLINE_CODE_TOKEN}, do not assume this wall applies — drive the flow and see.
`.replaceAll(INLINE_CODE_TOKEN, "`");

// ---------------------------------------------------------------------------
// Curated skill catalog
// ---------------------------------------------------------------------------

export interface CatalogSkill {
  name: string;
  displayName: string;
  description: string;
  version: string;
  /** URL to fetch SKILL.md content from */
  contentUrl: string;
}

const SKILLS_BASE_URL = "https://www.screenshotmcp.com/.skills";

export const SKILL_CATALOG: CatalogSkill[] = [
  {
    name: "screenshotsmcp",
    displayName: "ScreenshotsMCP Core",
    description: "Screenshot, browser automation, CAPTCHA solving, email testing, SEO/perf audits — the full 46+ tool suite.",
    version: CORE_SKILL_VERSION,
    contentUrl: `${SKILLS_BASE_URL}/screenshotsmcp/SKILL.md`,
  },
];

export function getCatalogSkill(name: string): CatalogSkill | undefined {
  return SKILL_CATALOG.find((s) => s.name === name);
}

export function getAvailableSkills(): CatalogSkill[] {
  const installed = new Set(listInstalledSkills().map((s) => s.name));
  return SKILL_CATALOG.filter((s) => !installed.has(s.name));
}

export async function installCatalogSkill(name: string): Promise<SkillSyncResult> {
  const entry = getCatalogSkill(name);
  if (!entry) {
    throw new Error(`Skill "${name}" is not in the catalog.`);
  }

  // Core skill is embedded — no network fetch needed
  if (name === CORE_SKILL_NAME) {
    return syncCoreSkill();
  }

  const response = await fetch(entry.contentUrl);
  if (!response.ok) {
    throw new Error(`Failed to download skill "${name}" from ${entry.contentUrl}: ${response.status} ${response.statusText}`);
  }

  const content = await response.text();
  return syncManagedSkill({ content, name: entry.name, version: entry.version });
}

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

export interface ManagedSkillRecord {
  installPath: string;
  managedBy: "screenshotsmcp";
  updatedAt: string;
  version: string;
}

export interface ManagedSkillsManifest {
  schemaVersion: number;
  skills: Record<string, ManagedSkillRecord>;
  updatedAt: string;
}

export interface InstalledSkillSummary {
  installPath: string;
  managed: boolean;
  name: string;
  version?: string;
}

export type SkillSyncStatus = "installed" | "updated" | "repaired" | "unchanged";

export interface SkillSyncResult {
  installPath: string;
  name: string;
  status: SkillSyncStatus;
  version: string;
}

export interface ManagedSkillFile {
  content: string;
  relativePath: string;
}

export function getManagedStateDir(): string {
  return join(homedir(), ".screenshotsmcp");
}

export function getManagedSkillsManifestPath(): string {
  return join(getManagedStateDir(), "skills-manifest.json");
}

export function getSkillsRootDir(): string {
  return join(homedir(), ".agents", "skills");
}

export function getSkillInstallPath(name: string): string {
  return join(getSkillsRootDir(), name);
}

export function listInstalledSkills(): InstalledSkillSummary[] {
  const manifest = readManagedSkillsManifest();
  const skillsRoot = getSkillsRootDir();
  const entries = existsSync(skillsRoot)
    ? readdirSync(skillsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

  return entries
    .map((name) => {
      const record = manifest.skills[name];
      return {
        installPath: getSkillInstallPath(name),
        managed: Boolean(record),
        name,
        version: record?.version,
      } satisfies InstalledSkillSummary;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function syncCoreSkill(): SkillSyncResult {
  return syncManagedSkill({
    content: CORE_SKILL_CONTENT,
    files: [
      {
        content: CORE_SITEWIDE_PERFORMANCE_WORKFLOW_CONTENT,
        relativePath: join("workflows", "sitewide-performance-audit", "WORKFLOW.md"),
      },
      {
        content: CORE_WORKOS_AUTHKIT_WORKFLOW_CONTENT,
        relativePath: join("workflows", "workos-authkit-signup", "WORKFLOW.md"),
      },
    ],
    name: CORE_SKILL_NAME,
    version: CORE_SKILL_VERSION,
  });
}

export function syncManagedSkill(input: { content: string; files?: ManagedSkillFile[]; name: string; version: string }): SkillSyncResult {
  const manifest = readManagedSkillsManifest();
  const installPath = getSkillInstallPath(input.name);
  const files = [{ content: input.content, relativePath: "SKILL.md" }, ...(input.files ?? [])];
  const allFilesPresent = files.every((file) => readTextFile(join(installPath, file.relativePath)) !== "");
  const hasExactContent = files.every((file) => readTextFile(join(installPath, file.relativePath)) === ensureTrailingNewline(file.content));
  const existingRecord = manifest.skills[input.name];
  const hasCurrentVersion = existingRecord?.version === input.version;

  let status: SkillSyncStatus = "unchanged";

  if (!allFilesPresent) {
    status = existingRecord ? (hasCurrentVersion ? "repaired" : "updated") : "installed";
  } else if (!hasExactContent && hasCurrentVersion) {
    status = "repaired";
  } else if (!hasExactContent || !hasCurrentVersion) {
    status = existingRecord ? "updated" : "installed";
  }

  if (status !== "unchanged") {
    for (const file of files) {
      const filePath = join(installPath, file.relativePath);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, ensureTrailingNewline(file.content), "utf8");
    }
  }

  manifest.skills[input.name] = {
    installPath,
    managedBy: "screenshotsmcp",
    updatedAt: new Date().toISOString(),
    version: input.version,
  };
  manifest.updatedAt = new Date().toISOString();
  writeManagedSkillsManifest(manifest);

  return {
    installPath,
    name: input.name,
    status,
    version: input.version,
  };
}

function readManagedSkillsManifest(): ManagedSkillsManifest {
  const parsed = readJsonFile(getManagedSkillsManifestPath());
  if (!isObject(parsed) || typeof parsed.updatedAt !== "string" || !isObject(parsed.skills)) {
    return createEmptyManifest();
  }

  const skills: Record<string, ManagedSkillRecord> = {};
  for (const [name, value] of Object.entries(parsed.skills)) {
    if (!isObject(value)) {
      continue;
    }
    if (
      typeof value.installPath !== "string"
      || typeof value.updatedAt !== "string"
      || typeof value.version !== "string"
    ) {
      continue;
    }

    skills[name] = {
      installPath: value.installPath,
      managedBy: "screenshotsmcp",
      updatedAt: value.updatedAt,
      version: value.version,
    };
  }

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    skills,
    updatedAt: parsed.updatedAt,
  };
}

function writeManagedSkillsManifest(manifest: ManagedSkillsManifest): void {
  const path = getManagedSkillsManifestPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function createEmptyManifest(): ManagedSkillsManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    skills: {},
    updatedAt: new Date(0).toISOString(),
  };
}

function readTextFile(path: string): string {
  if (!existsSync(path)) {
    return "";
  }

  return readFileSync(path, "utf8");
}

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
