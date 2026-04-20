import * as vscode from "vscode";
import { parseProjectUrlsJson, type ParsedProjectUrls, type ProjectUrlEntry } from "./urlList";

const CANDIDATE_PATHS = [".screenshotsmcp/urls.json", ".screenshotsmcp.json"];

export interface ProjectUrlsLocation {
  uri: vscode.Uri;
  parsed: ParsedProjectUrls;
}

export async function loadProjectUrls(): Promise<ProjectUrlsLocation | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  for (const relative of CANDIDATE_PATHS) {
    const uri = vscode.Uri.joinPath(folder.uri, relative);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(bytes).toString("utf8");
      return { uri, parsed: parseProjectUrlsJson(text) };
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function ensureProjectUrlsFile(): Promise<vscode.Uri | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showWarningMessage("Open a workspace folder first.");
    return undefined;
  }
  const existing = await loadProjectUrls();
  if (existing) return existing.uri;
  const uri = vscode.Uri.joinPath(folder.uri, ".screenshotsmcp/urls.json");
  const sample = JSON.stringify(
    {
      urls: [
        { url: "https://example.com", label: "Homepage" },
        { url: "https://example.com/pricing", label: "Pricing" },
      ],
    },
    null,
    2,
  );
  await vscode.workspace.fs.writeFile(uri, Buffer.from(sample, "utf8"));
  return uri;
}

export function formatEntryLabel(entry: ProjectUrlEntry): string {
  return entry.label ? `${entry.label} \u2014 ${entry.url}` : entry.url;
}
