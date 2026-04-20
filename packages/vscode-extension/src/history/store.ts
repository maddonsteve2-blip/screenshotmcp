import * as vscode from "vscode";

const STORAGE_KEY = "screenshotsmcp.urlHistory.v1";
const MAX_ENTRIES_PER_URL = 20;
const MAX_URLS = 200;

export type HistoryKind = "screenshot" | "audit";

export interface HistoryEntry {
  kind: HistoryKind;
  url: string;
  /** ISO timestamp. */
  occurredAt: string;
  /** Public screenshot URL (or the audit hero image) if available. */
  imageUrl?: string;
  /** Dashboard run deep link if the backend returned one. */
  runUrl?: string;
}

interface SerializedHistory {
  byUrl: Record<string, HistoryEntry[]>;
}

/**
 * Persistent, workspace-global store of screenshot and audit runs grouped by URL.
 * Backed by `context.globalState`, so history follows the user across workspaces.
 */
export class UrlHistoryStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  record(entry: HistoryEntry): void {
    const data = this.load();
    const list = data.byUrl[entry.url] ?? [];
    list.unshift(entry);
    if (list.length > MAX_ENTRIES_PER_URL) {
      list.length = MAX_ENTRIES_PER_URL;
    }
    data.byUrl[entry.url] = list;
    this.enforceUrlCap(data);
    void this.context.globalState.update(STORAGE_KEY, data);
  }

  /** Returns newest-first history for a URL, or an empty array. */
  get(url: string): HistoryEntry[] {
    return this.load().byUrl[url] ?? [];
  }

  /** Returns the list of all URLs seen, newest event first. */
  listUrls(): Array<{ url: string; lastSeen: string; count: number }> {
    const data = this.load();
    return Object.entries(data.byUrl)
      .map(([url, entries]) => ({
        url,
        lastSeen: entries[0]?.occurredAt ?? new Date(0).toISOString(),
        count: entries.length,
      }))
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }

  clear(): void {
    void this.context.globalState.update(STORAGE_KEY, { byUrl: {} });
  }

  clearForUrl(url: string): void {
    const data = this.load();
    delete data.byUrl[url];
    void this.context.globalState.update(STORAGE_KEY, data);
  }

  private load(): SerializedHistory {
    const raw = this.context.globalState.get<SerializedHistory>(STORAGE_KEY);
    if (raw && typeof raw === "object" && raw.byUrl) {
      return raw;
    }
    return { byUrl: {} };
  }

  private enforceUrlCap(data: SerializedHistory): void {
    const urls = Object.keys(data.byUrl);
    if (urls.length <= MAX_URLS) {
      return;
    }
    // Drop the URLs whose most recent entry is oldest until we're under the cap.
    const sorted = urls
      .map((url) => ({ url, lastSeen: data.byUrl[url][0]?.occurredAt ?? "" }))
      .sort((a, b) => a.lastSeen.localeCompare(b.lastSeen));
    for (const entry of sorted) {
      if (Object.keys(data.byUrl).length <= MAX_URLS) {
        break;
      }
      delete data.byUrl[entry.url];
    }
  }
}
