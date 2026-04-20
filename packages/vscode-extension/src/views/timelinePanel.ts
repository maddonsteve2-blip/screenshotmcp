import * as vscode from "vscode";
import { EXTENSION_DISPLAY_NAME } from "../constants";
import { TimelineStore, type TimelineEvent, type TimelineEventKind } from "../timeline/store";

type FilterKind = TimelineEventKind | "all";

export class TimelinePanelController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  private unsubscribe: (() => void) | undefined;

  private filter: FilterKind = "all";

  constructor(private readonly context: vscode.ExtensionContext, private readonly store: TimelineStore) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      this.render(this.store.getEvents());
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "screenshotsmcp.timeline",
      `${EXTENSION_DISPLAY_NAME} Timeline`,
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.onDidDispose(() => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.panel = undefined;
    }, null, this.context.subscriptions);

    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      this.handleMessage(message);
    }, null, this.context.subscriptions);

    this.unsubscribe = this.store.subscribe((events) => {
      this.render(events);
    });
  }

  dispose(): void {
    this.unsubscribe?.();
    this.panel?.dispose();
    this.panel = undefined;
  }

  private handleMessage(message: unknown): void {
    if (!isRecord(message) || typeof message.type !== "string") {
      return;
    }
    if (message.type === "filter" && typeof message.kind === "string") {
      this.filter = normalizeFilter(message.kind);
      this.render(this.store.getEvents());
      return;
    }
    if (message.type === "openExternal" && typeof message.url === "string") {
      void vscode.env.openExternal(vscode.Uri.parse(message.url));
      return;
    }
    if (message.type === "screenshot" && typeof message.url === "string") {
      void vscode.commands.executeCommand("screenshotsmcp.takeScreenshotAtUrl", message.url);
      return;
    }
    if (message.type === "audit" && typeof message.url === "string") {
      void vscode.commands.executeCommand("screenshotsmcp.auditUrl", message.url);
      return;
    }
    if (message.type === "clear") {
      this.store.clear();
    }
  }

  private render(events: TimelineEvent[]): void {
    if (!this.panel) {
      return;
    }

    const filtered = this.filter === "all"
      ? events
      : events.filter((e) => e.kind === this.filter);
    this.panel.webview.html = getTimelineHtml(filtered, events, this.filter);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeFilter(kind: string): FilterKind {
  const allowed: FilterKind[] = ["all", "screenshot", "audit", "run", "info"];
  return (allowed as string[]).includes(kind) ? (kind as FilterKind) : "all";
}

function getTimelineHtml(filtered: TimelineEvent[], all: TimelineEvent[], filter: FilterKind): string {
  const counts = {
    all: all.length,
    screenshot: all.filter((e) => e.kind === "screenshot").length,
    audit: all.filter((e) => e.kind === "audit").length,
    run: all.filter((e) => e.kind === "run").length,
    info: all.filter((e) => e.kind === "info").length,
  };
  const chip = (id: FilterKind, label: string) =>
    `<button class="chip ${filter === id ? "active" : ""}" data-filter="${id}">${label} <span class="count">${counts[id]}</span></button>`;

  const chips = [
    chip("all", "All"),
    chip("screenshot", "📸 Screenshots"),
    chip("audit", "🔍 Audits"),
    chip("run", "Runs"),
    chip("info", "Info"),
  ].join("\n");

  const items = filtered.length === 0
    ? '<div class="empty">No activity for this filter yet. Run a ScreenshotsMCP command to populate the timeline.</div>'
    : filtered.map(renderEvent).join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ScreenshotsMCP Timeline</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        font-family: var(--vscode-font-family);
        padding: 16px;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }
      header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      h1 { font-size: 16px; margin: 0; }
      header .hint { color: var(--vscode-descriptionForeground); font-size: 12px; }
      .filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
      .chip {
        background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.12));
        color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
        border: 1px solid var(--vscode-panel-border);
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .chip:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.2)); }
      .chip.active {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border-color: transparent;
      }
      .chip .count { opacity: 0.75; margin-left: 4px; font-variant-numeric: tabular-nums; }
      .list { display: flex; flex-direction: column; gap: 12px; }
      .event {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 12px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
        padding: 12px;
        background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-editorHoverWidget-background));
      }
      .event.no-thumb { grid-template-columns: 1fr; }
      .thumb {
        width: 120px; height: 80px;
        object-fit: cover; object-position: top;
        border-radius: 6px;
        border: 1px solid var(--vscode-panel-border);
        background: var(--vscode-editorWidget-background);
      }
      .body { min-width: 0; }
      .row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; align-items: center; flex-wrap: wrap; }
      .title { font-weight: 600; margin-bottom: 4px; }
      .detail {
        color: var(--vscode-descriptionForeground);
        word-break: break-all;
        font-size: 12px;
        margin-bottom: 6px;
      }
      .time { color: var(--vscode-descriptionForeground); font-size: 11px; }
      .badge {
        display: inline-flex;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .badge.info { background: rgba(96, 165, 250, 0.18); }
      .badge.success { background: rgba(74, 222, 128, 0.18); }
      .badge.error { background: rgba(248, 113, 113, 0.18); }
      .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
      .actions button {
        background: transparent;
        color: var(--vscode-textLink-foreground);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 11px;
        cursor: pointer;
      }
      .actions button:hover { background: var(--vscode-list-hoverBackground); }
      .empty {
        border: 1px dashed var(--vscode-panel-border);
        border-radius: 8px;
        padding: 16px;
        color: var(--vscode-descriptionForeground);
      }
      .toolbar-btn {
        background: transparent;
        color: var(--vscode-textLink-foreground);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>ScreenshotsMCP Timeline</h1>
      <button class="toolbar-btn" id="clearBtn">Clear</button>
    </header>
    <div class="filters">${chips}</div>
    <div class="list">${items}</div>
    <script>
      const vscode = acquireVsCodeApi();
      document.querySelectorAll('.chip').forEach((el) => {
        el.addEventListener('click', () => {
          vscode.postMessage({ type: 'filter', kind: el.getAttribute('data-filter') });
        });
      });
      document.getElementById('clearBtn')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'clear' });
      });
      document.querySelectorAll('[data-action]').forEach((el) => {
        el.addEventListener('click', () => {
          const action = el.getAttribute('data-action');
          const url = el.getAttribute('data-url');
          if (!action || !url) return;
          vscode.postMessage({ type: action, url });
        });
      });
    </script>
  </body>
