import { readFileSync } from "fs";
import * as vscode from "vscode";
import type { DiscoveredWorkflow } from "../skills/discoverWorkflows";

const PANELS = new Map<string, vscode.WebviewPanel>();

export const WorkflowPanel = {
  show(workflow: DiscoveredWorkflow): void {
    const existing = PANELS.get(workflow.path);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Beside);
      return;
    }

    let content = "";
    try {
      content = readFileSync(workflow.path, "utf8");
    } catch (err) {
      content = `Could not read workflow file: ${err instanceof Error ? err.message : String(err)}`;
    }

    const panel = vscode.window.createWebviewPanel(
      "screenshotsmcp.workflow",
      workflow.title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    panel.webview.html = renderHtml(workflow, content);
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isRecord(message) || typeof message.type !== "string") {
        return;
      }
      if (message.type === "copyPrompt") {
        const prompt = toPrompt(workflow, content);
        await vscode.env.clipboard.writeText(prompt);
        void vscode.window.showInformationMessage(`Copied "${workflow.title}" as a prompt to the clipboard.`);
        return;
      }
      if (message.type === "openFile") {
        const doc = await vscode.workspace.openTextDocument(workflow.path);
        await vscode.window.showTextDocument(doc, { preview: false });
      }
    });

    panel.onDidDispose(() => {
      PANELS.delete(workflow.path);
    });

    PANELS.set(workflow.path, panel);
  },
};

function toPrompt(workflow: DiscoveredWorkflow, content: string): string {
  return `Please follow this workflow exactly. It is an authoritative runbook from the "${workflow.skill}" skill installed under ~/.agents/skills/${workflow.skill}.\n\nWorkflow: ${workflow.title}\nSource: ${workflow.relativePath}\n\n---\n\n${content.trim()}\n`;
}

function renderHtml(workflow: DiscoveredWorkflow, content: string): string {
  const rendered = renderMarkdown(content);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(workflow.title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 0;
      margin: 0;
    }
    header {
      position: sticky; top: 0;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px;
      padding: 12px 20px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      z-index: 5;
    }
    header h1 { font-size: 15px; margin: 0; }
    header .path { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .actions { display: flex; gap: 6px; }
    .btn {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    .btn.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: transparent;
    }
    .btn:hover { filter: brightness(1.1); }
    main {
      padding: 20px 24px;
      line-height: 1.6;
      max-width: 820px;
    }
    main h1 { font-size: 22px; margin-top: 0; }
    main h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
    main h3 { font-size: 15px; margin-top: 20px; }
    main pre, main code {
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
      font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
      font-size: 12.5px;
    }
    main pre { padding: 10px 12px; border-radius: 6px; overflow-x: auto; }
    main code { padding: 1px 4px; border-radius: 3px; }
    main pre code { padding: 0; background: none; }
    main ul, main ol { padding-left: 22px; }
    main a { color: var(--vscode-textLink-foreground); }
    main blockquote {
      border-left: 3px solid var(--vscode-panel-border);
      padding: 4px 10px;
      color: var(--vscode-descriptionForeground);
      margin: 0 0 12px;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(workflow.title)}</h1>
      <div class="path">${escapeHtml(workflow.skill)} \u00b7 ${escapeHtml(workflow.relativePath)}</div>
    </div>
    <div class="actions">
      <button class="btn primary" id="copyPrompt">Copy as prompt</button>
      <button class="btn" id="openFile">Open file</button>
    </div>
  </header>
  <main>${rendered}</main>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('copyPrompt').addEventListener('click', () => {
      vscode.postMessage({ type: 'copyPrompt' });
    });
    document.getElementById('openFile').addEventListener('click', () => {
      vscode.postMessage({ type: 'openFile' });
    });
  </script>
</body>
</html>`;
}

/** Minimal markdown → HTML. Covers headings, bold/italic, inline code, fenced code, lists, links, blockquotes, paragraphs. */
function renderMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];
  let listStack: ("ul" | "ol")[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(`<p>${inlineFormat(para.join(" "))}</p>`);
    para = [];
  };
  const closeLists = (targetDepth = 0) => {
    while (listStack.length > targetDepth) {
      out.push(`</${listStack.pop()}>`);
    }
  };

  for (const raw of lines) {
    if (inCode) {
      if (raw.startsWith("```")) {
        out.push(`<pre><code${codeLang ? ` class="lang-${escapeAttr(codeLang)}"` : ""}>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
        inCode = false;
        codeLang = "";
        codeBuf = [];
        continue;
      }
      codeBuf.push(raw);
      continue;
    }

    if (raw.startsWith("```")) {
      flushPara();
      closeLists();
      inCode = true;
      codeLang = raw.slice(3).trim();
      continue;
    }

    const heading = raw.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      closeLists();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`);
      continue;
    }

    const ulMatch = raw.match(/^\s*[-*+]\s+(.*)$/);
    const olMatch = raw.match(/^\s*\d+\.\s+(.*)$/);
    if (ulMatch || olMatch) {
      flushPara();
      const targetTag: "ul" | "ol" = ulMatch ? "ul" : "ol";
      if (listStack[listStack.length - 1] !== targetTag) {
        closeLists();
        listStack.push(targetTag);
        out.push(`<${targetTag}>`);
      }
      out.push(`<li>${inlineFormat((ulMatch ?? olMatch)![1])}</li>`);
      continue;
    }

    if (raw.startsWith(">")) {
      flushPara();
      closeLists();
      out.push(`<blockquote>${inlineFormat(raw.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }

    if (raw.trim() === "") {
      flushPara();
      closeLists();
      continue;
    }

    para.push(raw);
  }

  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
  }
  flushPara();
  closeLists();
  return out.join("\n");
}

function inlineFormat(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) => `<a href="${escapeAttr(href)}">${label}</a>`);
  return out;
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
