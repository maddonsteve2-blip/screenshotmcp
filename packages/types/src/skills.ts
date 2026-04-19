import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import {
  CORE_SKILL_CONTENT,
  CORE_SITEWIDE_PERFORMANCE_WORKFLOW_CONTENT,
  CORE_WORKOS_AUTHKIT_WORKFLOW_CONTENT,
} from "./skills/content.generated.js";

export const CORE_SKILL_NAME = "screenshotsmcp";
export const CORE_SKILL_VERSION = "2.5.0";
const MANIFEST_SCHEMA_VERSION = 1;

export {
  CORE_SKILL_CONTENT,
  CORE_SITEWIDE_PERFORMANCE_WORKFLOW_CONTENT,
  CORE_WORKOS_AUTHKIT_WORKFLOW_CONTENT,
};

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
const DEFAULT_CATALOG_URL = `${SKILLS_BASE_URL}/index.json`;
const DEFAULT_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Fallback catalog used when the hosted JSON at DEFAULT_CATALOG_URL is
 * unreachable. Keep this minimal; the authoritative catalog lives in
 * apps/web/public/.skills/index.json so that new skills ship without a types
 * release.
 */
export const SKILL_CATALOG: CatalogSkill[] = [
  {
    name: "screenshotsmcp",
    displayName: "ScreenshotsMCP Core",
    description: "Screenshot, browser automation, CAPTCHA solving, email testing, SEO/perf audits — the full 46+ tool suite.",
    version: CORE_SKILL_VERSION,
    contentUrl: `${SKILLS_BASE_URL}/screenshotsmcp/SKILL.md`,
  },
];

export interface CatalogStorage {
  get(key: string): string | undefined | PromiseLike<string | undefined>;
  set(key: string, value: string): void | PromiseLike<void>;
}

export interface RemoteCatalogOptions {
  storage?: CatalogStorage;
  /** Milliseconds. Defaults to 24h. */
  ttlMs?: number;
  /** Overrides the default catalog URL. */
  catalogUrl?: string;
  /** When true, bypasses the cache and fetches fresh. */
  force?: boolean;
}

interface CachedCatalog {
  fetchedAt: number;
  skills: CatalogSkill[];
}

const CATALOG_CACHE_KEY = "screenshotsmcp.skills.catalog.v1";

/**
 * Fetches the hosted skill catalog (apps/web/public/.skills/index.json).
 * Caches in the provided storage for `ttlMs` and falls back to the in-code
 * SKILL_CATALOG on any error. Safe to call on every extension activation.
 */
export async function fetchRemoteCatalog(options: RemoteCatalogOptions = {}): Promise<CatalogSkill[]> {
  const storage = options.storage;
  const ttlMs = options.ttlMs ?? DEFAULT_CATALOG_TTL_MS;
  const catalogUrl = options.catalogUrl ?? DEFAULT_CATALOG_URL;

  if (!options.force && storage) {
    const cached = await readCachedCatalog(storage);
    if (cached && Date.now() - cached.fetchedAt < ttlMs) {
      return cached.skills;
    }
  }

  try {
    const response = await fetch(catalogUrl, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return SKILL_CATALOG;
    }

    const parsed = (await response.json()) as unknown;
    const skills = parseCatalogPayload(parsed);
    if (!skills) {
      return SKILL_CATALOG;
    }

    if (storage) {
      const payload: CachedCatalog = { fetchedAt: Date.now(), skills };
      await storage.set(CATALOG_CACHE_KEY, JSON.stringify(payload));
    }
    return skills;
  } catch {
    return SKILL_CATALOG;
  }
}

async function readCachedCatalog(storage: CatalogStorage): Promise<CachedCatalog | undefined> {
  try {
    const raw = await storage.get(CATALOG_CACHE_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed) || typeof parsed.fetchedAt !== "number" || !Array.isArray(parsed.skills)) {
      return undefined;
    }
    const skills = parseCatalogSkills(parsed.skills);
    if (!skills) {
      return undefined;
    }
    return { fetchedAt: parsed.fetchedAt, skills };
  } catch {
    return undefined;
  }
}

function parseCatalogPayload(value: unknown): CatalogSkill[] | undefined {
  if (!isObject(value) || !Array.isArray(value.skills)) {
    return undefined;
  }
  return parseCatalogSkills(value.skills);
}

function parseCatalogSkills(raw: unknown[]): CatalogSkill[] | undefined {
  const out: CatalogSkill[] = [];
  for (const entry of raw) {
    if (!isObject(entry)) {
      return undefined;
    }
    if (
      typeof entry.name !== "string"
      || typeof entry.displayName !== "string"
      || typeof entry.description !== "string"
      || typeof entry.version !== "string"
      || typeof entry.contentUrl !== "string"
    ) {
      return undefined;
    }
    out.push({
      name: entry.name,
      displayName: entry.displayName,
      description: entry.description,
      version: entry.version,
      contentUrl: entry.contentUrl,
    });
  }
  return out;
}

export function getCatalogSkill(name: string, catalog: CatalogSkill[] = SKILL_CATALOG): CatalogSkill | undefined {
  return catalog.find((s) => s.name === name);
}

export function getAvailableSkills(catalog: CatalogSkill[] = SKILL_CATALOG): CatalogSkill[] {
  const installed = new Set(listInstalledSkills().map((s) => s.name));
  return catalog.filter((s) => !installed.has(s.name));
}

export async function installCatalogSkill(
  name: string,
  catalog: CatalogSkill[] = SKILL_CATALOG,
): Promise<SkillSyncResult> {
  const entry = getCatalogSkill(name, catalog);
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
