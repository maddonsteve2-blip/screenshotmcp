import { Command } from "commander";
import {
  getInstalledSkillsForCli,
  printInstalledSkills,
  printSkillSyncResult,
  syncCoreSkillForCli,
} from "../skills.js";

export const skillsCommand = new Command("skills")
  .description("Manage the local ScreenshotsMCP core skill under ~/.agents/skills/screenshotsmcp (not community skill discovery/install)");

skillsCommand
  .command("list")
  .description("List installed skills under ~/.agents/skills and whether ScreenshotsMCP manages them")
  .action(() => {
    printInstalledSkills(getInstalledSkillsForCli());
  });

skillsCommand
  .command("sync")
  .description("Install, update, or repair the managed core ScreenshotsMCP skill")
  .action(() => {
    printSkillSyncResult(syncCoreSkillForCli());
  });

skillsCommand
  .command("update")
  .description("Alias for `skills sync` while add-on skill updates are not yet enabled")
  .action(() => {
    printSkillSyncResult(syncCoreSkillForCli(), { prefix: "Update" });
  });
