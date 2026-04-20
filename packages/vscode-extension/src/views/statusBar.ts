import * as vscode from "vscode";

export class StatusBarController {
  private readonly item: vscode.StatusBarItem;
  private readonly findingsItem: vscode.StatusBarItem;
  private isAuthenticated = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.name = "ScreenshotsMCP";
    this.item.command = "screenshotsmcp.checkStatus";

    // Secondary item showing the total audit-finding count. Hidden when zero.
    this.findingsItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.findingsItem.name = "ScreenshotsMCP: Audit findings";
    this.findingsItem.command = "workbench.actions.view.problems";
  }

  update(isAuthenticated: boolean): void {
    this.isAuthenticated = isAuthenticated;
    if (isAuthenticated) {
      this.item.text = "$(device-camera) ScreenshotsMCP";
      this.item.tooltip = "ScreenshotsMCP \u2014 click for quick actions";
      this.item.backgroundColor = undefined;
      this.item.command = "screenshotsmcp.showQuickActions";
    } else {
      this.item.text = "$(key) ScreenshotsMCP Sign In";
      this.item.tooltip = "Sign in to ScreenshotsMCP";
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      this.item.command = "screenshotsmcp.signIn";
    }
    this.item.show();
  }

  private warnThreshold = 20;

  /** Update the threshold above which the badge turns red. */
  setWarnThreshold(threshold: number): void {
    this.warnThreshold = Math.max(1, Math.round(threshold));
    // Re-render with current count if there is one in DOM.
    if (this.findingsItem.text) {
      this.refreshBackground();
    }
  }

  private currentTotal = 0;

  /**
   * Reflect the current audit-finding count. Hidden when total is zero or
   * the user is signed out (no findings will ever appear).
   */
  setFindingsCount(total: number): void {
    this.currentTotal = total;
    if (!this.isAuthenticated || total <= 0) {
      this.findingsItem.hide();
      return;
    }
    this.findingsItem.text = `$(warning) ${total} audit finding${total === 1 ? "" : "s"}`;
    this.findingsItem.tooltip = `ScreenshotsMCP audit findings in the Problems tab (${total}, budget threshold ${this.warnThreshold}). Click to open.`;
    this.refreshBackground();
    this.findingsItem.show();
  }

  private refreshBackground(): void {
    this.findingsItem.backgroundColor = this.currentTotal >= this.warnThreshold
      ? new vscode.ThemeColor("statusBarItem.errorBackground")
      : new vscode.ThemeColor("statusBarItem.warningBackground");
  }

  dispose(): void {
    this.item.dispose();
    this.findingsItem.dispose();
  }
}
