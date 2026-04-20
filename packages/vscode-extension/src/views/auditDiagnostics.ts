import * as vscode from "vscode";
import { findUrlsForCodeLens } from "./urlScan";
import { parseAuditFindings as parseAuditFindingsPure, type AuditFinding as PureAuditFinding } from "./auditParse";

export { parseAuditFindingsPure as parseAuditFindings };
export type AuditFinding = PureAuditFinding;

/**
 * Manages a single DiagnosticCollection for audit findings, indexed by the
 * audited URL. When the same URL appears in an open document, we attach the
 * findings to the first matching line range.
 */
export class AuditDiagnostics implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly changeEmitter = new vscode.EventEmitter<number>();
  /** Fires whenever the total finding count changes. */
  readonly onDidChangeCount = this.changeEmitter.event;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection("screenshotsmcp.audit");
  }

  dispose(): void {
    this.collection.dispose();
    this.changeEmitter.dispose();
  }

  /** Total audit findings currently in the collection. */
  totalCount(): number {
    let total = 0;
    this.collection.forEach((_uri, diagnostics) => {
      total += diagnostics.length;
    });
    return total;
  }

  private emitChange(): void {
    this.changeEmitter.fire(this.totalCount());
  }

  /** Clear every diagnostic owned by this collection. */
  clear(): void {
    this.collection.clear();
    this.emitChange();
  }

  /**
   * Publishes diagnostics for `url`. If the URL appears in any open document,
   * diagnostics are attached to its first occurrence. Otherwise we fall back
   * to a synthetic Uri so the Problems tab still lists the findings.
   */
  async publish(url: string, findings: AuditFinding[]): Promise<void> {
    if (findings.length === 0) {
      this.clearForUrl(url);
      return;
    }

    const target = findFirstOccurrence(url);
    if (target) {
      const diagnostics = findings.map((f) => this.toDiagnostic(f, target.range));
      this.collection.set(target.uri, diagnostics);
      this.emitChange();
      return;
    }

    const syntheticUri = vscode.Uri.parse(`screenshotsmcp-audit:${encodeURIComponent(url)}`);
    const range = new vscode.Range(0, 0, 0, Math.min(url.length, 120));
    const diagnostics = findings.map((f) => this.toDiagnostic(f, range, url));
    this.collection.set(syntheticUri, diagnostics);
    this.emitChange();
  }

  private clearForUrl(url: string): void {
    const target = findFirstOccurrence(url);
    if (target) {
      this.collection.delete(target.uri);
    }
    this.collection.delete(vscode.Uri.parse(`screenshotsmcp-audit:${encodeURIComponent(url)}`));
    this.emitChange();
  }

  private toDiagnostic(finding: AuditFinding, range: vscode.Range, urlContext?: string): vscode.Diagnostic {
    const prefix = urlContext ? `${urlContext}: ` : "";
    const diag = new vscode.Diagnostic(range, `${prefix}[${finding.category}] ${finding.message}`, finding.severity);
    diag.source = "ScreenshotsMCP audit";
    return diag;
  }
}

interface UrlLocation {
  uri: vscode.Uri;
  range: vscode.Range;
}

function findFirstOccurrence(url: string): UrlLocation | undefined {
  for (const doc of vscode.workspace.textDocuments) {
    const text = doc.getText();
    for (const match of findUrlsForCodeLens(text, 500)) {
      if (match.url === url) {
        const start = doc.positionAt(match.index);
        const end = doc.positionAt(match.index + url.length);
        return { uri: doc.uri, range: new vscode.Range(start, end) };
      }
    }
  }
  return undefined;
}
