import * as vscode from "vscode";
import type { DiffResult } from "./diffParse";

export interface DiffPanelInput {
  urlA: string;
  urlB: string;
  result: DiffResult;
  capturedAt: string;
}

const PANELS = new Map<string, vscode.WebviewPanel>();

export const DiffPanel = {
  show(input: DiffPanelInput, rerun: () => void): void {
    const key = `${input.urlA}__${input.urlB}`;
    const existing = PANELS.get(key);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Beside);
      existing.webview.html = render(input);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "deepsyte.diff",
      `Diff: ${shortHost(input.urlA)} vs ${shortHost(input.urlB)}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = render(input);
    panel.webview.onDidReceiveMessage(async (msg: unknown) => {
      if (!isRecord(msg) || typeof msg.type !== "string") return;
      if (msg.type === "openExternal" && typeof msg.url === "string") {
        await vscode.env.openExternal(vscode.Uri.parse(msg.url));
      } else if (msg.type === "rerun") {
        rerun();
      }
    });
    panel.onDidDispose(() => PANELS.delete(key));
    PANELS.set(key, panel);
  },
};

function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 30);
  }
}

function render(input: DiffPanelInput): string {
  const { result, urlA, urlB, capturedAt } = input;
  const match = result.matchScore;
  const pct = result.changedPercent;
  const verdict = match === undefined
    ? "Unknown"
    : match >= 99
      ? "Nearly identical"
      : match >= 95
        ? "Small differences"
        : match >= 80
          ? "Noticeable changes"
          : "Significant changes";
  const verdictClass = match === undefined
    ? "unknown"
    : match >= 99
      ? "good"
      : match >= 95
        ? "ok"
        : match >= 80
          ? "warn"
          : "bad";

  const imageBlock = (label: string, url?: string) => url
    ? `<figure class="shot"><figcaption>${escapeHtml(label)}</figcaption><img src="${escapeAttr(url)}" data-open="${escapeAttr(url)}" alt="${escapeAttr(label)}" /></figure>`
    : `<figure class="shot missing"><figcaption>${escapeHtml(label)}</figcaption><div class="empty">Not returned</div></figure>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Visual Diff</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; }
    header {
      position: sticky; top: 0; z-index: 5;
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      padding: 14px 20px; background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    header h1 { font-size: 14px; margin: 0 0 4px; }
    header .meta { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .urls { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--vscode-descriptionForeground); }
    .urls b { color: var(--vscode-foreground); font-weight: 600; }
    .actions { display: flex; gap: 6px; }
    .btn {
      background: transparent; color: var(--vscode-textLink-foreground);
      border: 1px solid var(--vscode-panel-border); border-radius: 4px;
      padding: 4px 10px; font-size: 12px; cursor: pointer;
    }
    .btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
    .btn:hover { filter: brightness(1.1); }
    main { padding: 16px 20px; display: flex; flex-direction: column; gap: 16px; }
    .stats {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
    }
    .stat {
      border: 1px solid var(--vscode-panel-border); border-radius: 8px;
      padding: 10px 12px;
      background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-editorHoverWidget-background));
    }
    .stat .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vscode-descriptionForeground); }
    .stat .value { font-size: 18px; font-weight: 600; margin-top: 4px; }
    .verdict {
      display: inline-flex; padding: 4px 10px; border-radius: 999px;
      font-size: 11px; letter-spacing: 0.03em;
    }
    .verdict.good { background: rgba(74, 222, 128, 0.18); }
    .verdict.ok { background: rgba(96, 165, 250, 0.18); }
    .verdict.warn { background: rgba(251, 191, 36, 0.2); }
    .verdict.bad { background: rgba(248, 113, 113, 0.22); }
    .verdict.unknown { background: rgba(156, 163, 175, 0.18); }
    .shots {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
    }
    .shot {
      margin: 0;
      border: 1px solid var(--vscode-panel-border); border-radius: 8px;
      padding: 8px;
      background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-editorHoverWidget-background));
    }
    .shot figcaption { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.06em; }
    .shot img {
      width: 100%; height: auto; display: block;
      border-radius: 4px; border: 1px solid var(--vscode-panel-border);
      cursor: zoom-in;
    }
    .shot.missing .empty {
      border: 1px dashed var(--vscode-panel-border); border-radius: 4px;
      padding: 24px; text-align: center; color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Visual Diff</h1>
      <div class="urls">
        <span><b>A</b> ${escapeHtml(urlA)}</span>
        <span><b>B</b> ${escapeHtml(urlB)}</span>
      </div>
      <div class="meta">Captured ${escapeHtml(capturedAt)}</div>
    </div>
    <div class="actions">
      <button class="btn primary" id="rerun">Re-run diff</button>
      ${result.diffUrl ? `<button class="btn" data-open="${escapeAttr(result.diffUrl)}">Open diff image</button>` : ""}
    </div>
  </header>
  <main>
    <div class="stats">
      <div class="stat"><div class="label">Verdict</div><div class="value"><span class="verdict ${verdictClass}">${verdict}</span></div></div>
      <div class="stat"><div class="label">Match score</div><div class="value">${match !== undefined ? match.toFixed(1) + "%" : "\u2014"}</div></div>
      <div class="stat"><div class="label">Pixels changed</div><div class="value">${pct !== undefined ? pct.toFixed(2) + "%" : "\u2014"}</div></div>
      <div class="stat"><div class="label">Resolution</div><div class="value">${escapeHtml(result.resolution ?? "\u2014")}</div></div>
    </div>
    <div class="shots">
      ${imageBlock("Before (A)", result.beforeUrl)}
      ${imageBlock("After (B)", result.afterUrl)}
      ${imageBlock("Diff overlay", result.diffUrl)}
    </div>
  </main>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('rerun')?.addEventListener('click', () => vscode.postMessage({ type: 'rerun' }));
    document.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', () => vscode.postMessage({ type: 'openExternal', url: el.getAttribute('data-open') }));
    });
  </script>
</body>
</html>`;
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
