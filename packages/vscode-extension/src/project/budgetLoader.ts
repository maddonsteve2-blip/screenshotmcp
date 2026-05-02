import * as vscode from "vscode";
import { DEFAULT_BUDGET, parseBudgetJson, type AuditBudget } from "./budget";

/**
 * Returns the URI of the existing budget file, or creates a defaults-filled
 * one at `.deepsyte/budget.json` and returns that. Mirrors
 * `ensureProjectUrlsFile`.
 */
export async function ensureProjectBudgetFile(): Promise<vscode.Uri | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showWarningMessage("Open a workspace folder first.");
    return undefined;
  }
  const existing = await loadAuditBudget();
  if (existing.uri) return existing.uri;
  const uri = vscode.Uri.joinPath(folder.uri, ".deepsyte/budget.json");
  const sample = JSON.stringify(DEFAULT_BUDGET, null, 2) + "\n";
  await vscode.workspace.fs.writeFile(uri, Buffer.from(sample, "utf8"));
  return uri;
}

const CANDIDATE_PATHS = [".deepsyte/budget.json", ".deepsyte.budget.json"];

export interface BudgetLoadResult {
  budget: AuditBudget;
  uri?: vscode.Uri;
  errors: string[];
  /** True when no file was found and we returned defaults. */
  fromDefaults: boolean;
}

/**
 * Loads the workspace budget. Falls back to `DEFAULT_BUDGET` when no file
 * exists; `errors` is empty in that case.
 */
export async function loadAuditBudget(): Promise<BudgetLoadResult> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return { budget: { ...DEFAULT_BUDGET }, errors: [], fromDefaults: true };
  }
  for (const relative of CANDIDATE_PATHS) {
    const uri = vscode.Uri.joinPath(folder.uri, relative);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(bytes).toString("utf8");
      const { budget, errors } = parseBudgetJson(text);
      return { budget, uri, errors, fromDefaults: false };
    } catch {
      continue;
    }
  }
  return { budget: { ...DEFAULT_BUDGET }, errors: [], fromDefaults: true };
}
