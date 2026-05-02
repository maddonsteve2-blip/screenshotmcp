import * as vscode from "vscode";
import type { HistoryEntry, UrlHistoryStore } from "../history/store";

const PANELS = new Map<string, vscode.WebviewPanel>();

export const UrlHistoryPanel = {
  show(url: string, store: UrlHistoryStore): void {
    const existing = PANELS.get(url);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Beside);
      existing.webview.html = render(url, store.get(url));
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "deepsyte.history",
      `History: ${shortenUrl(url)}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = render(url, store.get(url));
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isRecord(message) || typeof message.type !== "string") return;
      if (message.type === "screenshot") {
        await vscode.commands.executeCommand("deepsyte.takeScreenshotAtUrl", url);
      } else if (message.type === "audit") {
        await vscode.commands.executeCommand("deepsyte.auditUrl", url);
      } else if (message.type === "openExternal" && typeof message.url === "string") {
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
      } else if (message.type === "clear") {
        store.clearForUrl(url);
        panel.webview.html = render(url, store.get(url));
      }
    });
    panel.onDidDispose(() => PANELS.delete(url));
    PANELS.set(url, panel);
  },
};

function shortenUrl(url: string): string {
  if (url.length <= 60) return url;
  return url.slice(0, 57) + "...";
}

function render(url: string, entries: HistoryEntry[]): string {
  const body = entries.length === 0
    ? '<div class="empty">No history yet. Capture this URL or run an audit to start building history.</div>'
    : entries.map(renderEntry).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>History: ${escapeHtml(url)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; }
    header {
      position: sticky; top: 0;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 20px; background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border); z-index: 4;
    }
    header h1 { font-size: 14px; margin: 0; }
    header .url { color: var(--vscode-descriptionForeground); font-size: 11px; word-break: break-all; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .btn {
      background: transparent; color: var(--vscode-textLink-foreground);
      border: 1px solid var(--vscode-panel-border); border-radius: 4px;
      padding: 4px 10px; font-size: 12px; cursor: pointer;
    }
    .btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
    .btn:hover { filter: brightness(1.1); }
    main { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
    .entry {
      display: grid; grid-template-columns: 140px 1fr; gap: 14px;
      border: 1px solid var(--vscode-panel-border); border-radius: 8px;
      padding: 12px;
      background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-editorHoverWidget-background));
    }
    .entry.no-thumb { grid-template-columns: 1fr; }
    .thumb {
      width: 140px; height: 90px; object-fit: cover; object-position: top;
      border-radius: 6px; border: 1px solid var(--vscode-panel-border);
    }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
    .kind {
      display: inline-flex; padding: 2px 8px; border-radius: 999px;
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
    }
    .kind.screenshot { background: rgba(96, 165, 250, 0.18); }
    .kind.audit { background: rgba(192, 132, 252, 0.22); }
    .time { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .entry-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .empty {
      border: 1px dashed var(--vscode-panel-border); border-radius: 8px;
      padding: 16px; color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>URL history</h1>
      <div class="url">${escapeHtml(url)}</div>
    </div>
    <div class="actions">
      <button class="btn primary" id="screenshot">Capture now</button>
      <button class="btn" id="audit">Audit now</button>
      <button class="btn" id="clear">Clear history</button>
    </div>
  </header>
  <main>${body}</main>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('screenshot').addEventListener('click', () => vscode.postMessage({ type: 'screenshot' }));
    document.getElementById('audit').addEventListener('click', () => vscode.postMessage({ type: 'audit' }));
    document.getElementById('clear').addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
    document.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'openExternal', url: el.getAttribute('data-open') });
      });
    });
  </script>
</body>
</html>`;
}

function renderEntry(entry: HistoryEntry): string {
  const when = new Date(entry.occurredAt).toLocaleString();
  const thumb = entry.imageUrl
    ? `<img class="thumb" src="${escapeAttr(entry.imageUrl)}" alt="${escapeAttr(entry.url)}" />`
    : "";
  const actions: string[] = [];
  if (entry.imageUrl) actions.push(`<button class="btn" data-open="${escapeAttr(entry.imageUrl)}">Open image</button>`);
  if (entry.runUrl) actions.push(`<button class="btn" data-open="${escapeAttr(entry.runUrl)}">View run</button>`);
  return `
    <div class="entry ${thumb ? "" : "no-thumb"}">
      ${thumb}
      <div>
        <div class="row">
          <span class="kind ${entry.kind}">${entry.kind}</span>
          <span class="time">${escapeHtml(when)}</span>
        </div>
        <div class="entry-actions">${actions.join("")}</div>
      </div>
    </div>
  `;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
