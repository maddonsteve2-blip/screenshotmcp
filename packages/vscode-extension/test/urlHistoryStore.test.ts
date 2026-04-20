import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";

// Stub `vscode` module to an empty object before importing the store.
const originalResolve = (Module as unknown as { _resolveFilename: Function })._resolveFilename;
(Module as unknown as { _resolveFilename: Function })._resolveFilename = function (request: string, parent: unknown, ...rest: unknown[]) {
  if (request === "vscode") {
    return require.resolve("./fixtures/vscode-stub.js");
  }
  return originalResolve.call(this, request, parent, ...rest);
};

import { UrlHistoryStore } from "../src/history/store";

function createFakeContext(): unknown {
  const storage: Record<string, unknown> = {};
  return {
    globalState: {
      get<T>(key: string): T | undefined {
        return storage[key] as T | undefined;
      },
      update(key: string, value: unknown): Thenable<void> {
        storage[key] = value;
        return Promise.resolve();
      },
    },
  };
}

test("UrlHistoryStore records newest-first per URL", () => {
  const ctx = createFakeContext();
  const store = new UrlHistoryStore(ctx as never);
  store.record({ kind: "screenshot", url: "https://example.com", occurredAt: "2025-01-01T00:00:00Z", imageUrl: "a.png" });
  store.record({ kind: "audit", url: "https://example.com", occurredAt: "2025-01-02T00:00:00Z" });
  const history = store.get("https://example.com");
  assert.equal(history.length, 2);
  assert.equal(history[0].kind, "audit");
  assert.equal(history[1].kind, "screenshot");
});

test("UrlHistoryStore caps entries per URL at 20", () => {
  const store = new UrlHistoryStore(createFakeContext() as never);
  for (let i = 0; i < 25; i++) {
    store.record({
      kind: "screenshot",
      url: "https://example.com",
      occurredAt: new Date(Date.UTC(2025, 0, 1, 0, i)).toISOString(),
    });
  }
  assert.equal(store.get("https://example.com").length, 20);
});

test("UrlHistoryStore.listUrls sorts by lastSeen descending", () => {
  const store = new UrlHistoryStore(createFakeContext() as never);
  store.record({ kind: "screenshot", url: "https://a.example.com", occurredAt: "2025-01-01T00:00:00Z" });
  store.record({ kind: "screenshot", url: "https://b.example.com", occurredAt: "2025-02-01T00:00:00Z" });
  const list = store.listUrls();
  assert.deepEqual(list.map((u) => u.url), ["https://b.example.com", "https://a.example.com"]);
});

test("UrlHistoryStore.clearForUrl removes a single URL", () => {
  const store = new UrlHistoryStore(createFakeContext() as never);
  store.record({ kind: "screenshot", url: "https://example.com", occurredAt: "2025-01-01T00:00:00Z" });
  store.record({ kind: "screenshot", url: "https://other.example.com", occurredAt: "2025-01-01T00:00:00Z" });
  store.clearForUrl("https://example.com");
  assert.deepEqual(store.get("https://example.com"), []);
  assert.equal(store.get("https://other.example.com").length, 1);
});
