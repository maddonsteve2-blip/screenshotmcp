/**
 * Parser for `.deepsyte/urls.json` — a per-workspace list of URLs that a
 * team wants to screenshot or audit consistently.
 *
 * Accepted shapes:
 *
 *   { "urls": ["https://example.com", "https://example.com/pricing"] }
 *
 *   {
 *     "urls": [
 *       { "url": "https://example.com", "label": "Home" },
 *       { "url": "https://example.com/pricing", "label": "Pricing", "tags": ["marketing"] }
 *     ]
 *   }
 *
 *   // A bare array is also accepted for convenience.
 *   [ "https://example.com", { "url": "https://example.com/pricing" } ]
 */

export interface ProjectUrlEntry {
  url: string;
  label?: string;
  tags?: string[];
}

export interface ParsedProjectUrls {
  entries: ProjectUrlEntry[];
  errors: string[];
}

const MAX_ENTRIES = 200;

export function parseProjectUrlsJson(text: string): ParsedProjectUrls {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { entries: [], errors: [`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const rawList = extractRawList(parsed, errors);
  const entries: ProjectUrlEntry[] = [];
  const seen = new Set<string>();
  for (const raw of rawList) {
    const entry = normalizeEntry(raw, errors);
    if (!entry) continue;
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    entries.push(entry);
    if (entries.length >= MAX_ENTRIES) {
      errors.push(`Only the first ${MAX_ENTRIES} URLs are loaded.`);
      break;
    }
  }
  return { entries, errors };
}

function extractRawList(parsed: unknown, errors: string[]): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const urls = (parsed as Record<string, unknown>).urls;
    if (Array.isArray(urls)) return urls;
    errors.push('Expected a "urls" array at the top level.');
    return [];
  }
  errors.push("Top-level JSON must be an array or an object with a `urls` array.");
  return [];
}

function normalizeEntry(raw: unknown, errors: string[]): ProjectUrlEntry | undefined {
  if (typeof raw === "string") {
    if (!isHttpUrl(raw)) {
      errors.push(`Skipped "${raw}": not a valid http(s) URL.`);
      return undefined;
    }
    return { url: raw };
  }
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!isHttpUrl(url)) {
      errors.push(`Skipped entry without a valid "url" field.`);
      return undefined;
    }
    const entry: ProjectUrlEntry = { url };
    if (typeof record.label === "string" && record.label.trim()) {
      entry.label = record.label.trim();
    }
    if (Array.isArray(record.tags)) {
      const tags = record.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
      if (tags.length > 0) entry.tags = tags;
    }
    return entry;
  }
  errors.push("Skipped entry (must be a string URL or an object with { url, label?, tags? }).");
  return undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
