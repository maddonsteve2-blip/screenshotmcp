/**
 * Pure parser for `.deepsyte/budget.json` — kept in sync with the
 * VS Code extension's `src/project/budget.ts`. CLI vs extension are
 * shipped as separate npm packages, so the parser is duplicated rather
 * than depended on across boundaries.
 */

export interface AuditBudget {
  maxFindingsPerUrl: number;
  maxTotalFindings: number;
  warnThreshold: number;
  categories?: string[];
}

export const DEFAULT_BUDGET: AuditBudget = {
  maxFindingsPerUrl: 10,
  maxTotalFindings: 50,
  warnThreshold: 20,
};

export interface ParsedBudget {
  budget: AuditBudget;
  errors: string[];
}

const MIN = 1;
const MAX_PER = 1000;
const MAX_TOTAL = 10000;
const MAX_WARN = 1000;

export function parseBudgetJson(text: string): ParsedBudget {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      budget: { ...DEFAULT_BUDGET },
      errors: [`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { budget: { ...DEFAULT_BUDGET }, errors: ["Top-level JSON must be an object."] };
  }
  const obj = parsed as Record<string, unknown>;
  const budget: AuditBudget = { ...DEFAULT_BUDGET };
  if ("maxFindingsPerUrl" in obj) {
    const n = clamp(obj.maxFindingsPerUrl, MIN, MAX_PER, "maxFindingsPerUrl", errors);
    if (n !== undefined) budget.maxFindingsPerUrl = n;
  }
  if ("maxTotalFindings" in obj) {
    const n = clamp(obj.maxTotalFindings, MIN, MAX_TOTAL, "maxTotalFindings", errors);
    if (n !== undefined) budget.maxTotalFindings = n;
  }
  if ("warnThreshold" in obj) {
    const n = clamp(obj.warnThreshold, MIN, MAX_WARN, "warnThreshold", errors);
    if (n !== undefined) budget.warnThreshold = n;
  }
  if ("categories" in obj) {
    if (Array.isArray(obj.categories)) {
      const cats = obj.categories
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.toLowerCase());
      if (cats.length > 0) budget.categories = cats;
    } else {
      errors.push("`categories` must be an array of strings.");
    }
  }
  return { budget, errors };
}

function clamp(raw: unknown, min: number, max: number, key: string, errors: string[]): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    errors.push(`\`${key}\` must be a finite number.`);
    return undefined;
  }
  const rounded = Math.round(raw);
  if (rounded < min || rounded > max) {
    errors.push(`\`${key}\` clamped to [${min}, ${max}] from ${raw}.`);
  }
  return Math.min(max, Math.max(min, rounded));
}

export async function loadBudgetFromCwd(): Promise<{ budget: AuditBudget; path?: string; errors: string[] }> {
  const { resolve } = await import("node:path");
  const { readFile } = await import("node:fs/promises");
  const candidates = [".deepsyte/budget.json", ".deepsyte.budget.json"];
  for (const candidate of candidates) {
    const full = resolve(process.cwd(), candidate);
    try {
      const text = await readFile(full, "utf8");
      const { budget, errors } = parseBudgetJson(text);
      return { budget, path: full, errors };
    } catch {
      continue;
    }
  }
  return { budget: { ...DEFAULT_BUDGET }, errors: [] };
}
