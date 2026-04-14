import * as vscode from "vscode";
import { EXTENSION_DISPLAY_NAME } from "../constants";
import { TimelineStore, type TimelineEvent } from "../timeline/store";

export class TimelinePanelController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  private unsubscribe: (() => void) | undefined;

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
        enableScripts: false,
        retainContextWhenHidden: true,
      },
    );

    this.panel.onDidDispose(() => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.panel = undefined;
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

  private render(events: TimelineEvent[]): void {
    if (!this.panel) {
      return;
    }

    this.panel.webview.html = getTimelineHtml(events);
  }
}

function getTimelineHtml(events: TimelineEvent[]): string {
  const items = events.length === 0
    ? '<div class="empty">No activity yet. Run a ScreenshotsMCP command to populate the timeline.</div>'
    : events.map((event) => {
        const detail = event.detail ? `<div class="detail">${escapeHtml(event.detail)}</div>` : "";
        return `
          <div class="event">
            <div class="row">
              <span class="badge ${event.status}">${escapeHtml(event.status)}</span>
              <span class="time">${escapeHtml(formatTimestamp(event.occurredAt))}</span>
            </div>
            <div class="title">${escapeHtml(event.title)}</div>
            ${detail}
          </div>
        `;
      }).join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ScreenshotsMCP Timeline</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        font-family: var(--vscode-font-family);
        padding: 16px;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }
      h1 {
        font-size: 16px;
        margin: 0 0 6px;
      }
      p {
        margin: 0 0 16px;
        color: var(--vscode-descriptionForeground);
      }
      .list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .event {
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
        padding: 12px;
        background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-editorHoverWidget-background));
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
        align-items: center;
      }
      .title {
        font-weight: 600;
        margin-bottom: 4px;
      }
      .detail {
        color: var(--vscode-descriptionForeground);
        word-break: break-word;
      }
      .time {
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
      }
      .badge {
        display: inline-flex;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .badge.info {
        background: rgba(96, 165, 250, 0.18);
      }
      .badge.success {
        background: rgba(74, 222, 128, 0.18);
      }
      .badge.error {
        background: rgba(248, 113, 113, 0.18);
      }
      .empty {
        border: 1px dashed var(--vscode-panel-border);
        border-radius: 8px;
        padding: 16px;
        color: var(--vscode-descriptionForeground);
      }
    </style>
  </head>
  <body>
    <h1>ScreenshotsMCP Timeline</h1>
    <p>Recent extension activity and screenshot events.</p>
    <div class="list">${items}</div>
  </body>
</html>`;
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
