import * as vscode from "vscode";
import { findMagicComments, type MagicMatch } from "./magicComments";

/**
 * Surfaces CodeLens actions above `// @screenshot`, `// @audit`, and
 * `// @diff` directives. The heavy lifting is delegated to the normal
 * command (`screenshotsmcp.takeScreenshotAtUrl` etc.); this provider just
 * wires up the gutter affordance.
 */
export class MagicCommentCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changeEmitter.event;

  static readonly SELECTOR: vscode.DocumentSelector = [
    { language: "markdown" },
    { language: "plaintext" },
    { language: "javascript" },
    { language: "typescript" },
    { language: "javascriptreact" },
    { language: "typescriptreact" },
    { language: "json" },
    { language: "jsonc" },
    { language: "yaml" },
    { language: "html" },
    { language: "python" },
    { language: "go" },
    { language: "rust" },
    { language: "java" },
    { language: "csharp" },
    { language: "ruby" },
    { language: "php" },
  ];

  dispose(): void {
    this.changeEmitter.dispose();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.lineCount > 5000) return [];
    const matches = findMagicComments(document.getText());
    const lenses: vscode.CodeLens[] = [];
    for (const match of matches) {
      const range = new vscode.Range(match.line, 0, match.line, 0);
      for (const lens of buildLensesFor(match, range)) {
        lenses.push(lens);
      }
    }
    return lenses;
  }
}

function buildLensesFor(match: MagicMatch, range: vscode.Range): vscode.CodeLens[] {
  if (match.kind === "diff") {
    const [a, b] = match.urls;
    return [
      new vscode.CodeLens(range, {
        title: "\u{1F50D} Diff",
        command: "screenshotsmcp.diffUrls",
        arguments: [a, b],
        tooltip: `Visual diff: ${a} vs ${b}`,
      }),
    ];
  }
  const url = match.urls[0];
  if (!url) return [];
  if (match.kind === "audit") {
    return [
      new vscode.CodeLens(range, {
        title: "\u{1F50D} Audit",
        command: "screenshotsmcp.auditUrl",
        arguments: [url],
        tooltip: `Audit ${url}`,
      }),
    ];
  }
  if (match.kind === "baseline") {
    return [
      new vscode.CodeLens(range, {
        title: "\u{1F4CC} Capture baseline",
        command: "screenshotsmcp.captureBaseline",
        arguments: [url],
        tooltip: `Capture and store a visual baseline for ${url}`,
      }),
      new vscode.CodeLens(range, {
        title: "\u{1F50D} Diff vs baseline",
        command: "screenshotsmcp.diffBaseline",
        arguments: [url],
        tooltip: `Re-capture ${url} and diff against the stored baseline`,
      }),
      new vscode.CodeLens(range, {
        title: "\u{2B06} Promote baseline",
        command: "screenshotsmcp.promoteBaseline",
        arguments: [url],
        tooltip: `Overwrite the stored baseline for ${url} with a fresh capture`,
      }),
    ];
  }
  // screenshot
  return [
    new vscode.CodeLens(range, {
      title: "\u{1F4F8} Screenshot",
      command: "screenshotsmcp.takeScreenshotAtUrl",
      arguments: [url, match.options],
      tooltip: describeScreenshot(url, match),
    }),
    new vscode.CodeLens(range, {
      title: "\u{1F50D} Audit",
      command: "screenshotsmcp.auditUrl",
      arguments: [url],
      tooltip: `Audit ${url}`,
    }),
  ];
}

function describeScreenshot(url: string, match: MagicMatch): string {
  const opts = match.options;
  const parts: string[] = [`Capture ${url}`];
  if (opts.width || opts.height) {
    parts.push(`${opts.width ?? "?"}x${opts.height ?? "?"}`);
  }
  if (opts.format) parts.push(opts.format);
  if (opts.fullPage === false) parts.push("viewport only");
  if (opts.delay) parts.push(`delay=${opts.delay}ms`);
  return parts.join(" \u00b7 ");
}
