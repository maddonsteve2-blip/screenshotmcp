import * as vscode from "vscode";
import type { UrlHistoryStore } from "../history/store";

const DIRECTIVE_TRIGGER = /@(screenshot|audit|diff)\b([^\n]*)$/i;
const OPTION_KEYS = ["width", "height", "fullPage", "delay", "format"];
const FORMAT_VALUES = ["png", "jpeg", "webp"];

/**
 * Provides IntelliSense inside ScreenshotsMCP magic comments.
 * Triggered on whitespace and `=`:
 *   - After `@screenshot`/`@audit`/`@diff`, suggests known URLs from history.
 *   - After a key like `format=`, suggests the enum values.
 *   - Elsewhere in the directive, suggests option keys (`width=`, etc.).
 */
export class MagicCommentCompletionProvider implements vscode.CompletionItemProvider {
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

  static readonly TRIGGER_CHARS = [" ", "=", "@"];

  constructor(private readonly urlHistory: UrlHistoryStore) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const lineText = document.lineAt(position.line).text.slice(0, position.character);
    const directive = lineText.match(DIRECTIVE_TRIGGER);
    if (!directive) return [];

    const kind = directive[1].toLowerCase();
    const tail = directive[2] ?? "";

    // `format=` value completion takes precedence.
    const formatCtx = tail.match(/\bformat\s*=\s*(\w*)$/i);
    if (formatCtx) {
      return FORMAT_VALUES.map((value) => {
        const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.EnumMember);
        item.detail = "ScreenshotsMCP format";
        return item;
      });
    }

    // Just typed the directive → suggest URLs + option keys.
    const suggestions: vscode.CompletionItem[] = [];
    const urls = this.urlHistory.listUrls().slice(0, 10);
    for (const u of urls) {
      const item = new vscode.CompletionItem(u.url, vscode.CompletionItemKind.Value);
      item.detail = `Recent URL \u00b7 ${u.count} run${u.count === 1 ? "" : "s"}`;
      item.sortText = `0_${u.url}`;
      suggestions.push(item);
    }

    // `diff` requires two URLs — no option keys apply.
    if (kind !== "diff") {
      const usedKeys = new Set(
        Array.from(tail.matchAll(/\b(\w+)\s*=/g)).map((m) => m[1].toLowerCase()),
      );
      for (const key of OPTION_KEYS) {
        if (usedKeys.has(key.toLowerCase())) continue;
        const item = new vscode.CompletionItem(`${key}=`, vscode.CompletionItemKind.Property);
        item.detail = "ScreenshotsMCP option";
        item.sortText = `1_${key}`;
        if (key === "format") {
          item.insertText = new vscode.SnippetString(`format=\${1|${FORMAT_VALUES.join(",")}|}`);
        } else if (key === "fullPage") {
          item.insertText = new vscode.SnippetString("fullPage=${1|true,false|}");
        } else if (key === "width") {
          item.insertText = new vscode.SnippetString("width=${1:1280}");
        } else if (key === "height") {
          item.insertText = new vscode.SnippetString("height=${1:800}");
        } else if (key === "delay") {
          item.insertText = new vscode.SnippetString("delay=${1:0}");
        }
        suggestions.push(item);
      }
    }

    return suggestions;
  }
}
