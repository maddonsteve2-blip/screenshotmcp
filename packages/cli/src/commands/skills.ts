import { Command } from "commander";
import chalk from "chalk";
import { CORE_SKILL_INSTALL_PATH } from "@screenshotsmcp/types";
import {
  fetchRemoteCatalog,
  installCatalogSkill,
  SKILL_CATALOG,
  type CatalogSkill,
} from "@screenshotsmcp/types/skills";
import {
  getInstalledSkillsForCli,
  printInstalledSkills,
  printSkillSyncResult,
  syncCoreSkillForCli,
} from "../skills.js";

export const skillsCommand = new Command("skills")
  .description(`Manage the local ScreenshotsMCP core skill under ${CORE_SKILL_INSTALL_PATH}, including packaged workflows (not community skill discovery/install)`);

skillsCommand
  .command("list")
  .description("List installed skills under ~/.agents/skills and whether ScreenshotsMCP manages them")
  .action(() => {
    printInstalledSkills(getInstalledSkillsForCli());
  });

skillsCommand
  .command("sync")
  .description("Install, update, or repair the managed core ScreenshotsMCP skill and packaged workflow files")
  .action(() => {
    printSkillSyncResult(syncCoreSkillForCli());
  });

skillsCommand
  .command("update")
  .description("Alias for `skills sync` while add-on skill updates are not yet enabled")
  .action(() => {
    printSkillSyncResult(syncCoreSkillForCli(), { prefix: "Update" });
  });

skillsCommand
  .command("available")
  .description("List skills available in the hosted ScreenshotsMCP catalog")
  .option("--offline", "Use the built-in fallback catalog instead of fetching the hosted index", false)
  .action(async (opts: { offline?: boolean }) => {
    const catalog = await loadCatalog(opts.offline);
    if (catalog.length === 0) {
      console.log(chalk.yellow("No skills found in the catalog."));
      return;
    }
    console.log(chalk.bold("Available skills\n"));
    for (const skill of catalog) {
      console.log(`- ${chalk.cyan(skill.name)} ${chalk.dim(`v${skill.version}`)}`);
      console.log(`  ${chalk.bold(skill.displayName)}`);
      console.log(chalk.dim(`  ${skill.description}`));
    }
    console.log();
    console.log(chalk.dim(`Install with: screenshotsmcp skills install <name>`));
  });

skillsCommand
  .command("install <name>")
  .description("Install a skill from the hosted ScreenshotsMCP catalog into ~/.agents/skills/<name>")
  .option("--offline", "Resolve from the built-in fallback catalog only", false)
  .action(async (name: string, opts: { offline?: boolean }) => {
    try {
      const catalog = await loadCatalog(opts.offline);
      const result = await installCatalogSkill(name, catalog);
      printSkillSyncResult(result, { prefix: "Install" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`✗ Failed to install skill "${name}": ${message}`));
      process.exitCode = 1;
    }
  });

async function loadCatalog(offline: boolean | undefined): Promise<CatalogSkill[]> {
  if (offline) {
    return SKILL_CATALOG;
  }
  return fetchRemoteCatalog();
}