</html>`;
}

function renderEvent(event: TimelineEvent): string {
  const detail = event.detail ? `<div class="detail">${escapeHtml(event.detail)}</div>` : "";
  const kindLabel = event.kind === "info" ? event.status : event.kind;
  const thumb = event.thumbnailUrl
    ? `<img class="thumb" src="${escapeAttr(event.thumbnailUrl)}" alt="${escapeAttr(event.title)}" />`
    : "";
  const actions: string[] = [];
  if (event.targetUrl) {
    if (event.kind === "audit") {
      actions.push(`<button data-action="audit" data-url="${escapeAttr(event.targetUrl)}">Re-audit</button>`);
    } else {
      actions.push(`<button data-action="screenshot" data-url="${escapeAttr(event.targetUrl)}">Rerun</button>`);
    }
    actions.push(`<button data-action="openExternal" data-url="${escapeAttr(event.targetUrl)}">Open URL</button>`);
  }
  if (event.thumbnailUrl) {
    actions.push(`<button data-action="openExternal" data-url="${escapeAttr(event.thumbnailUrl)}">Open image</button>`);
  }
  if (event.runUrl) {
    actions.push(`<button data-action="openExternal" data-url="${escapeAttr(event.runUrl)}">View run</button>`);
  }

  const actionsHtml = actions.length > 0 ? `<div class="actions">${actions.join("")}</div>` : "";
  return `
    <div class="event ${thumb ? "" : "no-thumb"}">
      ${thumb}
      <div class="body">
        <div class="row">
          <span class="badge ${event.status}">${escapeHtml(kindLabel)}</span>
          <span class="time">${escapeHtml(formatTimestamp(event.occurredAt))}</span>
        </div>
        <div class="title">${escapeHtml(event.title)}</div>
        ${detail}
        ${actionsHtml}
      </div>
    </div>
  `;
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
