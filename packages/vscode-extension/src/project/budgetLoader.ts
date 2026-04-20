import * as vscode from "vscode";
import { DEFAULT_BUDGET, parseBudgetJson, type AuditBudget } from "./budget";

const CANDIDATE_PATHS = [".screenshotsmcp/budget.json", ".screenshotsmcp.budget.json"];

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
