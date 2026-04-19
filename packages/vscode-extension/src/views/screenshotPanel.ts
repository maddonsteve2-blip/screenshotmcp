import * as vscode from "vscode";
import { EXTENSION_DISPLAY_NAME } from "../constants";

export interface ScreenshotPanelInput {
  url: string;
  imageUrl: string;
  capturedAt: string;
  dimensions?: { width: number; height: number };
  runUrl?: string;
}

/**
 * Renders the captured screenshot inline in VS Code with Open / Copy URL /
 * Rerun / Open in dashboard actions. Single-panel: the next screenshot reuses
 * the existing panel rather than spawning a new one.
 */
export class ScreenshotPanel {
  private static current: ScreenshotPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private onRerun?: () => void;
  private input: ScreenshotPanelInput;

  static show(input: ScreenshotPanelInput, onRerun: () => void): void {
    if (ScreenshotPanel.current) {
      ScreenshotPanel.current.update(input, onRerun);
      ScreenshotPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    ScreenshotPanel.current = new ScreenshotPanel(input, onRerun);
  }

  private constructor(input: ScreenshotPanelInput, onRerun: () => void) {
    this.input = input;
    this.onRerun = onRerun;
    this.panel = vscode.window.createWebviewPanel(
      "screenshotsmcp.screenshot",
      `${EXTENSION_DISPLAY_NAME} · Screenshot`,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: { command?: string }) => {
        void this.handleMessage(msg?.command);
      },
      undefined,
      this.disposables,
    );
    this.render();
  }

  private update(input: ScreenshotPanelInput, onRerun: () => void): void {
    this.input = input;
    this.onRerun = onRerun;
    this.render();
  }

  private async handleMessage(command: string | undefined): Promise<void> {
    if (command === "open") {
      await vscode.env.openExternal(vscode.Uri.parse(this.input.imageUrl));
    } else if (command === "copy") {
      await vscode.env.clipboard.writeText(this.input.imageUrl);
      void vscode.window.showInformationMessage("Screenshot URL copied.");
    } else if (command === "rerun") {
      this.onRerun?.();
    } else if (command === "openDashboard" && this.input.runUrl) {
      await vscode.env.openExternal(vscode.Uri.parse(this.input.runUrl));
    }
  }

  private dispose(): void {
    if (ScreenshotPanel.current === this) {
      ScreenshotPanel.current = undefined;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.panel.dispose();
  }

  private render(): void {
    this.panel.webview.html = wrap(this.input);
  }
}

function wrap(input: ScreenshotPanelInput): string {
  const dims = input.dimensions
    ? `${input.dimensions.width} × ${input.dimensions.height}`
    : "";
  const dashButton = input.runUrl
    ? `<button id="openDashboard">Open in dashboard</button>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Screenshot</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 18px 24px 28px;
  }
  header { margin-bottom: 14px; }
  h1 { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
  .url {
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    color: var(--vscode-textLink-foreground);
    word-break: break-all;
  }
  .meta {
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    margin-top: 2px;
  }
  .toolbar {
    display: flex;
    gap: 8px;
    margin: 12px 0 16px;
    flex-wrap: wrap;
  }
  button {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    padding: 5px 12px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  #rerun {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  #rerun:hover { background: var(--vscode-button-hoverBackground); }
  .image-wrap {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
    background: var(--vscode-editorWidget-background);
    display: flex;
    justify-content: center;
  }
  img {
    max-width: 100%;
    height: auto;
    display: block;
  }
</style>
</head>
<body>
  <header>
    <h1>Screenshot</h1>
    <div class="url">${escapeHtml(input.url)}</div>
    <div class="meta">${dims ? `${escapeHtml(dims)} · ` : ""}${escapeHtml(input.capturedAt)}</div>
  </header>
  <div class="toolbar">
    <button id="rerun">↻ Rerun</button>
    <button id="open">Open image</button>
    <button id="copy">Copy URL</button>
    ${dashButton}
  </div>
  <div class="image-wrap">
    <img src="${escapeAttr(input.imageUrl)}" alt="Screenshot of ${escapeAttr(input.url)}" />
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    for (const id of ['rerun','open','copy','openDashboard']) {
      document.getElementById(id)?.addEventListener('click', () => vscode.postMessage({ command: id }));
    }
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
