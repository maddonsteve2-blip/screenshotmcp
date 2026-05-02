import * as vscode from "vscode";
import { OAuthController } from "./auth/oauth";
import { AuthStore } from "./auth/store";
import { CatalogCache } from "./catalog/cache";
import { configureEditorAfterSignIn, registerCommands } from "./commands";
import { SIDEBAR_VIEW_ID } from "./constants";
import { EditorMcpAutoInstaller } from "./mcp/autoInstaller";
import { logLine } from "./output";
import { DeepsyteServerProvider } from "./mcp/serverProvider";
import { TimelineStore } from "./timeline/store";
import { registerChatParticipant } from "./chat/participant";
import { UrlHistoryStore } from "./history/store";
import { AuditDiagnostics } from "./views/auditDiagnostics";
import { SidebarProvider } from "./views/sidebar";
import { StatusBarController } from "./views/statusBar";
import { TimelinePanelController } from "./views/timelinePanel";
import { UrlCodeLensProvider } from "./views/urlCodeLens";
import { MagicCommentCodeLensProvider } from "./views/magicCommentCodeLens";
import { MagicCommentCompletionProvider } from "./views/magicCommentCompletion";
import { loadAuditBudget } from "./project/budgetLoader";
import { validateApiKey } from "./mcp/client";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const authStore = new AuthStore(context);
  const statusBar = new StatusBarController();
  const provider = new DeepsyteServerProvider(authStore);
  const autoInstaller = new EditorMcpAutoInstaller(context, provider);
  const timelineStore = new TimelineStore();
  const timelinePanel = new TimelinePanelController(context, timelineStore);
  const catalogCache = new CatalogCache(context);
  const auditDiagnostics = new AuditDiagnostics();
  const urlHistory = new UrlHistoryStore(context);
  const sidebarProvider = new SidebarProvider(authStore, timelineStore, catalogCache, urlHistory, auditDiagnostics);
  const oauthController = new OAuthController(context, authStore, provider, statusBar, timelineStore);

  logLine("Activating DeepSyte extension.");
  timelineStore.add({
    title: "Extension activated",
    detail: "DeepSyte extension activation completed.",
    status: "info",
  });

  context.subscriptions.push(statusBar);
  context.subscriptions.push(timelinePanel);
  context.subscriptions.push(sidebarProvider);
  context.subscriptions.push(oauthController);
  context.subscriptions.push(auditDiagnostics);
  context.subscriptions.push(vscode.window.createTreeView(SIDEBAR_VIEW_ID, {
    treeDataProvider: sidebarProvider,
    showCollapseAll: false,
  }));

  const providerDisposable = provider.register();
  if (providerDisposable) {
    context.subscriptions.push(providerDisposable);
    logLine("Registered DeepSyte MCP provider.");
    timelineStore.add({
      title: "MCP provider registered",
      detail: "DeepSyte MCP server definition provider is available.",
      status: "success",
    });
  }

  registerCommands(context, {
    authStore,
    autoInstaller,
    catalogCache,
    oauthController,
    provider,
    statusBar,
    timelineStore,
    timelinePanel,
    auditDiagnostics,
    urlHistory,
  });

  registerChatParticipant(context, { timelineStore });

  // Kick off a background refresh of the hosted skill catalog. Errors fall back
  // to the in-code SKILL_CATALOG silently; the sidebar always has something to
  // render.
  void catalogCache.refresh();

  // Register CodeLens on URLs if the user hasn't disabled it. The setting
  // `deepsyte.codeLens.urlActions` defaults to true and is observed on
  // change below.
  const codeLensProvider = new UrlCodeLensProvider();
  let codeLensDisposable: vscode.Disposable | undefined;
  const registerCodeLens = () => {
    const enabled = vscode.workspace
      .getConfiguration("deepsyte")
      .get<boolean>("codeLens.urlActions", true);
    codeLensDisposable?.dispose();
    codeLensDisposable = enabled
      ? vscode.languages.registerCodeLensProvider(UrlCodeLensProvider.SELECTOR, codeLensProvider)
      : undefined;
  };
  registerCodeLens();
  context.subscriptions.push(
    codeLensProvider,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("deepsyte.codeLens.urlActions")) {
        registerCodeLens();
      }
    }),
    { dispose: () => codeLensDisposable?.dispose() },
  );

  // Magic-comment CodeLens is always on — it only fires for `// @screenshot`
  // style directives, which are opt-in by definition.
  const magicCommentProvider = new MagicCommentCodeLensProvider();
  context.subscriptions.push(
    magicCommentProvider,
    vscode.languages.registerCodeLensProvider(MagicCommentCodeLensProvider.SELECTOR, magicCommentProvider),
  );

  // Completion for magic-comment option keys, values, and known URLs.
  const magicCommentCompletions = new MagicCommentCompletionProvider(urlHistory);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      MagicCommentCompletionProvider.SELECTOR,
      magicCommentCompletions,
      ...MagicCommentCompletionProvider.TRIGGER_CHARS,
    ),
  );

  const hasApiKey = await authStore.hasApiKey();
  statusBar.update(hasApiKey);

  const refreshBudget = async () => {
    const { budget, errors, fromDefaults } = await loadAuditBudget();
    statusBar.setWarnThreshold(budget.warnThreshold);
    if (!fromDefaults) {
      logLine(`Loaded audit budget: maxPerUrl=${budget.maxFindingsPerUrl} maxTotal=${budget.maxTotalFindings} warnAt=${budget.warnThreshold}`);
    }
    for (const err of errors) {
      logLine(`[budget] ${err}`);
    }
  };
  await refreshBudget();
  statusBar.setFindingsCount(auditDiagnostics.totalCount());
  context.subscriptions.push(
    auditDiagnostics.onDidChangeCount((count) => statusBar.setFindingsCount(count)),
  );

  // Re-read the budget when the file changes.
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, "{.deepsyte/budget.json,.deepsyte.budget.json}"),
    );
    context.subscriptions.push(
      watcher,
      watcher.onDidChange(() => void refreshBudget()),
      watcher.onDidCreate(() => void refreshBudget()),
      watcher.onDidDelete(() => void refreshBudget()),
    );
  }

  // First-run: open the "Get started" walkthrough once per machine.
  const welcomedKey = "deepsyte.welcomedAt";
  if (!context.globalState.get<string>(welcomedKey)) {
    await context.globalState.update(welcomedKey, new Date().toISOString());
    void vscode.commands.executeCommand(
      "workbench.action.openWalkthrough",
      { category: "DeepSyte.deepsyte-vscode#deepsyte.getStarted", step: "deepsyte.getStarted#signIn" },
      false,
    );
  }

  if (hasApiKey) {
    const apiKey = await authStore.getApiKey();
    if (apiKey) {
      await configureEditorAfterSignIn(apiKey, autoInstaller, timelineStore);
      void pingApiKey(context, apiKey, statusBar, timelineStore);
    }
  } else {
    void oauthController.signIn({ automatic: true }).then(async (apiKey) => {
      if (apiKey) {
        await configureEditorAfterSignIn(apiKey, autoInstaller, timelineStore);
      }
    });
  }
}

