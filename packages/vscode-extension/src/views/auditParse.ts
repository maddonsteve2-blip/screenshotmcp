/**
 * Severity enum mirrored from `vscode.DiagnosticSeverity` so this module
 * stays pure (testable without the `vscode` runtime).
 */
export const DiagnosticSeverityPure = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
} as const;

export type DiagnosticSeverityValue =
  (typeof DiagnosticSeverityPure)[keyof typeof DiagnosticSeverityPure];

/**
 * Category → severity mapping. Keep it conservative: "Error" is reserved for
 * things the user almost certainly needs to fix; UX/SEO suggestions stay at
 * Warning/Information to avoid spamming the Problems tab.
 */
const CATEGORY_SEVERITY: Record<string, DiagnosticSeverityValue> = {
  accessibility: DiagnosticSeverityPure.Warning,
  performance: DiagnosticSeverityPure.Warning,
  seo: DiagnosticSeverityPure.Information,
  navigation: DiagnosticSeverityPure.Information,
  content: DiagnosticSeverityPure.Information,
  mobile: DiagnosticSeverityPure.Information,
  "mobile-friendliness": DiagnosticSeverityPure.Information,
};

export interface AuditFinding {
  category: string;
  message: string;
  severity: DiagnosticSeverityValue;
}

/**
 * Parses a ux_review markdown-ish response into structured findings.
 * Looks for headings ("## Accessibility") followed by bullet points.
 */
export function parseAuditFindings(text: string): AuditFinding[] {
  const lines = text.split(/\r?\n/);
  const findings: AuditFinding[] = [];
  let currentCategory = "general";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      currentCategory = heading[1]
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-|-$/g, "");
      continue;
    }
    const bullet = line.match(/^[-*+]\s+(.+)$/);
    if (!bullet) {
      continue;
    }
    const message = bullet[1].replace(/^\*\*([^*]+)\*\*:?\s*/, "$1 \u2014 ").trim();
    if (message.length < 6) {
      continue;
    }
    if (/\b(great|excellent|well[- ]done|looks good)\b/i.test(message) && !/\b(but|however|although)\b/i.test(message)) {
      continue;
    }
    const severity = CATEGORY_SEVERITY[currentCategory] ?? DiagnosticSeverityPure.Information;
    findings.push({ category: currentCategory, message, severity });
  }

  return findings;
}
