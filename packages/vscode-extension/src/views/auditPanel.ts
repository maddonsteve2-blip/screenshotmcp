import * as vscode from "vscode";
import { EXTENSION_DISPLAY_NAME } from "../constants";

export interface AuditPanelInput {
  url: string;
  reviewText: string;
  screenshotUrl?: string;
  capturedAt: string;
  runUrl?: string;
}

/**
 * Renders a UX audit report inline in VS Code. Groups the review text into
 * sections based on markdown-style headings and surfaces the hero screenshot
 * above the findings. Reuses a single panel across re-runs.
 */
export class AuditPanel {
  private static current: AuditPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private input: AuditPanelInput;
  private onRerun?: () => void;

  static show(input: AuditPanelInput, onRerun: () => void): void {
    if (AuditPanel.current) {
      AuditPanel.current.update(input, onRerun);
      AuditPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    AuditPanel.current = new AuditPanel(input, onRerun);
  }

  private constructor(input: AuditPanelInput, onRerun: () => void) {
    this.input = input;
    this.onRerun = onRerun;
    this.panel = vscode.window.createWebviewPanel(
      "deepsyte.audit",
      `${EXTENSION_DISPLAY_NAME} · Audit`,
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

  private update(input: AuditPanelInput, onRerun: () => void): void {
    this.input = input;
    this.onRerun = onRerun;
    this.render();
  }

  private async handleMessage(command: string | undefined): Promise<void> {
    if (command === "rerun") {
      this.onRerun?.();
    } else if (command === "openDashboard" && this.input.runUrl) {
      await vscode.env.openExternal(vscode.Uri.parse(this.input.runUrl));
    } else if (command === "copy") {
      await vscode.env.clipboard.writeText(this.input.reviewText);
      void vscode.window.showInformationMessage("Audit report copied.");
    } else if (command === "openImage" && this.input.screenshotUrl) {
      await vscode.env.openExternal(vscode.Uri.parse(this.input.screenshotUrl));
    }
  }

  private dispose(): void {
    if (AuditPanel.current === this) {
      AuditPanel.current = undefined;
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

function wrap(input: AuditPanelInput): string {
  const sections = renderSections(input.reviewText);
  const imgBlock = input.screenshotUrl
    ? `<div class="hero"><img src="${escapeAttr(input.screenshotUrl)}" alt="Screenshot of ${escapeAttr(input.url)}" /></div>`
    : "";
  const dashButton = input.runUrl
    ? `<button id="openDashboard">Open in dashboard</button>`
    : "";
  const imgButton = input.screenshotUrl
    ? `<button id="openImage">Open screenshot</button>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>UX audit</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 20px 28px 36px;
    max-width: 920px;
    line-height: 1.55;
  }
  header { margin-bottom: 12px; }
  h1 { margin: 0 0 2px; font-size: 18px; }
  h2 {
    font-size: 14px;
    margin: 22px 0 6px;
    color: var(--vscode-foreground);
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 4px;
  }
  h3 { font-size: 13px; margin: 14px 0 4px; }
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
    margin: 12px 0 18px;
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
  .hero {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
    background: var(--vscode-editorWidget-background);
    margin-bottom: 18px;
    max-height: 320px;
    display: flex;
    justify-content: center;
  }
  .hero img { max-width: 100%; max-height: 320px; object-fit: contain; }
  p { margin: 8px 0; }
  ul { padding-left: 22px; margin: 6px 0; }
  li { margin: 3px 0; }
  code {
    font-family: var(--vscode-editor-font-family);
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.92em;
  }
  pre {
    background: var(--vscode-textCodeBlock-background);
    padding: 10px 12px;
    border-radius: 5px;
    overflow-x: auto;
    font-size: 12px;
  }
  .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
</style>
</head>
<body>
  <header>
    <h1>UX audit</h1>
    <div class="url">${escapeHtml(input.url)}</div>
    <div class="meta">${escapeHtml(input.capturedAt)}</div>
  </header>
  <div class="toolbar">
    <button id="rerun">↻ Re-audit</button>
    <button id="copy">Copy report</button>
    ${imgButton}
    ${dashButton}
  </div>
  ${imgBlock}
  <main>${sections || '<div class="empty">No audit findings returned.</div>'}</main>
  <script>
    const vscode = acquireVsCodeApi();
    for (const id of ['rerun','copy','openImage','openDashboard']) {
      document.getElementById(id)?.addEventListener('click', () => vscode.postMessage({ command: id }));
    }
  </script>
</body>
</html>`;
}

function renderSections(reviewText: string): string {
  if (!reviewText.trim()) {
    return "";
  }

  const lines = reviewText.split("\n");
  const out: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (/^#{1,2}\s+/.test(line)) {
      closeList();
      const depth = line.startsWith("## ") ? 2 : 1;
      const title = line.replace(/^#{1,2}\s+/, "");
      const tag = depth === 1 ? "h2" : "h2";
      out.push(`<${tag}>${inline(title)}</${tag}>`);
    } else if (/^#{3,6}\s+/.test(line)) {
      closeList();
      const title = line.replace(/^#{3,6}\s+/, "");
      out.push(`<h3>${inline(title)}</h3>`);
    } else if (/^-\s+/.test(line) || /^\*\s+/.test(line)) {
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (/^\d+\.\s+/.test(line)) {
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push(`<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`);
    } else if (line.trim() === "") {
      closeList();
      out.push("");
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("\n");
}

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
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
