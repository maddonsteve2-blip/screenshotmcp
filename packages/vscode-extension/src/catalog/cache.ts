import * as vscode from "vscode";
import {
  fetchRemoteCatalog,
  SKILL_CATALOG,
  type CatalogSkill,
  type CatalogStorage,
} from "@screenshotsmcp/types/skills";
import { logLine } from "../output";

/**
 * In-memory + globalState-backed cache for the hosted skill catalog.
 *
 * - `get()` returns the best catalog available immediately (cached remote, or
 *   the in-code fallback) without blocking the UI.
 * - `refresh()` fetches the hosted catalog in the background and updates the
 *   in-memory copy when it succeeds.
 */
export class CatalogCache {
  private current: CatalogSkill[] = SKILL_CATALOG;
  private readonly storage: CatalogStorage;
  private readonly listeners = new Set<(catalog: CatalogSkill[]) => void>();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.storage = {
      get: (key: string) => context.globalState.get<string>(key),
      set: (key: string, value: string) => context.globalState.update(key, value),
    };
  }

  get(): CatalogSkill[] {
    return this.current;
  }

  onChange(listener: (catalog: CatalogSkill[]) => void): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /** Fires fetch-and-cache in the background. Errors fall back to SKILL_CATALOG. */
  async refresh(options: { force?: boolean } = {}): Promise<void> {
    try {
      const next = await fetchRemoteCatalog({ storage: this.storage, force: options.force });
      if (!catalogsEqual(this.current, next)) {
        this.current = next;
        for (const listener of this.listeners) {
          listener(this.current);
        }
      }
    } catch (err) {
      logLine(`Catalog refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function catalogsEqual(a: CatalogSkill[], b: CatalogSkill[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.name !== right.name
      || left.version !== right.version
      || left.contentUrl !== right.contentUrl
      || left.displayName !== right.displayName
      || left.description !== right.description
    ) {
      return false;
    }
  }
  return true;
}
