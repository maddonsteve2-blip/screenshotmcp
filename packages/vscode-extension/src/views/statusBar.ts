import * as vscode from "vscode";

export class StatusBarController {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.name = "ScreenshotsMCP";
    this.item.command = "screenshotsmcp.checkStatus";
  }

  update(isAuthenticated: boolean): void {
    if (isAuthenticated) {
      this.item.text = "$(device-camera-video) ScreenshotsMCP";
      this.item.tooltip = "ScreenshotsMCP connected";
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = "$(key) ScreenshotsMCP Sign In";
      this.item.tooltip = "Sign in to ScreenshotsMCP";
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      this.item.command = "screenshotsmcp.signIn";
    }
    if (isAuthenticated) {
      this.item.command = "screenshotsmcp.checkStatus";
    }
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
