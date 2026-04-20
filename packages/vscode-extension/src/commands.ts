import * as vscode from "vscode";
import { OAuthController } from "./auth/oauth";
import { AuthStore } from "./auth/store";
import { CatalogCache } from "./catalog/cache";
import { WORKSPACE_MCP_PATH } from "./constants";
import { callTool, extractImageUrl, extractRunUrl, extractText, validateApiKey } from "./mcp/client";
import { EditorMcpAutoInstaller } from "./mcp/autoInstaller";
import { logLine, showOutputChannel } from "./output";
import { getApiUrl, getDashboardUrl, getKeysUrl, getScreenshotDefaults } from "./settings";
import { ScreenshotsMcpServerProvider } from "./mcp/serverProvider";
import { formatSkillSyncFailureMessage, formatSkillSyncMessage, installCatalogSkillForExtension, syncCoreSkillForExtension } from "./skills";
import { buildSkillTemplate } from "./skills/template";
import { TimelineStore } from "./timeline/store";
import { buildWorkspaceMcpConfig } from "./utils/mcpConfig";
import { validateHttpUrl } from "./utils/url";
import { AuditPanel } from "./views/auditPanel";
import { ScreenshotPanel } from "./views/screenshotPanel";
import { SkillPreviewPanel } from "./views/skillPreviewPanel";
import { WorkflowPanel } from "./views/workflowPanel";
import { discoverWorkflows } from "./skills/discoverWorkflows";
import { StatusBarController } from "./views/statusBar";
import { TimelinePanelController } from "./views/timelinePanel";
import { AuditDiagnostics, parseAuditFindings } from "./views/auditDiagnostics";
import { UrlHistoryStore } from "./history/store";
import { UrlHistoryPanel } from "./views/historyPanel";
import { DiffPanel } from "./views/diffPanel";
import { parseDiffText } from "./views/diffParse";
import { ensureProjectUrlsFile, formatEntryLabel, loadProjectUrls } from "./project/loader";
import type { ProjectUrlEntry } from "./project/urlList";

