import * as vscode from "vscode";

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
    const urlRegex = /https?:\/\/[^\s"'`,<>)\]]+/g;
    const text = document.getText();

    let match: RegExpExecArray | null;
    let emitted = 0;
    const MAX = 50;

    while ((match = urlRegex.exec(text)) !== null) {
      if (emitted >= MAX) {
        break;
      }
      let url = match[0];
      // Trim trailing punctuation that's commonly not part of the URL.
      url = url.replace(/[.,:;!?]+$/, "");
      if (url.length < 10) {
        continue;
      }

      const startPos = document.positionAt(match.index);
      const range = new vscode.Range(startPos, startPos);

      lenses.push(
        new vscode.CodeLens(range, {
          title: "📸 Screenshot",
          command: "screenshotsmcp.takeScreenshotAtUrl",
          arguments: [url],
          tooltip: `Capture ${url}`,
        }),
        new vscode.CodeLens(range, {
          title: "🔍 Audit",
          command: "screenshotsmcp.auditUrl",
          arguments: [url],
          tooltip: `Audit ${url}`,
        }),
      );
      emitted += 1;
    }

    return lenses;
  }
}
