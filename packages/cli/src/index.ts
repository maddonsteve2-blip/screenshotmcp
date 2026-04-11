import { Command } from "commander";
import { loginCommand, logoutCommand, whoamiCommand } from "./commands/login.js";
import {
  screenshotCommand, responsiveCommand, mobileCommand, tabletCommand,
  darkCommand, elementCommand, diffCommand, pdfCommand, crossBrowserCommand, batchCommand,
} from "./commands/screenshot.js";
import {
  browseCommand, browseClickCommand, browseFillCommand, browseScreenshotCommand,
  browseCloseCommand, browseNavigateCommand, browseScrollCommand, browseKeyCommand,
  browseTextCommand, browseHtmlCommand,
} from "./commands/browse.js";
import { inboxCreateCommand, inboxCheckCommand, inboxSendCommand } from "./commands/inbox.js";
import {
  uxReviewCommand, seoCommand, perfCommand, a11yCommand, breakpointsCommand,
} from "./commands/review.js";
import { installCommand } from "./commands/install.js";
import { setupCommand } from "./commands/setup.js";

const program = new Command();

program
  .name("screenshotsmcp")
  .description("CLI for ScreenshotsMCP — take screenshots, record sessions, audit sites from the terminal")
  .version("1.0.0");

// Auth
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);

// Screenshots
program.addCommand(screenshotCommand);
program.addCommand(responsiveCommand);
program.addCommand(mobileCommand);
program.addCommand(tabletCommand);
program.addCommand(darkCommand);
program.addCommand(elementCommand);
program.addCommand(diffCommand);
program.addCommand(pdfCommand);
program.addCommand(crossBrowserCommand);
program.addCommand(batchCommand);

// Browser sessions
program.addCommand(browseCommand);
program.addCommand(browseClickCommand);
program.addCommand(browseCloseCommand);
program.addCommand(browseNavigateCommand);
program.addCommand(browseScreenshotCommand);
program.addCommand(browseScrollCommand);
program.addCommand(browseKeyCommand);
program.addCommand(browseFillCommand);
program.addCommand(browseTextCommand);
program.addCommand(browseHtmlCommand);

// Email inboxes
program.addCommand(inboxCreateCommand);
program.addCommand(inboxCheckCommand);
program.addCommand(inboxSendCommand);

// Review / audit
program.addCommand(uxReviewCommand);
program.addCommand(seoCommand);
program.addCommand(perfCommand);
program.addCommand(a11yCommand);
program.addCommand(breakpointsCommand);

// Setup
program.addCommand(installCommand);
program.addCommand(setupCommand);

program.parse();
