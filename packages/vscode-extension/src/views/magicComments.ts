/**
 * Pure parser for ScreenshotsMCP magic comments in source files.
 *
 * Supported syntax (anywhere in a line, after `//`, `#`, or `<!--`):
 *
 *   // @screenshot https://example.com
 *   // @screenshot https://example.com width=1440 height=900 fullPage=false
 *   // @audit https://example.com
 *   // @diff https://staging.example.com https://example.com
 *
 * Options are comma-less `key=value` pairs. Unknown keys are ignored.
 */

export type MagicKind = "screenshot" | "audit" | "diff" | "baseline";

export interface MagicMatch {
  kind: MagicKind;
  /** The line number (0-indexed) containing the directive. */
  line: number;
  /** URLs mentioned on the directive line. `diff` always has two, others one. */
  urls: string[];
  /** Parsed options (only `width`, `height`, `fullPage`, `delay`, `format`). */
  options: MagicOptions;
}

export interface MagicOptions {
  width?: number;
  height?: number;
  fullPage?: boolean;
  delay?: number;
  format?: "png" | "jpeg" | "webp";
}

const DIRECTIVE_RE = /@(screenshot|audit|diff|baseline)\b([^\n]*)/i;
const URL_RE = /https?:\/\/[^\s)"'`,<>]+/g;
const OPTION_RE = /\b(width|height|fullPage|delay|format)\s*=\s*([^\s]+)/g;

export function findMagicComments(text: string): MagicMatch[] {
  const results: MagicMatch[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const directive = line.match(DIRECTIVE_RE);
    if (!directive) continue;
    const kind = directive[1].toLowerCase() as MagicKind;
    const tail = directive[2] ?? "";
    const urls = Array.from(tail.matchAll(URL_RE)).map((m) => m[0]);
    if (kind === "diff" ? urls.length < 2 : urls.length < 1) continue;
    const options = parseOptions(tail);
    results.push({
      kind,
      line: i,
      urls: kind === "diff" ? urls.slice(0, 2) : urls.slice(0, 1),
      options,
    });
  }
  return results;
}

function parseOptions(tail: string): MagicOptions {
  const options: MagicOptions = {};
  for (const match of tail.matchAll(OPTION_RE)) {
    const key = match[1].toLowerCase();
    const raw = match[2];
    switch (key) {
      case "width": {
        const n = parseInteger(raw, 320, 3840);
        if (n !== undefined) options.width = n;
        break;
      }
      case "height": {
        const n = parseInteger(raw, 240, 2160);
        if (n !== undefined) options.height = n;
        break;
      }
      case "fullpage": {
        const bool = parseBoolean(raw);
        if (bool !== undefined) options.fullPage = bool;
        break;
      }
      case "delay": {
        const n = parseInteger(raw, 0, 10000);
        if (n !== undefined) options.delay = n;
        break;
      }
      case "format": {
        const lower = raw.toLowerCase();
        if (lower === "png" || lower === "jpeg" || lower === "webp") {
          options.format = lower;
        }
        break;
      }
    }
  }
  return options;
}

function parseInteger(raw: string, min: number, max: number): number | undefined {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

function parseBoolean(raw: string): boolean | undefined {
  const lower = raw.toLowerCase();
  if (lower === "true" || lower === "1" || lower === "yes") return true;
  if (lower === "false" || lower === "0" || lower === "no") return false;
  return undefined;
}