interface CommandDependencies {
  authStore: AuthStore;
  autoInstaller: EditorMcpAutoInstaller;
  catalogCache: CatalogCache;
  oauthController: OAuthController;
  provider: ScreenshotsMcpServerProvider;
  statusBar: StatusBarController;
  timelineStore: TimelineStore;
  timelinePanel: TimelinePanelController;
  auditDiagnostics: AuditDiagnostics;
  urlHistory: UrlHistoryStore;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("screenshotsmcp.signIn", async () => {
      const apiKey = await promptForApiKey(deps.authStore, deps.oauthController, deps.timelineStore);
      if (!apiKey) {
        return;
      }
      deps.provider.refresh();
      deps.statusBar.update(true);
      await configureEditorAfterSignIn(apiKey, deps.autoInstaller, deps.timelineStore);
    }),
    vscode.commands.registerCommand("screenshotsmcp.signOut", async () => {
      await deps.authStore.clearApiKey();
      deps.provider.refresh();
      deps.statusBar.update(false);
      const removal = await deps.autoInstaller.clearConfigured();
      deps.timelineStore.add({
        title: "Signed out",
        detail: removal.status === "removed"
          ? `Stored credentials were cleared from SecretStorage and ${removal.path ?? "the editor config"}.`
          : "Stored credentials were cleared from SecretStorage.",
        status: "info",
      });
      vscode.window.showInformationMessage(
        removal.status === "removed"
          ? "ScreenshotsMCP credentials and auto-installed MCP config cleared."
          : "ScreenshotsMCP credentials cleared.",
      );
    }),
    vscode.commands.registerCommand("screenshotsmcp.checkStatus", async () => {
      const apiKey = await deps.authStore.getApiKey();
      if (!apiKey) {
        deps.statusBar.update(false);
        deps.timelineStore.add({
          title: "Status check skipped",
          detail: "No API key is stored yet.",
          status: "info",
        });
        const action = await vscode.window.showWarningMessage("ScreenshotsMCP is not signed in.", "Sign In", "Open Dashboard");
        if (action === "Sign In") {
          await vscode.commands.executeCommand("screenshotsmcp.signIn");
        }
        if (action === "Open Dashboard") {
          await openExternal(getDashboardUrl());
        }
        return;
      }
      deps.statusBar.update(true);
      const validation = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Checking ScreenshotsMCP connection",
        },
        () => validateApiKey(apiKey),
      );
      if (!validation.ok) {
        deps.timelineStore.add({
          title: "Status check failed",
          detail: validation.message,
          status: "error",
        });
        vscode.window.showErrorMessage(`ScreenshotsMCP key check failed: ${validation.message}`);
        return;
      }
      deps.timelineStore.add({
        title: "Status check passed",
        detail: `Connected to ${getApiUrl()}`,
        status: "success",
      });
      vscode.window.showInformationMessage(`ScreenshotsMCP connected to ${getApiUrl()}`);
    }),
    vscode.commands.registerCommand("screenshotsmcp.installMcpServer", async () => {
      const apiKey = await ensureAuthenticated(deps.authStore, deps.oauthController, deps.provider, deps.statusBar, deps.timelineStore, deps.autoInstaller);
      if (!apiKey) {
        return;
      }
      const result = await deps.autoInstaller.ensureConfigured(apiKey);
      const skillResult = syncCoreSkillForExtension(deps.timelineStore);
      const skillMessage = skillResult.ok && skillResult.result
        ? formatSkillSyncMessage(skillResult.result)
        : formatSkillSyncFailureMessage(skillResult);
      if (result.status === "skipped") {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
          vscode.window.showWarningMessage("Open a workspace folder before installing an MCP config.");
          return;
        }
        const fileUri = vscode.Uri.joinPath(folder.uri, WORKSPACE_MCP_PATH);
        const config = await readJsonFile(fileUri);
        const nextConfig = buildWorkspaceMcpConfig(config, getApiUrl(), apiKey);
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, ".vscode"));
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(`${JSON.stringify(nextConfig, null, 2)}\n`, "utf8"));
        logLine(`Updated ${fileUri.fsPath}`);
        deps.timelineStore.add({
          title: "Workspace MCP config installed",
          detail: fileUri.fsPath,
          status: "success",
        });
        const document = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(document);
        if (skillResult.ok) {
          vscode.window.showInformationMessage(`Installed ScreenshotsMCP into workspace .vscode/mcp.json. ${skillMessage}`);
        } else {
          vscode.window.showWarningMessage(`Installed ScreenshotsMCP into workspace .vscode/mcp.json. ${skillMessage}`);
        }
        return;
      }

      if (result.status === "updated" || result.status === "unchanged") {
        logLine(`${result.message}${result.path ? ` (${result.path})` : ""}`);
        deps.timelineStore.add({
          title: result.status === "updated" ? "Editor MCP configured" : "Editor MCP already configured",
          detail: result.path ?? result.message,
          status: "success",
        });
        if (skillResult.ok) {
          vscode.window.showInformationMessage(`${result.message} ${skillMessage}`);
        } else {
          vscode.window.showWarningMessage(`${result.message} ${skillMessage}`);
        }
        return;
      }

      if (result.status === "native") {
        deps.timelineStore.add({
          title: "Native MCP registration active",
          detail: result.message,
          status: "success",
        });
        if (skillResult.ok) {
          vscode.window.showInformationMessage(`${result.message} ${skillMessage}`);
        } else {
          vscode.window.showWarningMessage(`${result.message} ${skillMessage}`);
        }
      }
    }),
    vscode.commands.registerCommand("screenshotsmcp.syncCoreSkill", async () => {
      const result = syncCoreSkillForExtension(deps.timelineStore);
      if (result.ok && result.result) {
        vscode.window.showInformationMessage(formatSkillSyncMessage(result.result));
      } else {
        vscode.window.showErrorMessage(formatSkillSyncFailureMessage(result));
      }
    }),
    vscode.commands.registerCommand("screenshotsmcp.browseSkills", async () => {
      await openExternal("https://skills.sh/");
    }),
    vscode.commands.registerCommand("screenshotsmcp.installSkill", async (skillName?: string) => {
      if (!skillName) {
        return;
      }
      const outcome = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Installing skill "${skillName}"` },
        () => installCatalogSkillForExtension(skillName, deps.timelineStore, deps.catalogCache.get()),
      );
      deps.provider.refresh();
      if (outcome.ok && outcome.result) {
        vscode.window.showInformationMessage(`Skill "${skillName}" ${outcome.result.status} at ${outcome.result.installPath}.`);
      } else {
        vscode.window.showErrorMessage(outcome.errorMessage ?? `Failed to install skill "${skillName}".`);
      }
    }),
    vscode.commands.registerCommand("screenshotsmcp.previewSkill", async (skillName?: string) => {
      if (!skillName) {
        return;
      }
      const skill = deps.catalogCache.get().find((s) => s.name === skillName);
      if (!skill) {
        vscode.window.showErrorMessage(`Skill "${skillName}" is not in the catalog.`);
        return;
      }
      SkillPreviewPanel.show(skill, () => {
        void vscode.commands.executeCommand("screenshotsmcp.installSkill", skill.name);
      });
    }),
    vscode.commands.registerCommand("screenshotsmcp.takeScreenshot", async () => {
      const url = await vscode.window.showInputBox({
        title: "ScreenshotsMCP",
        prompt: "Enter the URL to capture",
        placeHolder: "https://example.com",
        validateInput: validateHttpUrl,
      });
      if (!url) {
        return;
      }
      await runScreenshot(deps, url);
    }),
    vscode.commands.registerCommand("screenshotsmcp.takeScreenshotAtUrl", async (url?: string) => {
      if (!url) {
        return;
      }
      const validationError = validateHttpUrl(url);
      if (validationError) {
        vscode.window.showErrorMessage(validationError);
        return;
      }
      await runScreenshot(deps, url);
    }),
    vscode.commands.registerCommand("screenshotsmcp.auditUrl", async (url?: string) => {
      if (!url) {
        return;
      }
      const validationError = validateHttpUrl(url);
      if (validationError) {
        vscode.window.showErrorMessage(validationError);
        return;
      }
      await runAudit(deps, url);
    }),
    vscode.commands.registerCommand("screenshotsmcp.screenshotSelectedUrl", async () => {
      const url = pickUrlFromActiveEditor();
      if (!url) {
        vscode.window.showWarningMessage("Select a URL (or place the cursor on one) first.");
        return;
      }
      await runScreenshot(deps, url);
    }),
    vscode.commands.registerCommand("screenshotsmcp.auditSelectedUrl", async () => {
      const url = pickUrlFromActiveEditor();
      if (!url) {
        vscode.window.showWarningMessage("Select a URL (or place the cursor on one) first.");
        return;
      }
      await runAudit(deps, url);
    }),
    vscode.commands.registerCommand("screenshotsmcp.createSkill", async () => {
      await runCreateSkill(deps);
    }),
    vscode.commands.registerCommand("screenshotsmcp.openDashboard", async () => {
      deps.timelineStore.add({
        title: "Opened dashboard",
        detail: getDashboardUrl(),
        status: "info",
      });
      await openExternal(getDashboardUrl());
    }),
    vscode.commands.registerCommand("screenshotsmcp.openTimeline", async () => {
      deps.timelinePanel.show();
    }),
    vscode.commands.registerCommand("screenshotsmcp.showOutput", async () => {
      deps.timelineStore.add({
        title: "Opened output channel",
        detail: "ScreenshotsMCP output channel shown.",
        status: "info",
      });
      showOutputChannel();
    }),
    vscode.commands.registerCommand("screenshotsmcp.showQuickActions", async () => {
      await runQuickActions(deps);
    }),
    vscode.commands.registerCommand("screenshotsmcp.editProjectUrls", async () => {
      const uri = await ensureProjectUrlsFile();
      if (!uri) return;
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    }),
    vscode.commands.registerCommand("screenshotsmcp.runProjectUrls", async () => {
      await runProjectUrlBatch(deps, "screenshot");
    }),
    vscode.commands.registerCommand("screenshotsmcp.auditProjectUrls", async () => {
      await runProjectUrlBatch(deps, "audit");
    }),
    vscode.commands.registerCommand("screenshotsmcp.diffUrls", async (urlAArg?: string, urlBArg?: string) => {
      const urls = deps.urlHistory.listUrls().map((u) => u.url);
      const urlA = urlAArg && validateHttpUrl(urlAArg) ? urlAArg : await pickOrEnterUrl("Compare A: pick or enter the 'before' URL", urls);
      if (!urlA) return;
      const urlB = urlBArg && validateHttpUrl(urlBArg) ? urlBArg : await pickOrEnterUrl(`Compare B: pick or enter the 'after' URL (A = ${urlA})`, urls.filter((u) => u !== urlA));
      if (!urlB) return;
      await runDiff(deps, urlA, urlB);
    }),
    vscode.commands.registerCommand("screenshotsmcp.showUrlHistory", async (urlArg?: string) => {
      const resolved = await resolveUrlForHistory(deps, urlArg);
      if (!resolved) {
        return;
      }
      UrlHistoryPanel.show(resolved, deps.urlHistory);
    }),
    vscode.commands.registerCommand("screenshotsmcp.showHistoryForSelectedUrl", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage("Open a file and select a URL first.");
        return;
      }
      const selected = editor.document.getText(editor.selection).trim();
      const url = selected && validateHttpUrl(selected)
        ? selected
        : editor.document.getText(editor.document.getWordRangeAtPosition(editor.selection.active, /https?:\/\/[^\s)"']+/));
      if (!url || !validateHttpUrl(url)) {
        void vscode.window.showWarningMessage("Select a valid http/https URL first.");
        return;
      }
      UrlHistoryPanel.show(url, deps.urlHistory);
    }),
    vscode.commands.registerCommand("screenshotsmcp.clearAuditDiagnostics", () => {
      deps.auditDiagnostics.clear();
      deps.timelineStore.add({
        title: "Audit diagnostics cleared",
        status: "info",
      });
    }),
    vscode.commands.registerCommand("screenshotsmcp.openWorkflow", async (pathOrUndefined?: string) => {
      const workflows = discoverWorkflows();
      const match = pathOrUndefined
        ? workflows.find((w) => w.path === pathOrUndefined)
        : undefined;

      if (match) {
        WorkflowPanel.show(match);
        return;
      }

      if (workflows.length === 0) {
        void vscode.window.showWarningMessage(
          "No workflows found. Install a skill that ships WORKFLOW.md files — e.g. run `ScreenshotsMCP: Sync Core Skill`.",
        );
        return;
      }

      const picked = await vscode.window.showQuickPick(
        workflows.map((w) => ({
          label: w.title,
          description: w.skill,
          detail: w.relativePath,
          workflow: w,
        })),
        {
          title: "Open workflow",
          placeHolder: "Pick a workflow to preview",
        },
      );
      if (picked) {
        WorkflowPanel.show(picked.workflow);
      }
    }),
  );
}

interface QuickAction extends vscode.QuickPickItem {
  command: string;
  args?: unknown[];
}

async function runQuickActions(deps: CommandDependencies): Promise<void> {
  const hasApiKey = await deps.authStore.hasApiKey();
  const actions: QuickAction[] = hasApiKey
    ? [
        { label: "$(device-camera) Take Screenshot", description: "Capture a URL", command: "screenshotsmcp.takeScreenshot" },
        { label: "$(search) Audit URL", description: "Run a UX review", command: "screenshotsmcp.takeScreenshot", args: [] },
        { label: "$(list-unordered) Open Timeline", description: "Recent runs and events", command: "screenshotsmcp.openTimeline" },
        { label: "$(history) Show URL History", description: "Past screenshots/audits grouped by URL", command: "screenshotsmcp.showUrlHistory" },
        { label: "$(diff) Visual Diff", description: "Compare two URLs pixel-by-pixel", command: "screenshotsmcp.diffUrls" },
        { label: "$(folder-library) Screenshot Project URLs", description: "Batch-capture .screenshotsmcp/urls.json", command: "screenshotsmcp.runProjectUrls" },
        { label: "$(checklist) Audit Project URLs", description: "Batch-audit .screenshotsmcp/urls.json", command: "screenshotsmcp.auditProjectUrls" },
        { label: "$(edit) Edit Project URLs", description: "Open or create .screenshotsmcp/urls.json", command: "screenshotsmcp.editProjectUrls" },
        { label: "$(run-all) Open Workflow", description: "Pick a packaged skill workflow to preview", command: "screenshotsmcp.openWorkflow" },
        { label: "$(book) Create Skill", description: "Scaffold a new ~/.agents/skills/<name>", command: "screenshotsmcp.createSkill" },
        { label: "$(globe) Open Dashboard", description: getDashboardUrl(), command: "screenshotsmcp.openDashboard" },
        { label: "$(output) Show Output", description: "ScreenshotsMCP log channel", command: "screenshotsmcp.showOutput" },
        { label: "$(sign-out) Sign Out", description: "Clear stored API key", command: "screenshotsmcp.signOut" },
      ]
    : [
        { label: "$(key) Sign In", description: "Authenticate with ScreenshotsMCP", command: "screenshotsmcp.signIn" },
        { label: "$(globe) Open Dashboard", description: getDashboardUrl(), command: "screenshotsmcp.openDashboard" },
      ];

  // Replace the "Audit URL" placeholder with a real prompt so we don't need a second command.
  const audit = actions.find((a) => a.label.startsWith("$(search)"));
  if (audit) {
    audit.command = "__inline_audit__";
  }

  const picked = await vscode.window.showQuickPick(actions, {
    title: "ScreenshotsMCP",
    placeHolder: hasApiKey ? "Pick an action" : "Sign in to get started",
  });
  if (!picked) {
    return;
  }

  if (picked.command === "__inline_audit__") {
    const url = await vscode.window.showInputBox({
      title: "Audit URL",
      prompt: "Enter the URL to audit",
      placeHolder: "https://example.com",
      ignoreFocusOut: true,
    });
    if (!url) {
      return;
    }
    await vscode.commands.executeCommand("screenshotsmcp.auditUrl", url);
    return;
  }

  await vscode.commands.executeCommand(picked.command, ...(picked.args ?? []));
}

async function ensureAuthenticated(
  authStore: AuthStore,
  oauthController: OAuthController,
  provider: ScreenshotsMcpServerProvider,
  statusBar: StatusBarController,
  timelineStore: TimelineStore,
  autoInstaller: EditorMcpAutoInstaller,
): Promise<string | undefined> {
  const existing = await authStore.getApiKey();
  if (existing) {
    return existing;
  }
  const apiKey = await promptForApiKey(authStore, oauthController, timelineStore);
  if (!apiKey) {
    return undefined;
  }
  provider.refresh();
  statusBar.update(true);
  await configureEditorAfterSignIn(apiKey, autoInstaller, timelineStore);
  return apiKey;
}

async function promptForApiKey(
  authStore: AuthStore,
  oauthController: OAuthController,
  timelineStore: TimelineStore,
): Promise<string | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: "Sign in with browser (OAuth)", value: "oauth" },
      { label: "Paste API key", value: "paste" },
      { label: "Open dashboard keys page", value: "open" },
    ],
    {
      title: "Connect ScreenshotsMCP",
      placeHolder: "Choose how to connect and unlock screenshots, browser workflows, and reusable auth testing",
    },
  );

  if (!choice) {
    return undefined;
  }

  if (choice.value === "oauth") {
    return oauthController.signIn({ automatic: false });
  }

  if (choice.value === "open") {
    await openExternal(getKeysUrl());
    return undefined;
  }

  const input = await vscode.window.showInputBox({
    title: "ScreenshotsMCP API Key",
    prompt: "Paste your sk_live_ API key",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value.trim()) {
        return "API key is required.";
      }
      if (!value.startsWith("sk_live_")) {
        return "API key must start with sk_live_.";
      }
      return undefined;
    },
  });

  if (!input) {
    return undefined;
  }

  const apiKey = input.trim();
  logLine("Validating ScreenshotsMCP API key.");
  const validation = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Validating ScreenshotsMCP API key",
    },
    () => validateApiKey(apiKey),
  );

  if (!validation.ok) {
    vscode.window.showErrorMessage(`ScreenshotsMCP sign-in failed: ${validation.message}`);
    return undefined;
  }

  await authStore.setApiKey(apiKey);
  logLine("ScreenshotsMCP API key stored in SecretStorage.");
  timelineStore.add({
    title: "Signed in with API key",
    detail: `Connected to ${getApiUrl()} · reusable auth workflow available via auth_test_assist`,
    status: "success",
  });
  vscode.window.showInformationMessage("ScreenshotsMCP connected. For login or sign-up testing, start with auth_test_assist.");
  return apiKey;
}

export async function configureEditorAfterSignIn(
  apiKey: string,
  autoInstaller: EditorMcpAutoInstaller,
  timelineStore: TimelineStore,
): Promise<void> {
  const result = await autoInstaller.ensureConfigured(apiKey);
  const skillResult = syncCoreSkillForExtension(timelineStore);
  const skillMessage = skillResult.ok && skillResult.result
    ? formatSkillSyncMessage(skillResult.result)
    : formatSkillSyncFailureMessage(skillResult);

  if (result.status === "updated") {
    timelineStore.add({
      title: "Editor MCP configured",
      detail: result.path ?? result.message,
      status: "success",
    });
    logLine(`${result.message}${result.path ? ` (${result.path})` : ""}`);
    logLine(skillMessage);
    if (!skillResult.ok) {
      vscode.window.showWarningMessage(skillMessage);
    }
    return;
  }

  if (result.status === "native") {
    timelineStore.add({
      title: "Native MCP registration active",
      detail: result.message,
      status: "success",
    });
    logLine(result.message);
    logLine(skillMessage);
    if (!skillResult.ok) {
      vscode.window.showWarningMessage(skillMessage);
    }
    return;
  }

  if (result.status === "unchanged") {
    timelineStore.add({
      title: "Editor MCP already configured",
      detail: result.path ?? result.message,
      status: "info",
    });
    logLine(`${result.message}${result.path ? ` (${result.path})` : ""}`);
    logLine(skillMessage);
    if (!skillResult.ok) {
      vscode.window.showWarningMessage(skillMessage);
    }
    return;
  }

  if (result.status === "skipped") {
    timelineStore.add({
      title: "Automatic editor setup skipped",
      detail: result.message,
      status: "info",
    });
    logLine(result.message);
    logLine(skillMessage);
    if (!skillResult.ok) {
      vscode.window.showWarningMessage(skillMessage);
    }
  }
}

async function openExternal(target: string): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.parse(target));
}

/**
 * Resolves a URL from the active editor:
 * 1) non-empty selection that contains a URL, or
 * 2) URL at the cursor position (via the editor's URL word-pattern), or
 * 3) the first URL in the line at the cursor.
 * Trailing punctuation is trimmed.
 */
function pickUrlFromActiveEditor(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const urlRegex = /https?:\/\/[^\s"'`,<>)\]]+/;
  const selection = editor.selection;

  if (!selection.isEmpty) {
    const selected = editor.document.getText(selection).trim();
    const m = selected.match(urlRegex);
    if (m) {
      return trimTrailing(m[0]);
    }
  }

  const range = editor.document.getWordRangeAtPosition(selection.active, /https?:\/\/[^\s"'`,<>)\]]+/);
  if (range) {
    return trimTrailing(editor.document.getText(range));
  }

  const line = editor.document.lineAt(selection.active.line).text;
  const m = line.match(urlRegex);
  if (m) {
    return trimTrailing(m[0]);
  }
  return undefined;
}

function trimTrailing(url: string): string {
  return url.replace(/[.,:;!?]+$/, "");
}

async function runCreateSkill(deps: CommandDependencies): Promise<void> {
  const name = await vscode.window.showInputBox({
    title: "New skill · slug",
    prompt: "Kebab-case slug used for the directory and catalog name",
    placeHolder: "my-new-skill",
    validateInput: (value) => {
      if (!value.trim()) {
        return "A slug is required.";
      }
      if (!/^[a-z][a-z0-9-]*$/.test(value.trim())) {
        return "Use lowercase letters, numbers, and hyphens only.";
      }
      return undefined;
    },
  });
  if (!name) {
    return;
  }

  const displayName = await vscode.window.showInputBox({
    title: "New skill · display name",
    prompt: "Human-readable name shown in the sidebar",
    value: toDisplayName(name),
  });
  if (!displayName) {
    return;
  }

  const description = await vscode.window.showInputBox({
    title: "New skill · description",
    prompt: "One-sentence description of what this skill does",
    placeHolder: "Helps agents do X when Y.",
  });
  if (!description) {
    return;
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage("Open a workspace folder before creating a skill.");
    return;
  }

  const target = vscode.Uri.joinPath(folders[0].uri, "skills", name, "SKILL.md");
  try {
    await vscode.workspace.fs.stat(target);
    const overwrite = await vscode.window.showWarningMessage(
      `A skill already exists at ${target.fsPath}. Overwrite?`,
      { modal: true },
      "Overwrite",
    );
    if (overwrite !== "Overwrite") {
      return;
    }
  } catch {
    // File does not exist — proceed.
  }

  const content = buildSkillTemplate({ name, displayName, description });
  await vscode.workspace.fs.writeFile(target, Buffer.from(content, "utf8"));

  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc, { preview: false });

  deps.timelineStore.add({
    title: `Skill scaffolded: ${name}`,
    detail: target.fsPath,
    status: "success",
  });
  logLine(`Scaffolded new skill at ${target.fsPath}`);
  vscode.window.showInformationMessage(
    `Skill "${displayName}" created at ${target.fsPath}. Fill in the template, then submit a PR to screenshotmcp/apps/web/public/.skills/index.json to publish it.`,
  );
}

function toDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function runScreenshot(deps: CommandDependencies, url: string): Promise<void> {
  const apiKey = await ensureAuthenticated(deps.authStore, deps.oauthController, deps.provider, deps.statusBar, deps.timelineStore, deps.autoInstaller);
  if (!apiKey) {
    return;
  }
  const defaults = getScreenshotDefaults();
  logLine(`Capturing screenshot for ${url} (${defaults.width}x${defaults.height}, ${defaults.format}${defaults.fullPage ? ", fullPage" : ""}${defaults.delay ? `, delay=${defaults.delay}ms` : ""})`);
  deps.timelineStore.add({
    title: "Screenshot started",
    detail: url,
    status: "info",
    kind: "screenshot",
    targetUrl: url,
  });
  try {
    const response = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Capturing ${url}` },
      () => callTool(apiKey, "take_screenshot", {
        url,
        width: defaults.width,
        height: defaults.height,
        format: defaults.format,
        fullPage: defaults.fullPage,
        delay: defaults.delay,
      }),
    );
    const imageUrl = extractImageUrl(response);
    const text = extractText(response);
    if (!imageUrl) {
      deps.timelineStore.add({
        title: "Screenshot finished without image URL",
        detail: text,
        status: "error",
      });
      showOutputChannel();
      vscode.window.showWarningMessage(text);
      return;
    }
    logLine(`Screenshot complete: ${imageUrl}`);
    const screenshotRunUrl = extractRunUrl(text, getDashboardUrl());
    deps.timelineStore.add({
      title: "Screenshot complete",
      detail: imageUrl,
      status: "success",
      kind: "screenshot",
      thumbnailUrl: imageUrl,
      targetUrl: url,
      runUrl: screenshotRunUrl,
    });
    deps.urlHistory.record({
      kind: "screenshot",
      url,
      imageUrl,
      runUrl: screenshotRunUrl,
      occurredAt: new Date().toISOString(),
    });
    ScreenshotPanel.show(
      {
        url,
        imageUrl,
        capturedAt: new Date().toLocaleString(),
        runUrl: screenshotRunUrl,
      },
      () => {
        void runScreenshot(deps, url);
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logLine(`Screenshot failed: ${message}`);
    deps.timelineStore.add({
      title: "Screenshot failed",
      detail: message,
      status: "error",
    });
    showOutputChannel();
    vscode.window.showErrorMessage(`Screenshot failed: ${message}`);
  }
}

async function runAudit(deps: CommandDependencies, url: string): Promise<void> {
  const apiKey = await ensureAuthenticated(deps.authStore, deps.oauthController, deps.provider, deps.statusBar, deps.timelineStore, deps.autoInstaller);
  if (!apiKey) {
    return;
  }
  logLine(`Auditing ${url}`);
  deps.timelineStore.add({
    title: "UX audit started",
    detail: url,
    status: "info",
    kind: "audit",
    targetUrl: url,
  });
  try {
    const response = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Auditing ${url}` },
      () => {
        const auditDefaults = getScreenshotDefaults();
        return callTool(apiKey, "ux_review", {
          url,
          width: auditDefaults.width,
          height: auditDefaults.height,
        });
      },
    );
    const text = extractText(response);
    const screenshotUrl = extractImageUrl(response) ?? undefined;
    const auditRunUrl = extractRunUrl(text, getDashboardUrl());
    deps.timelineStore.add({
      title: "UX audit complete",
      detail: url,
      status: "success",
      kind: "audit",
      thumbnailUrl: screenshotUrl,
      targetUrl: url,
      runUrl: auditRunUrl,
    });
    deps.urlHistory.record({
      kind: "audit",
      url,
      imageUrl: screenshotUrl,
      runUrl: auditRunUrl,
      occurredAt: new Date().toISOString(),
    });
    const findings = parseAuditFindings(text);
    await deps.auditDiagnostics.publish(url, findings);
    if (findings.length > 0) {
      deps.timelineStore.add({
        title: `Audit diagnostics published: ${findings.length}`,
        detail: `${findings.length} finding(s) added to the Problems tab for ${url}`,
        status: "info",
        kind: "audit",
        targetUrl: url,
      });
    }
    AuditPanel.show(
      {
        url,
        reviewText: text,
        screenshotUrl,
        capturedAt: new Date().toLocaleString(),
        runUrl: auditRunUrl,
      },
      () => {
        void runAudit(deps, url);
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logLine(`Audit failed: ${message}`);
    deps.timelineStore.add({
      title: "UX audit failed",
      detail: message,
      status: "error",
    });
    showOutputChannel();
    vscode.window.showErrorMessage(`Audit failed: ${message}`);
  }
}

