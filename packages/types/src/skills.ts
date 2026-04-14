import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export const CORE_SKILL_NAME = "screenshotsmcp";
export const CORE_SKILL_VERSION = "2.1.0";
const MANIFEST_SCHEMA_VERSION = 1;
const INLINE_CODE_TOKEN = "__INLINE_CODE__";

export const CORE_SKILL_CONTENT = `---
name: screenshotsmcp
description: >
  Use this skill whenever the user needs to see, interact with, or verify a website from an AI workflow. Trigger it for screenshots, responsive checks, browser automation, login and sign-up testing, CAPTCHA solving, OTP or email verification, SEO or performance audits, accessibility inspection, or website debugging even if the user does not explicitly mention ScreenshotsMCP.
license: MIT
compatibility: Requires the ScreenshotsMCP MCP server connected and authenticated.
metadata:
  author: screenshotsmcp
  version: "2.1.0"
  website: https://www.screenshotmcp.com
  api: https://screenshotsmcp-api-production.up.railway.app
---

# ScreenshotsMCP

Use this skill to give the assistant eyes and hands for the web. First identify which workflow fits the request, then pick the smallest set of tools needed.

## Choose the right workflow

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

- Find the login page with ${INLINE_CODE_TOKEN}find_login_page${INLINE_CODE_TOKEN} when the URL is not known.
- Ask the user for credentials before using ${INLINE_CODE_TOKEN}smart_login${INLINE_CODE_TOKEN}. Never guess passwords.
- Use ${INLINE_CODE_TOKEN}create_test_inbox${INLINE_CODE_TOKEN} and ${INLINE_CODE_TOKEN}check_inbox${INLINE_CODE_TOKEN} for disposable email flows.
- Use ${INLINE_CODE_TOKEN}read_verification_email${INLINE_CODE_TOKEN} only after the user has authorized Gmail access.
- Use ${INLINE_CODE_TOKEN}solve_captcha${INLINE_CODE_TOKEN} when a CAPTCHA blocks progress.

### 4. Audit and debugging
Use audit and debug tools when the user wants findings, not just screenshots.

- Use ${INLINE_CODE_TOKEN}browser_perf_metrics${INLINE_CODE_TOKEN} for Core Web Vitals and network weight.
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
- Use ${INLINE_CODE_TOKEN}browser_navigate${INLINE_CODE_TOKEN}.
- Gather ${INLINE_CODE_TOKEN}browser_get_accessibility_tree${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}browser_perf_metrics${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}browser_seo_audit${INLINE_CODE_TOKEN}, ${INLINE_CODE_TOKEN}browser_console_logs${INLINE_CODE_TOKEN}, and ${INLINE_CODE_TOKEN}browser_network_errors${INLINE_CODE_TOKEN}.
- Summarize the highest-impact issues first.

### Login or sign-up test
- Discover the login page if needed.
- Collect credentials or create a test inbox.
- Solve CAPTCHA only if it appears.
- Verify the final authenticated or post-sign-up state before finishing.

## Guardrails

- Never guess credentials.
- Close sessions when finished.
- Prefer accessibility and DOM inspection over visual guessing when structure matters.
- Use the CLI workflow if terminal access is clearly faster than repeated MCP round-trips.
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
    name: CORE_SKILL_NAME,
    version: CORE_SKILL_VERSION,
  });
}

export function syncManagedSkill(input: { content: string; name: string; version: string }): SkillSyncResult {
  const manifest = readManagedSkillsManifest();
  const installPath = getSkillInstallPath(input.name);
  const skillFilePath = join(installPath, "SKILL.md");
  const existingContent = readTextFile(skillFilePath);
  const existingRecord = manifest.skills[input.name];
  const hasExactContent = existingContent === input.content;
  const hasCurrentVersion = existingRecord?.version === input.version;

  let status: SkillSyncStatus = "unchanged";

  if (!existingContent) {
    status = existingRecord ? "repaired" : "installed";
  } else if (!hasExactContent && hasCurrentVersion) {
    status = "repaired";
  } else if (!hasExactContent || !hasCurrentVersion) {
    status = existingRecord ? "updated" : "installed";
  }

  if (status !== "unchanged") {
    mkdirSync(installPath, { recursive: true });
    writeFileSync(skillFilePath, ensureTrailingNewline(input.content), "utf8");
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
