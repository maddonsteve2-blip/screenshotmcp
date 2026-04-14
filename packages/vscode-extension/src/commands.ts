import * as vscode from "vscode";
import { OAuthController } from "./auth/oauth";
import { AuthStore } from "./auth/store";
import { WORKSPACE_MCP_PATH } from "./constants";
import { callTool, extractImageUrl, extractText, validateApiKey } from "./mcp/client";
import { EditorMcpAutoInstaller } from "./mcp/autoInstaller";
import { logLine, showOutputChannel } from "./output";
import { getApiUrl, getDashboardUrl, getKeysUrl } from "./settings";
import { ScreenshotsMcpServerProvider } from "./mcp/serverProvider";
import { formatSkillSyncFailureMessage, formatSkillSyncMessage, installCatalogSkillForExtension, syncCoreSkillForExtension } from "./skills";
import { TimelineStore } from "./timeline/store";
import { buildWorkspaceMcpConfig } from "./utils/mcpConfig";
import { validateHttpUrl } from "./utils/url";
import { StatusBarController } from "./views/statusBar";
import { TimelinePanelController } from "./views/timelinePanel";

interface CommandDependencies {
  authStore: AuthStore;
  autoInstaller: EditorMcpAutoInstaller;
  oauthController: OAuthController;
  provider: ScreenshotsMcpServerProvider;
  statusBar: StatusBarController;
  timelineStore: TimelineStore;
  timelinePanel: TimelinePanelController;
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
        () => installCatalogSkillForExtension(skillName, deps.timelineStore),
      );
      deps.provider.refresh();
      if (outcome.ok && outcome.result) {
        vscode.window.showInformationMessage(`Skill "${skillName}" ${outcome.result.status} at ${outcome.result.installPath}.`);
      } else {
        vscode.window.showErrorMessage(outcome.errorMessage ?? `Failed to install skill "${skillName}".`);
      }
    }),
    vscode.commands.registerCommand("screenshotsmcp.takeScreenshot", async () => {
      const apiKey = await ensureAuthenticated(deps.authStore, deps.oauthController, deps.provider, deps.statusBar, deps.timelineStore, deps.autoInstaller);
      if (!apiKey) {
        return;
      }
      const url = await vscode.window.showInputBox({
        title: "ScreenshotsMCP",
        prompt: "Enter the URL to capture",
        placeHolder: "https://example.com",
        validateInput: validateHttpUrl,
      });
      if (!url) {
        return;
      }
      logLine(`Capturing screenshot for ${url}`);
      deps.timelineStore.add({
        title: "Screenshot started",
        detail: url,
        status: "info",
      });
      try {
        const response = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Capturing ${url}`,
          },
          () => callTool(apiKey, "take_screenshot", {
            url,
            width: 1280,
            height: 800,
            format: "png",
            fullPage: true,
            delay: 0,
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
        deps.timelineStore.add({
          title: "Screenshot complete",
          detail: imageUrl,
          status: "success",
        });
        const action = await vscode.window.showInformationMessage("Screenshot captured.", "Open", "Copy URL", "Show Output");
        if (action === "Open") {
          await openExternal(imageUrl);
        }
        if (action === "Copy URL") {
          await vscode.env.clipboard.writeText(imageUrl);
        }
        if (action === "Show Output") {
          showOutputChannel();
        }
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
  );
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
      placeHolder: "Choose how to connect",
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
    detail: `Connected to ${getApiUrl()}`,
    status: "success",
  });
  vscode.window.showInformationMessage("ScreenshotsMCP connected.");
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
