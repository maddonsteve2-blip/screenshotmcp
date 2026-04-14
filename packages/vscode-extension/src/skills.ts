import {
  installCatalogSkill,
  listInstalledSkills,
  SKILL_CATALOG,
  syncCoreSkill,
  type CatalogSkill,
  type InstalledSkillSummary,
  type SkillSyncResult,
} from "../../types/src/skills.js";
import { logLine } from "./output";
import { TimelineStore } from "./timeline/store";

export interface ExtensionSkillSyncOutcome {
  errorMessage?: string;
  installPath: string;
  ok: boolean;
  result?: SkillSyncResult;
}

export function syncCoreSkillForExtension(timelineStore: TimelineStore): ExtensionSkillSyncOutcome {
  logLine("Starting core skill sync.");

  try {
    const result = syncCoreSkill();
    const title = getTimelineTitle(result.status);
    const detail = `${result.installPath} · v${result.version}`;
    const status = result.status === "unchanged" ? "info" : "success";

    timelineStore.add({
      title,
      detail,
      status,
    });
    logLine(`${title}: ${detail}`);
    return {
      installPath: result.installPath,
      ok: true,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    timelineStore.add({
      title: "Core skill sync failed",
      detail: message,
      status: "error",
    });
    logLine(`Core skill sync failed: ${message}`);
    return {
      errorMessage: message,
      installPath: "~/.agents/skills/screenshotsmcp",
      ok: false,
    };
  }
}

export function formatSkillSyncMessage(result: SkillSyncResult): string {
  const verb = getActionLabel(result.status);
  return `${verb} the core ScreenshotsMCP skill at ${result.installPath}.`;
}

export function formatSkillSyncFailureMessage(outcome: ExtensionSkillSyncOutcome): string {
  return `Failed to sync the core ScreenshotsMCP skill at ${outcome.installPath}: ${outcome.errorMessage ?? "Unknown error"}.`;
}

function getTimelineTitle(status: SkillSyncResult["status"]): string {
  if (status === "installed") {
    return "Core skill installed";
  }

  if (status === "updated") {
    return "Core skill updated";
  }

  if (status === "repaired") {
    return "Core skill repaired";
  }

  return "Core skill verified";
}

function getActionLabel(status: SkillSyncResult["status"]): string {
  if (status === "installed") {
    return "Installed";
  }

  if (status === "updated") {
    return "Updated";
  }

  if (status === "repaired") {
    return "Repaired";
  }

  return "Verified";
}

// ---------------------------------------------------------------------------
// Catalog helpers for sidebar
// ---------------------------------------------------------------------------

export function getInstalledSkillsForSidebar(): InstalledSkillSummary[] {
  try {
    return listInstalledSkills();
  } catch {
    return [];
  }
}

export function getAvailableSkillsForSidebar(): CatalogSkill[] {
  try {
    const installed = new Set(listInstalledSkills().map((s) => s.name));
    return SKILL_CATALOG.filter((s) => !installed.has(s.name));
  } catch {
    return SKILL_CATALOG;
  }
}

export async function installCatalogSkillForExtension(
  name: string,
  timelineStore: TimelineStore,
): Promise<ExtensionSkillSyncOutcome> {
  logLine(`Installing catalog skill: ${name}`);
  try {
    const result = await installCatalogSkill(name);
    const title = `Skill "${name}" ${getActionLabel(result.status).toLowerCase()}`;
    const detail = `${result.installPath} · v${result.version}`;
    timelineStore.add({ title, detail, status: "success" });
    logLine(`${title}: ${detail}`);
    return { installPath: result.installPath, ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    timelineStore.add({ title: `Skill "${name}" install failed`, detail: message, status: "error" });
    logLine(`Skill "${name}" install failed: ${message}`);
    return { errorMessage: message, installPath: `~/.agents/skills/${name}`, ok: false };
  }
}