/**
 * Validates the stored API key against the API on activation. If it fails,
 * surfaces a one-time prompt offering to sign in again. Skipped on the same
 * day to avoid noise on every window reload.
 */
async function pingApiKey(
  context: vscode.ExtensionContext,
  apiKey: string,
  statusBar: StatusBarController,
  timelineStore: TimelineStore,
): Promise<void> {
  const PING_KEY = "deepsyte.lastPingDay";
  const today = new Date().toISOString().slice(0, 10);
  if (context.globalState.get<string>(PING_KEY) === today) {
    return;
  }
  try {
    const result = await validateApiKey(apiKey);
    await context.globalState.update(PING_KEY, today);
    if (result.ok) {
      logLine("API key validated successfully on activation.");
      return;
    }
    logLine(`API key validation failed: ${result.message}`);
    statusBar.update(false);
    timelineStore.add({
      title: "API key validation failed",
      detail: result.message,
      status: "error",
    });
    const action = await vscode.window.showWarningMessage(
      `DeepSyte couldn't validate your API key (${result.message}). Sign in again?`,
      "Sign In",
      "Dismiss",
    );
    if (action === "Sign In") {
      await vscode.commands.executeCommand("deepsyte.signIn");
    }
  } catch (err) {
    // Network failures are non-fatal — don't bug the user about them.
    logLine(`API key ping skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function deactivate(): void {
  logLine("Deactivating DeepSyte extension.");
}
