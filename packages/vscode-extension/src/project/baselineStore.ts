import * as vscode from "vscode";
import * as crypto from "node:crypto";

const BASELINE_DIR = ".screenshotsmcp/baselines";

export interface StoredBaseline {
  url: string;
  imageUrl: string;
  capturedAt: string;
  width?: number;
  height?: number;
}

/**
 * Workspace-local baseline store. Mirrors the on-disk format used by
 * `screenshotsmcp baseline create` so the CLI and extension share the same
 * `.screenshotsmcp/baselines/<sha1>.json` files.
 */
export class WorkspaceBaselineStore {
  private folder(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }

  private fileFor(url: string): vscode.Uri | undefined {
    const folder = this.folder();
    if (!folder) return undefined;
    const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
    return vscode.Uri.joinPath(folder, BASELINE_DIR, `${hash}.json`);
  }

  async read(url: string): Promise<StoredBaseline | undefined> {
    const file = this.fileFor(url);
    if (!file) return undefined;
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(bytes).toString("utf8");
      const parsed = JSON.parse(text) as StoredBaseline;
      if (parsed && typeof parsed.url === "string" && typeof parsed.imageUrl === "string") {
        return parsed;
      }
    } catch {
      // missing or invalid
    }
    return undefined;
  }

  /**
   * Enumerate every stored baseline by scanning `.screenshotsmcp/baselines/`.
   * Invalid files are silently skipped so a partial write doesn't break the
   * sidebar.
   */
  async list(): Promise<StoredBaseline[]> {
    const folder = this.folder();
    if (!folder) return [];
    const dir = vscode.Uri.joinPath(folder, BASELINE_DIR);
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch {
      return [];
    }
    const out: StoredBaseline[] = [];
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File || !name.endsWith(".json")) continue;
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, name));
        const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as StoredBaseline;
        if (parsed && typeof parsed.url === "string" && typeof parsed.imageUrl === "string") {
          out.push(parsed);
        }
      } catch {
        continue;
      }
    }
    out.sort((a, b) => (b.capturedAt ?? "").localeCompare(a.capturedAt ?? ""));
    return out;
  }

  async write(baseline: StoredBaseline): Promise<vscode.Uri | undefined> {
    const file = this.fileFor(baseline.url);
    if (!file) return undefined;
    const dir = vscode.Uri.joinPath(file, "..");
    await vscode.workspace.fs.createDirectory(dir);
    const payload = JSON.stringify(baseline, null, 2) + "\n";
    await vscode.workspace.fs.writeFile(file, Buffer.from(payload, "utf8"));
    return file;
  }
}
