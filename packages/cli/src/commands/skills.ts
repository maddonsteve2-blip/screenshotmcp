import { Command } from "commander";
import { CORE_SKILL_INSTALL_PATH } from "@screenshotsmcp/types";
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
