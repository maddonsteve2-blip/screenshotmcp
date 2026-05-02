import chalk from "chalk";
import {
  CORE_SKILL_NAME,
  getManagedSkillsManifestPath,
  listInstalledSkills,
  syncCoreSkill,
  type InstalledSkillSummary,
  type SkillSyncResult,
} from "../../types/src/skills.js";

export function syncCoreSkillForCli(): SkillSyncResult {
  return syncCoreSkill();
}

export function printSkillSyncResult(result: SkillSyncResult, options?: { prefix?: string }): void {
  const prefix = options?.prefix ? `${options.prefix} ` : "";
  const verb = getSkillSyncVerb(result.status);
  console.log(chalk.green(`✓ ${prefix}${verb} core skill \`${result.name}\``));
  console.log(chalk.dim(`  Version: ${result.version}`));
  console.log(chalk.dim(`  Path: ${result.installPath}`));
  console.log(chalk.dim(`  Manifest: ${getManagedSkillsManifestPath()}`));
}

export function printInstalledSkills(skills: InstalledSkillSummary[]): void {
  if (skills.length === 0) {
    console.log(chalk.yellow("No skills are installed yet."));
    console.log(chalk.dim(`Run \`deepsyte skills sync\` to install the core ${CORE_SKILL_NAME} skill.`));
    return;
  }

  console.log(chalk.bold("Installed skills\n"));
  for (const skill of skills) {
    const managedLabel = skill.managed ? chalk.green("managed") : chalk.gray("unmanaged");
    const versionLabel = skill.version ? chalk.dim(` v${skill.version}`) : "";
    console.log(`- ${chalk.cyan(skill.name)} ${managedLabel}${versionLabel}`);
    console.log(chalk.dim(`  ${skill.installPath}`));
  }
  console.log();
  console.log(chalk.dim(`Manifest: ${getManagedSkillsManifestPath()}`));
}

export function getInstalledSkillsForCli(): InstalledSkillSummary[] {
  return listInstalledSkills();
}

function getSkillSyncVerb(status: SkillSyncResult["status"]): string {
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
