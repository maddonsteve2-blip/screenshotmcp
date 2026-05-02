import * as vscode from "vscode";

export class StatusBarController {
  private readonly item: vscode.StatusBarItem;
  private readonly findingsItem: vscode.StatusBarItem;
  private isAuthenticated = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.name = "DeepSyte";
    this.item.command = "deepsyte.checkStatus";

    // Secondary item showing the total audit-finding count. Hidden when zero.
    this.findingsItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.findingsItem.name = "DeepSyte: Audit findings";
    this.findingsItem.command = "workbench.actions.view.problems";
  }

  update(isAuthenticated: boolean): void {
    this.isAuthenticated = isAuthenticated;
    if (isAuthenticated) {
      this.item.text = "$(device-camera) DeepSyte";
      this.item.tooltip = "DeepSyte \u2014 click for quick actions";
      this.item.backgroundColor = undefined;
      this.item.command = "deepsyte.showQuickActions";
    } else {
      this.item.text = "$(key) DeepSyte Sign In";
      this.item.tooltip = "Sign in to DeepSyte";
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      this.item.command = "deepsyte.signIn";
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
    this.findingsItem.tooltip = `DeepSyte audit findings in the Problems tab (${total}, budget threshold ${this.warnThreshold}). Click to open.`;
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