async function runProjectUrlBatch(deps: CommandDependencies, mode: "screenshot" | "audit"): Promise<void> {
  const loaded = await loadProjectUrls();
  if (!loaded) {
    const create = await vscode.window.showInformationMessage(
      "No .screenshotsmcp/urls.json found. Create one?",
      "Create",
      "Cancel",
    );
    if (create !== "Create") return;
    await vscode.commands.executeCommand("screenshotsmcp.editProjectUrls");
    return;
  }
  const { entries, errors } = loaded.parsed;
  for (const err of errors) {
    logLine(`[project urls] ${err}`);
  }
  if (entries.length === 0) {
    void vscode.window.showWarningMessage(`No valid URLs in ${loaded.uri.fsPath}. See the output channel.`);
    showOutputChannel();
    return;
  }
  const items = entries.map((entry) => ({
    label: formatEntryLabel(entry),
    description: entry.tags?.join(", "),
    picked: true,
    entry,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: `${mode === "audit" ? "Audit" : "Screenshot"} which URLs?`,
    placeHolder: `${entries.length} URL${entries.length === 1 ? "" : "s"} from ${loaded.uri.path.split("/").slice(-2).join("/")}`,
  });
  if (!picked || picked.length === 0) return;

  const target: ProjectUrlEntry[] = picked.map((p) => p.entry);
  deps.timelineStore.add({
    title: `Project ${mode} batch started`,
    detail: `${target.length} URL${target.length === 1 ? "" : "s"}`,
    status: "info",
    kind: mode === "audit" ? "audit" : "screenshot",
  });

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Running ${mode} on ${target.length} URL${target.length === 1 ? "" : "s"}`, cancellable: true },
    async (progress, token) => {
      const step = 100 / target.length;
      let done = 0;
      let failed = 0;
      for (const entry of target) {
        if (token.isCancellationRequested) break;
        progress.report({ increment: step, message: entry.label ?? entry.url });
        try {
          if (mode === "audit") {
            await runAudit(deps, entry.url);
          } else {
            await runScreenshot(deps, entry.url);
          }
          done++;
        } catch (err) {
          failed++;
          logLine(`[project urls] ${entry.url}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      deps.timelineStore.add({
        title: `Project ${mode} batch complete`,
        detail: `${done} ok · ${failed} failed${token.isCancellationRequested ? " · cancelled" : ""}`,
        status: failed > 0 ? "error" : "success",
        kind: mode === "audit" ? "audit" : "screenshot",
      });
    },
  );
}

