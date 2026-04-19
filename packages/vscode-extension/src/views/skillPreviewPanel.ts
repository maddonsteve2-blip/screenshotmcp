import * as vscode from "vscode";
import type { CatalogSkill } from "@screenshotsmcp/types/skills";
import { EXTENSION_DISPLAY_NAME } from "../constants";
import { logLine } from "../output";

/**
 * Shows a rich preview of a catalog skill (frontmatter summary + SKILL.md body)
 * before the user commits to installing. Posts {command: "install"} back to the
 * host when the Install button is clicked.
 */
export class SkillPreviewPanel {
  private static current: SkillPreviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly skill: CatalogSkill;
  private onInstall?: () => void;

  static show(skill: CatalogSkill, onInstall: () => void): void {
    if (SkillPreviewPanel.current && SkillPreviewPanel.current.skill.name === skill.name) {
      SkillPreviewPanel.current.onInstall = onInstall;
      SkillPreviewPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    SkillPreviewPanel.current?.dispose();
    SkillPreviewPanel.current = new SkillPreviewPanel(skill, onInstall);
  }

  private constructor(skill: CatalogSkill, onInstall: () => void) {
    this.skill = skill;
    this.onInstall = onInstall;
    this.panel = vscode.window.createWebviewPanel(
      "screenshotsmcp.skillPreview",
      `${EXTENSION_DISPLAY_NAME} · ${skill.displayName}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: { command?: string }) => {
        if (msg?.command === "install") {
          this.onInstall?.();
        }
      },
      undefined,
      this.disposables,
    );

    this.renderLoading();
    void this.load();
  }

  private dispose(): void {
    if (SkillPreviewPanel.current === this) {
      SkillPreviewPanel.current = undefined;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.panel.dispose();
  }

  private renderLoading(): void {
    this.panel.webview.html = wrapHtml(this.skill, /* body */ "<p class='muted'>Loading skill content…</p>", /* error */ undefined);
  }

  private async load(): Promise<void> {
    try {
      const res = await fetch(this.skill.contentUrl, { headers: { Accept: "text/plain,*/*" } });
      if (!res.ok) {
        this.panel.webview.html = wrapHtml(this.skill, "", `Failed to load skill: ${res.status} ${res.statusText}`);
        return;
      }
      const md = await res.text();
      const { frontmatter, body } = parseFrontmatter(md);
      this.panel.webview.html = wrapHtml(this.skill, renderBody(body), undefined, frontmatter);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logLine(`Skill preview load failed: ${message}`);
      this.panel.webview.html = wrapHtml(this.skill, "", message);
    }
  }
}

interface Frontmatter {
  description?: string;
  license?: string;
  compatibility?: string;
  metadataVersion?: string;
}

function parseFrontmatter(md: string): { frontmatter: Frontmatter; body: string } {
  const match = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: md };
  }

  const yaml = match[1] ?? "";
  const body = match[2] ?? "";

  const frontmatter: Frontmatter = {};
  const lines = yaml.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) {
      i += 1;
      continue;
    }
    const key = m[1];
    let value = m[2].trim();

    // Handle folded `>` block.
    if (value === ">" || value === "|") {
      const collected: string[] = [];
      i += 1;
      while (i < lines.length && /^\s{2,}/.test(lines[i] ?? "")) {
        collected.push((lines[i] ?? "").trim());
        i += 1;
      }
      value = collected.join(" ");
    } else {
      i += 1;
    }

    value = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");

    if (key === "description") frontmatter.description = value;
    else if (key === "license") frontmatter.license = value;
    else if (key === "compatibility") frontmatter.compatibility = value;
  }

  // Pull a version from `metadata:\n  version: "..."` if present.
  const versionMatch = yaml.match(/^\s*version:\s*"?([^"\n]+)"?$/m);
  if (versionMatch) {
    frontmatter.metadataVersion = versionMatch[1]?.trim();
  }

  return { frontmatter, body };
}

function renderBody(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];

  const flushCode = () => {
    if (codeBuf.length > 0) {
      out.push(
        `<pre class="code${codeLang ? ` lang-${escapeHtml(codeLang)}` : ""}"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`,
      );
    }
    codeBuf = [];
    codeLang = "";
  };

  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        closeList();
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    if (line.startsWith("# ")) {
      closeList();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      closeList();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (/^- /.test(line)) {
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim() === "") {
      closeList();
      out.push("");
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }

  if (inCode) flushCode();
  closeList();

  return out.join("\n");
}

function inline(text: string): string {
  // Escape first, then re-inject inline code and emphasis.
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
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

function wrapHtml(skill: CatalogSkill, body: string, error: string | undefined, frontmatter?: Frontmatter): string {
  const errorBlock = error
    ? `<div class="error">${escapeHtml(error)}</div>`
    : "";
  const fmDescription = frontmatter?.description ?? skill.description;
  const version = frontmatter?.metadataVersion ?? skill.version;
  const compatibility = frontmatter?.compatibility ?? "";
  const license = frontmatter?.license ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(skill.displayName)}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: var(--vscode-font-family);
    padding: 20px 28px 40px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    max-width: 840px;
    line-height: 1.55;
  }
  header { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 14px; margin-bottom: 20px; }
  header h1 { margin: 0 0 6px; font-size: 22px; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 12px; display: flex; gap: 14px; flex-wrap: wrap; }
  .meta span { padding: 2px 0; }
  .summary { color: var(--vscode-descriptionForeground); margin: 12px 0 0; }
  .toolbar { display: flex; gap: 10px; margin: 16px 0 24px; }
  button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  h1, h2, h3 { color: var(--vscode-foreground); }
  h2 { margin-top: 28px; font-size: 17px; }
  h3 { margin-top: 18px; font-size: 14px; }
  p { margin: 10px 0; }
  ul { padding-left: 22px; }
  li { margin: 4px 0; }
  code {
    font-family: var(--vscode-editor-font-family);
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.92em;
  }
  pre.code {
    background: var(--vscode-textCodeBlock-background);
    padding: 10px 12px;
    border-radius: 5px;
    overflow-x: auto;
  }
  pre.code code { background: transparent; padding: 0; }
  .error {
    border: 1px solid var(--vscode-editorError-border, var(--vscode-errorForeground));
    color: var(--vscode-errorForeground);
    padding: 10px 12px;
    border-radius: 4px;
    margin-bottom: 16px;
  }
  .muted { color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(skill.displayName)}</h1>
    <div class="meta">
      <span><strong>Name:</strong> ${escapeHtml(skill.name)}</span>
      <span><strong>Version:</strong> ${escapeHtml(version)}</span>
      ${license ? `<span><strong>License:</strong> ${escapeHtml(license)}</span>` : ""}
    </div>
    <p class="summary">${escapeHtml(fmDescription)}</p>
    ${compatibility ? `<p class="summary"><strong>Compatibility:</strong> ${escapeHtml(compatibility)}</p>` : ""}
    <div class="toolbar">
      <button class="primary" id="install">Install skill</button>
    </div>
  </header>
  ${errorBlock}
  <main>${body}</main>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('install')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'install' });
    });
  </script>
</body>
</html>`;
}
