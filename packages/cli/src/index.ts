import { Command } from "commander";
import { loginCommand, logoutCommand, whoamiCommand } from "./commands/login.js";
import {
  screenshotCommand, fullpageCommand, responsiveCommand, mobileCommand, tabletCommand,
  darkCommand, elementCommand, diffCommand, pdfCommand, crossBrowserCommand, batchCommand,
  screenshotsCommand, screenshotStatusCommand,
} from "./commands/screenshot.js";
import {
  browseCommand, browseViewportCommand, browseClickCommand, browseClickAtCommand, browseFillCommand,
  browseHoverCommand, browseSelectCommand, browseWaitForCommand, browseScreenshotCommand,
  browseCloseCommand, browseNavigateCommand, browseBackCommand, browseForwardCommand,
  browseScrollCommand, browseKeyCommand, browseTextCommand, browseA11yCommand,
  browseHtmlCommand, browseEvalCommand, browseConsoleCommand, browseNetworkErrorsCommand,
  browseNetworkRequestsCommand, browseCookiesCommand, browseStorageCommand, browseSeoCommand,
  browsePerfCommand, browseCaptchaCommand,
} from "./commands/browse.js";
import { browserCommand } from "./commands/browser.js";
import {
  authTestCommand,
  authFindLoginCommand,
  authSmartLoginCommand,
  authorizeEmailAccessCommand,
  readVerificationEmailCommand,
} from "./commands/auth-test.js";
import { inboxCreateCommand, inboxCheckCommand, inboxSendCommand } from "./commands/inbox.js";
import {
  uxReviewCommand, seoCommand, perfCommand, a11yCommand, ogPreviewCommand, breakpointsCommand,
} from "./commands/review.js";
import { installCommand } from "./commands/install.js";
import { skillsCommand } from "./commands/skills.js";
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
program.addCommand(authTestCommand);
program.addCommand(authFindLoginCommand);
program.addCommand(authSmartLoginCommand);
program.addCommand(authorizeEmailAccessCommand);
program.addCommand(readVerificationEmailCommand);

// Screenshots
program.addCommand(screenshotCommand);
program.addCommand(fullpageCommand);
program.addCommand(responsiveCommand);
program.addCommand(mobileCommand);
program.addCommand(tabletCommand);
program.addCommand(darkCommand);
program.addCommand(elementCommand);
program.addCommand(diffCommand);
program.addCommand(pdfCommand);
program.addCommand(crossBrowserCommand);
program.addCommand(batchCommand);
program.addCommand(screenshotsCommand);
program.addCommand(screenshotStatusCommand);

// Browser sessions
program.addCommand(browserCommand);
program.addCommand(browseCommand);
program.addCommand(browseViewportCommand);
program.addCommand(browseClickCommand);
program.addCommand(browseClickAtCommand);
program.addCommand(browseHoverCommand);
program.addCommand(browseSelectCommand);
program.addCommand(browseWaitForCommand);
program.addCommand(browseCloseCommand);
program.addCommand(browseNavigateCommand);
program.addCommand(browseBackCommand);
program.addCommand(browseForwardCommand);
program.addCommand(browseScreenshotCommand);
program.addCommand(browseScrollCommand);
program.addCommand(browseKeyCommand);
program.addCommand(browseFillCommand);
program.addCommand(browseTextCommand);
program.addCommand(browseA11yCommand);
program.addCommand(browseHtmlCommand);
program.addCommand(browseEvalCommand);
program.addCommand(browseConsoleCommand);
program.addCommand(browseNetworkErrorsCommand);
program.addCommand(browseNetworkRequestsCommand);
program.addCommand(browseCookiesCommand);
program.addCommand(browseStorageCommand);
program.addCommand(browseSeoCommand);
program.addCommand(browsePerfCommand);
program.addCommand(browseCaptchaCommand);

// Email inboxes
program.addCommand(inboxCreateCommand);
program.addCommand(inboxCheckCommand);
program.addCommand(inboxSendCommand);

// Outbound webhooks
program.addCommand(webhooksListCommand);
program.addCommand(webhooksCreateCommand);
program.addCommand(webhooksTestCommand);
program.addCommand(webhooksRotateCommand);
program.addCommand(webhooksDeliveriesCommand);
program.addCommand(webhooksDeleteCommand);

// Review / audit
program.addCommand(uxReviewCommand);
program.addCommand(seoCommand);
program.addCommand(perfCommand);
program.addCommand(a11yCommand);
program.addCommand(ogPreviewCommand);
program.addCommand(breakpointsCommand);

// Setup
program.addCommand(installCommand);
program.addCommand(skillsCommand);
program.addCommand(setupCommand);

program.parse();
