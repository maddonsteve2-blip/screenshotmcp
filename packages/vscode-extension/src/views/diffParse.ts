export interface DiffResult {
  beforeUrl?: string;
  afterUrl?: string;
  diffUrl?: string;
  changedPixels?: number;
  changedPercent?: number;
  matchScore?: number;
  resolution?: string;
  threshold?: number;
}

/**
 * Parses the text content returned by the `screenshot_diff` MCP tool.
 * Lines look like:
 *   Before: https://cdn.example.com/diff-a-abc.png
 *   After:  https://cdn.example.com/diff-b-abc.png
 *   Diff:   https://cdn.example.com/diff-abc.png
 *   Changed: 1,234 pixels (1.23%)
 *   Match score: 98.7%
 *   Resolution: 1280×800
 *   Threshold: 0.1
 */
export function parseDiffText(text: string): DiffResult {
  const result: DiffResult = {};
  const before = text.match(/^Before:\s*(\S+)/m);
  if (before) result.beforeUrl = before[1];
  const after = text.match(/^After:\s*(\S+)/m);
  if (after) result.afterUrl = after[1];
  const diff = text.match(/^Diff:\s*(\S+)/m);
  if (diff) result.diffUrl = diff[1];
  const changed = text.match(/^Changed:\s*([\d,]+)\s*pixels\s*\(([\d.]+)\s*%\)/m);
  if (changed) {
    result.changedPixels = Number.parseInt(changed[1].replace(/,/g, ""), 10);
    result.changedPercent = Number.parseFloat(changed[2]);
  }
  const match = text.match(/^Match\s*score:\s*([\d.]+)\s*%/m);
  if (match) result.matchScore = Number.parseFloat(match[1]);
  const resolution = text.match(/^Resolution:\s*(\S+)/m);
  if (resolution) result.resolution = resolution[1];
  const threshold = text.match(/^Threshold:\s*([\d.]+)/m);
  if (threshold) result.threshold = Number.parseFloat(threshold[1]);
  return result;
}
