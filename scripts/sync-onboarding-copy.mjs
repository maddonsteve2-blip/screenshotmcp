#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const checkOnly = process.argv.includes("--check");
const canonicalSource = readFileSync(resolve(rootDir, "packages/types/src/index.ts"), "utf8");

function extractConstString(name) {
  const match = canonicalSource.match(new RegExp(`export const ${name}(?::[^=]+)? = "([^"]+)";`));
  if (!match) {
    throw new Error(`Could not find string constant ${name} in packages/types/src/index.ts`);
  }
  return match[1];
}

function extractClients() {
  const match = canonicalSource.match(/export const ONBOARDING_CLIENTS = \[(.*?)\] as const;/s);
  if (!match) {
    throw new Error("Could not find ONBOARDING_CLIENTS in packages/types/src/index.ts");
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((part) => part[1]);
}

const clients = extractClients();
const defaultClient = extractConstString("DEFAULT_ONBOARDING_CLIENT");
const coreSkillInstallPath = extractConstString("CORE_SKILL_INSTALL_PATH");
const coreWorkflowPath = extractConstString("CORE_SITEWIDE_PERFORMANCE_WORKFLOW_PATH");
const otherClients = clients.filter((client) => client !== defaultClient);
const clientSuffix = `# or: ${otherClients.join(", ")}`;

function getSetupCommand(prefix = "", client = defaultClient) {
  return `${prefix}screenshotsmcp setup --client ${client}`;
}

function getInstallCommand(prefix = "", client = defaultClient) {
  return `${prefix}screenshotsmcp install ${client}`;
}

const npxSetupLine = `${getSetupCommand("npx ")}    ${clientSuffix}`;
const npxInstallLine = `${getInstallCommand("npx ")}    ${clientSuffix}`;
const cliSetupLine = `${getSetupCommand()}    ${clientSuffix}`;
const cliInstallLine = `${getInstallCommand()}    ${clientSuffix}`;

const managedOnboardingSentence = `This path authenticates if needed, configures the MCP client, and installs or repairs the managed core ScreenshotsMCP skill in \`${coreSkillInstallPath}\`, including \`${coreWorkflowPath}\`.`;
const twoStepNuanceSentence = "For most clients, the two-step `login` + `install` path reaches the same result as `setup --client <client>`. The main nuances are that `install vscode` writes a workspace-local `.vscode/mcp.json`, while `install claude-code` prints the `claude mcp add ...` command for you to run manually.";
const publishedSetupSentence = `The CLI handles authentication via OAuth when needed, configures your MCP client, and installs or repairs the managed core ScreenshotsMCP skill in \`${coreSkillInstallPath}\`, including \`${coreWorkflowPath}\`.`;
const publishedTwoStepSentence = "If you prefer to do onboarding in two steps, run `npx screenshotsmcp login` followed by `npx screenshotsmcp install <client>`. For most clients, that reaches the same result as `setup --client <client>`. The main nuances are that `install vscode` writes a workspace-local `.vscode/mcp.json`, while `install claude-code` prints the `claude mcp add ...` command for you to run manually.";
const llmsSetupSentence = `The CLI now also installs or repairs the managed core ScreenshotsMCP skill in \`${coreSkillInstallPath}\`, including \`${coreWorkflowPath}\`, during successful \`login\`, \`install\`, and \`setup\` flows.`;
const llmsTwoStepSentence = "If you prefer to do onboarding in two steps, run `npx screenshotsmcp login` followed by `npx screenshotsmcp install <client>`. For most clients that reaches the same result as `setup --client <client>`. The main nuances are that `install vscode` writes a workspace-local `.vscode/mcp.json`, while `install claude-code` prints the `claude mcp add ...` command for you to run manually.";
const installationStepSentence = `3. Install or repair the managed core ScreenshotsMCP skill in \`${coreSkillInstallPath}\`, including \`${coreWorkflowPath}\``;
const installationWorkflowSentence = `The first packaged workflow is \`${coreSkillInstallPath}/${coreWorkflowPath}\` for repeatable multi-page performance audits.`;
const installationTwoStepSentence = "That two-step path reaches the same result as `setup --client <client>` for most clients. The main nuances are that `install vscode` writes a workspace-local `.vscode/mcp.json`, while `install claude-code` prints the `claude mcp add ...` command for you to run manually.";
const quickstartSetupSentence = `That flow authenticates if needed, configures the MCP client, and installs or repairs the managed core ScreenshotsMCP skill into \`${coreSkillInstallPath}\`, including \`${coreWorkflowPath}\`.`;
const quickstartTwoStepSentence = "That reaches the same result as `setup --client <client>` for most clients. The main nuances are that `install vscode` writes a workspace-local `.vscode/mcp.json`, while `install claude-code` prints the `claude mcp add ...` command for you to run manually.";
const readmeSkillSentence = `Every successful \`login\`, \`install\`, and \`setup\` flow now also installs or repairs the managed core ScreenshotsMCP skill under \`${coreSkillInstallPath}\`, including \`${coreWorkflowPath}\`, so your MCP connection and local skill stay aligned.`;
const readmeTwoStepSentence = "For most clients, `login` + `install` reaches the same result as `setup --client <client>`. The main nuances are that `install vscode` writes a workspace-local `.vscode/mcp.json`, while `install claude-code` prints the `claude mcp add ...` command for you to run manually.";

const updatedFiles = [];

function replaceRequired(content, pattern, replacement, label) {
  if (!pattern.test(content)) {
    throw new Error(`Could not find ${label}`);
  }
  return content.replace(pattern, replacement);
}

function syncFile(relativePath, transforms) {
  const absolutePath = resolve(rootDir, relativePath);
  const original = readFileSync(absolutePath, "utf8");
  let next = original;

  for (const transform of transforms) {
    next = replaceRequired(next, transform.pattern, transform.replacement, `${transform.label} in ${relativePath}`);
  }

  if (next !== original) {
    updatedFiles.push(relativePath);
    if (!checkOnly) {
      writeFileSync(absolutePath, next, "utf8");
    }
  }
}

syncFile("SKILL.md", [
  { pattern: /npx screenshotsmcp setup --client [^\n]+/, replacement: npxSetupLine, label: "managed onboarding setup command" },
  { pattern: /npx screenshotsmcp install [^\n]+/, replacement: npxInstallLine, label: "managed onboarding install command" },
  { pattern: /This path authenticates if needed, configures the MCP client, and installs or repairs the managed core ScreenshotsMCP skill in `[^`]+`, including `[^`]+`\./, replacement: managedOnboardingSentence, label: "managed onboarding description" },
  { pattern: /For most clients, the two-step `login` \+ `install` path reaches the same result as `setup --client <client>`\. The main nuances are that `install vscode` writes a workspace-local `\.vscode\/mcp\.json`, while `install claude-code` prints the `claude mcp add \.\.\.` command for you to run manually\./, replacement: twoStepNuanceSentence, label: "managed onboarding nuance" },
]);

syncFile("screenshotmcp-skill/SKILL.md", [
  { pattern: /npx screenshotsmcp setup --client [^\n]+/, replacement: npxSetupLine, label: "mirrored onboarding setup command" },
  { pattern: /npx screenshotsmcp install [^\n]+/, replacement: npxInstallLine, label: "mirrored onboarding install command" },
  { pattern: /This path authenticates if needed, configures the MCP client, and installs or repairs the managed core ScreenshotsMCP skill in `[^`]+`, including `[^`]+`\./, replacement: managedOnboardingSentence, label: "mirrored onboarding description" },
  { pattern: /For most clients, the two-step `login` \+ `install` path reaches the same result as `setup --client <client>`\. The main nuances are that `install vscode` writes a workspace-local `\.vscode\/mcp\.json`, while `install claude-code` prints the `claude mcp add \.\.\.` command for you to run manually\./, replacement: twoStepNuanceSentence, label: "mirrored onboarding nuance" },
]);

syncFile("apps/web/public/.skills/screenshotsmcp/SKILL.md", [
  { pattern: /npx screenshotsmcp setup --client [^\n]+/, replacement: npxSetupLine, label: "published skill setup command" },
  { pattern: /The CLI handles authentication via OAuth when needed, configures your MCP client, and installs or repairs the managed core ScreenshotsMCP skill in `[^`]+`, including `[^`]+`\./, replacement: publishedSetupSentence, label: "published skill setup sentence" },
  { pattern: /If you prefer to do onboarding in two steps, run `npx screenshotsmcp login` followed by `npx screenshotsmcp install <client>`\. For most clients,? ?that reaches the same result as `setup --client <client>`\. The main nuances are that `install vscode` writes a workspace-local `\.vscode\/mcp\.json`, while `install claude-code` prints the `claude mcp add \.\.\.` command for you to run manually\./, replacement: publishedTwoStepSentence, label: "published skill two-step sentence" },
]);

syncFile("apps/web/public/llms.txt", [
  { pattern: /npx screenshotsmcp setup --client [^\n]+/, replacement: npxSetupLine, label: "llms setup command" },
  { pattern: /The CLI now also installs or repairs the managed core ScreenshotsMCP skill in `[^`]+`, including `[^`]+`, during successful `login`, `install`, and `setup` flows\./, replacement: llmsSetupSentence, label: "llms setup sentence" },
  { pattern: /If you prefer to do onboarding in two steps, run `npx screenshotsmcp login` followed by `npx screenshotsmcp install <client>`\. For most clients that reaches the same result as `setup --client <client>`\. The main nuances are that `install vscode` writes a workspace-local `\.vscode\/mcp\.json`, while `install claude-code` prints the `claude mcp add \.\.\.` command for you to run manually\./, replacement: llmsTwoStepSentence, label: "llms two-step sentence" },
]);

syncFile("packages/cli/README.md", [
  { pattern: /screenshotsmcp setup --client [^\n]+/, replacement: cliSetupLine, label: "README setup command" },
  { pattern: /screenshotsmcp install [^\n]+/, replacement: cliInstallLine, label: "README install command" },
  { pattern: /Every successful `login`, `install`, and `setup` flow now also installs or repairs the managed core ScreenshotsMCP skill under `[^`]+`, including `[^`]+`, so your MCP connection and local skill stay aligned\./, replacement: readmeSkillSentence, label: "README managed skill sentence" },
  { pattern: /For most clients, `login` \+ `install` reaches the same result as `setup --client <client>`\. The main nuances are that `install vscode` writes a workspace-local `\.vscode\/mcp\.json`, while `install claude-code` prints the `claude mcp add \.\.\.` command for you to run manually\./, replacement: readmeTwoStepSentence, label: "README two-step sentence" },
]);

syncFile("apps/web/content/docs/installation.mdx", [
  { pattern: /npx screenshotsmcp setup --client [^\n]+/, replacement: npxSetupLine, label: "installation setup command" },
  { pattern: /3\. Install or repair the managed core ScreenshotsMCP skill in `[^`]+`, including `[^`]+`/, replacement: installationStepSentence, label: "installation step sentence" },
  { pattern: /npx screenshotsmcp install [^\n]+/, replacement: npxInstallLine, label: "installation install command" },
  { pattern: /That two-step path reaches the same result as `setup --client <client>` for most clients\. The main nuances are that `install vscode` writes a workspace-local `\.vscode\/mcp\.json`, while `install claude-code` prints the `claude mcp add \.\.\.` command for you to run manually\./, replacement: installationTwoStepSentence, label: "installation nuance sentence" },
  { pattern: /The first packaged workflow is `[^`]+` for repeatable multi-page performance audits\./, replacement: installationWorkflowSentence, label: "installation workflow sentence" },
]);

syncFile("apps/web/content/docs/quickstart.mdx", [
  { pattern: /npx screenshotsmcp setup --client [^\n]+/, replacement: npxSetupLine, label: "quickstart setup command" },
  { pattern: /That flow authenticates if needed, configures the MCP client, and installs or repairs the managed core ScreenshotsMCP skill into `[^`]+`, including `[^`]+`\./, replacement: quickstartSetupSentence, label: "quickstart setup sentence" },
  { pattern: /npx screenshotsmcp install [^\n]+/, replacement: npxInstallLine, label: "quickstart install command" },
  { pattern: /That reaches the same result as `setup --client <client>` for most clients\. The main nuances are that `install vscode` writes a workspace-local `\.vscode\/mcp\.json`, while `install claude-code` prints the `claude mcp add \.\.\.` command for you to run manually\./, replacement: quickstartTwoStepSentence, label: "quickstart nuance sentence" },
  { pattern: /The first packaged workflow is `[^`]+` for repeatable multi-page performance audits\./, replacement: installationWorkflowSentence, label: "quickstart workflow sentence" },
]);

if (checkOnly) {
  if (updatedFiles.length > 0) {
    console.error("Onboarding copy is out of sync in:");
    for (const file of updatedFiles) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }

  console.log("Onboarding copy is in sync.");
} else if (updatedFiles.length > 0) {
  console.log("Updated onboarding copy in:");
  for (const file of updatedFiles) {
    console.log(`- ${file}`);
  }
} else {
  console.log("Onboarding copy already in sync.");
}
