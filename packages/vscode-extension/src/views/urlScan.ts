export interface UrlCodeLensMatch {
  url: string;
  index: number;
}

/**
 * Pure helper (no VS Code dependency) that scans text for HTTP(S) URLs
 * suitable for CodeLens actions. Exported so it can be unit-tested without
 * loading the `vscode` module.
 */
export function findUrlsForCodeLens(text: string, max = 50): UrlCodeLensMatch[] {
  const urlRegex = /https?:\/\/[^\s"'`,<>)\]]+/g;
  const out: UrlCodeLensMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    if (out.length >= max) {
      break;
    }
    const cleaned = match[0].replace(/[.,:;!?]+$/, "");
    if (cleaned.length < 10) {
      continue;
    }
    out.push({ url: cleaned, index: match.index });
  }
  return out;
}
