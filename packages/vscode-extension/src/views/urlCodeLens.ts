import * as vscode from "vscode";
import { findUrlsForCodeLens, type UrlCodeLensMatch } from "./urlScan";

export { findUrlsForCodeLens };
export type { UrlCodeLensMatch };

/**
 * Surfaces "📸 Screenshot" and "🔍 Audit" CodeLens actions above every HTTP(S)
 * URL in the editor. Uses a conservative regex that stops at whitespace,
 * quotes, backticks, commas, and closing brackets so URLs embedded in JSON,
 * JS strings, or markdown render cleanly.
 */
export class UrlCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changeEmitter.event;

  /** Languages this provider is registered for; keep them small to avoid noise. */
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
  ];

  dispose(): void {
    this.changeEmitter.dispose();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.lineCount > 5000) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    for (const { url, index } of findUrlsForCodeLens(document.getText())) {
      const startPos = document.positionAt(index);
      const range = new vscode.Range(startPos, startPos);
      lenses.push(
        new vscode.CodeLens(range, {
          title: "📸 Screenshot",
          command: "deepsyte.takeScreenshotAtUrl",
          arguments: [url],
          tooltip: `Capture ${url}`,
        }),
        new vscode.CodeLens(range, {
          title: "🔍 Audit",
          command: "deepsyte.auditUrl",
          arguments: [url],
          tooltip: `Audit ${url}`,
        }),
      );
    }

    return lenses;
  }
}

