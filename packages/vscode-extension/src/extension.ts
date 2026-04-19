import * as vscode from "vscode";
import { OAuthController } from "./auth/oauth";
import { AuthStore } from "./auth/store";
import { CatalogCache } from "./catalog/cache";
import { configureEditorAfterSignIn, registerCommands } from "./commands";
import { SIDEBAR_VIEW_ID } from "./constants";
import { EditorMcpAutoInstaller } from "./mcp/autoInstaller";
import { logLine } from "./output";
import { ScreenshotsMcpServerProvider } from "./mcp/serverProvider";
import { TimelineStore } from "./timeline/store";
import { SidebarProvider } from "./views/sidebar";
import { StatusBarController } from "./views/statusBar";
import { TimelinePanelController } from "./views/timelinePanel";
import { UrlCodeLensProvider } from "./views/urlCodeLens";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const authStore = new AuthStore(context);
  const statusBar = new StatusBarController();
  const provider = new ScreenshotsMcpServerProvider(authStore);
  const autoInstaller = new EditorMcpAutoInstaller(context, provider);
  const timelineStore = new TimelineStore();
  const timelinePanel = new TimelinePanelController(context, timelineStore);
  const catalogCache = new CatalogCache(context);
  const sidebarProvider = new SidebarProvider(authStore, timelineStore, catalogCache);
  const oauthController = new OAuthController(context, authStore, provider, statusBar, timelineStore);

  logLine("Activating ScreenshotsMCP extension.");
  timelineStore.add({
    title: "Extension activated",
    detail: "ScreenshotsMCP extension activation completed.",
    status: "info",
  });

  context.subscriptions.push(statusBar);
  context.subscriptions.push(timelinePanel);
  context.subscriptions.push(sidebarProvider);
  context.subscriptions.push(oauthController);
  context.subscriptions.push(vscode.window.createTreeView(SIDEBAR_VIEW_ID, {
    treeDataProvider: sidebarProvider,
    showCollapseAll: false,
  }));

  const providerDisposable = provider.register();
  if (providerDisposable) {
    context.subscriptions.push(providerDisposable);
    logLine("Registered ScreenshotsMCP MCP provider.");
    timelineStore.add({
      title: "MCP provider registered",
      detail: "ScreenshotsMCP MCP server definition provider is available.",
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
  });

  // Kick off a background refresh of the hosted skill catalog. Errors fall back
  // to the in-code SKILL_CATALOG silently; the sidebar always has something to
  // render.
  void catalogCache.refresh();

  // Register CodeLens on URLs if the user hasn't disabled it. The setting
  // `screenshotsmcp.codeLens.urlActions` defaults to true and is observed on
  // change below.
  const codeLensProvider = new UrlCodeLensProvider();
  let codeLensDisposable: vscode.Disposable | undefined;
  const registerCodeLens = () => {
    const enabled = vscode.workspace
      .getConfiguration("screenshotsmcp")
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
      if (e.affectsConfiguration("screenshotsmcp.codeLens.urlActions")) {
        registerCodeLens();
      }
    }),
    { dispose: () => codeLensDisposable?.dispose() },
  );

  const hasApiKey = await authStore.hasApiKey();
  statusBar.update(hasApiKey);

  if (hasApiKey) {
    const apiKey = await authStore.getApiKey();
    if (apiKey) {
      await configureEditorAfterSignIn(apiKey, autoInstaller, timelineStore);
    }
  } else {
    void oauthController.signIn({ automatic: true }).then(async (apiKey) => {
      if (apiKey) {
        await configureEditorAfterSignIn(apiKey, autoInstaller, timelineStore);
      }
    });
  }
}

export function deactivate(): void {
  logLine("Deactivating ScreenshotsMCP extension.");
}
