/**
 * Pure parser for `.deepsyte/budget.json` — a shared contract between
 * the VS Code extension's status-bar badge and the CLI `check` command.
 *
 * Schema:
 *
 *   {
 *     "maxFindingsPerUrl": 10,        // optional, default 10
 *     "maxTotalFindings":  50,        // optional, default 50
 *     "warnThreshold":     20,        // optional, default 20 (badge turns red)
 *     "categories": ["accessibility", "performance"]   // optional, default all
 *   }
 *
 * Unknown keys are ignored. Out-of-range numbers are clamped to safe ranges.
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

const MIN = 1;
const MAX_PER = 1000;
const MAX_TOTAL = 10000;
const MAX_WARN = 1000;

export interface ParsedBudget {
  budget: AuditBudget;
  errors: string[];
}

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
    return {
      budget: { ...DEFAULT_BUDGET },
      errors: ["Top-level JSON must be an object."],
    };
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