async function pickOrEnterUrl(title: string, suggestions: string[]): Promise<string | undefined> {
  const MANUAL = "$(edit) Enter a URL manually\u2026";
  if (suggestions.length > 0) {
    const picked = await vscode.window.showQuickPick([MANUAL, ...suggestions], { title, placeHolder: "Pick from history or enter a URL" });
    if (!picked) return undefined;
    if (picked !== MANUAL) return picked;
  }
  const manual = await vscode.window.showInputBox({
    title,
    placeHolder: "https://example.com",
    validateInput: (value) => (validateHttpUrl(value) ? undefined : "Must be a valid http(s) URL"),
  });
  return manual?.trim() || undefined;
}

async function runDiff(deps: CommandDependencies, urlA: string, urlB: string): Promise<void> {
  const apiKey = await ensureAuthenticated(deps.authStore, deps.oauthController, deps.provider, deps.statusBar, deps.timelineStore, deps.autoInstaller);
  if (!apiKey) return;

  const defaults = getScreenshotDefaults();
  logLine(`Running visual diff: ${urlA} vs ${urlB}`);
  deps.timelineStore.add({
    title: "Visual diff started",
    detail: `${urlA} vs ${urlB}`,
    status: "info",
    kind: "info",
  });
  try {
    const response = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Diffing ${urlA} vs ${urlB}` },
      () => callTool(apiKey, "screenshot_diff", {
        urlA,
        urlB,
        width: defaults.width,
        height: defaults.height,
        threshold: 0.1,
      }),
    );
    const text = extractText(response);
    const parsed = parseDiffText(text);
    if (!parsed.diffUrl && !parsed.beforeUrl) {
      deps.timelineStore.add({ title: "Visual diff failed", detail: text, status: "error" });
      showOutputChannel();
      void vscode.window.showWarningMessage("Diff did not return image URLs. See the output channel.");
      return;
    }
    const summary = [
      parsed.matchScore !== undefined ? `${parsed.matchScore.toFixed(1)}% match` : undefined,
      parsed.changedPercent !== undefined ? `${parsed.changedPercent.toFixed(2)}% changed` : undefined,
    ]
      .filter(Boolean)
      .join(" \u00b7 ");
    deps.timelineStore.add({
      title: "Visual diff complete",
      detail: summary || `${urlA} vs ${urlB}`,
      status: "success",
      kind: "info",
      thumbnailUrl: parsed.diffUrl,
    });
    DiffPanel.show(
      { urlA, urlB, result: parsed, capturedAt: new Date().toLocaleString() },
      () => {
        void runDiff(deps, urlA, urlB);
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logLine(`Diff failed: ${message}`);
    deps.timelineStore.add({ title: "Visual diff failed", detail: message, status: "error" });
    showOutputChannel();
    void vscode.window.showErrorMessage(`Diff failed: ${message}`);
  }
}

async function resolveUrlForHistory(deps: CommandDependencies, urlArg?: string): Promise<string | undefined> {
  if (urlArg && validateHttpUrl(urlArg)) {
    return urlArg;
  }
  const urls = deps.urlHistory.listUrls();
  if (urls.length === 0) {
    const manual = await vscode.window.showInputBox({
      title: "Show URL history",
      prompt: "Enter the URL to view history for",
      placeHolder: "https://example.com",
      validateInput: (value) => (validateHttpUrl(value) ? undefined : "Must be a valid http(s) URL"),
    });
    return manual?.trim() || undefined;
  }
  const picked = await vscode.window.showQuickPick(
    urls.map((u) => ({
      label: u.url,
      description: `${u.count} entries`,
      detail: `Last seen ${new Date(u.lastSeen).toLocaleString()}`,
      url: u.url,
    })),
    {
      title: "Show URL history",
      placeHolder: "Pick a URL or type a new one",
    },
  );
  return picked?.url;
}

async function readJsonFile(uri: vscode.Uri): Promise<Record<string, unknown>> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString("utf8");
    if (!text.trim()) {
      return {};
    }
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
