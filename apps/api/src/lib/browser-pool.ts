import { chromium, Browser } from "playwright";

const POOL_SIZE = parseInt(process.env.BROWSER_POOL_SIZE || "3", 10);
const MAX_USES_PER_BROWSER = 100;
const LAUNCH_TIMEOUT = 30000;

const BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-blink-features=AutomationControlled",
  "--disable-infobars",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
];

interface PoolEntry {
  browser: Browser;
  uses: number;
  busy: boolean;
  createdAt: number;
}

class BrowserPool {
  private pool: PoolEntry[] = [];
  private queue: Array<(entry: PoolEntry) => void> = [];
  private shuttingDown = false;

  async init(): Promise<void> {
    console.log(`[BrowserPool] Initializing pool with ${POOL_SIZE} browsers...`);
    const launches = Array.from({ length: POOL_SIZE }, () => this.createEntry());
    const entries = await Promise.allSettled(launches);
    for (const result of entries) {
      if (result.status === "fulfilled") {
        this.pool.push(result.value);
      } else {
        console.error("[BrowserPool] Failed to launch browser:", result.reason);
      }
    }
    console.log(`[BrowserPool] Ready: ${this.pool.length}/${POOL_SIZE} browsers`);
  }

  private async createEntry(): Promise<PoolEntry> {
    const browser = await chromium.launch({
      args: BROWSER_ARGS,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      timeout: LAUNCH_TIMEOUT,
    });
    browser.on("disconnected", () => {
      const idx = this.pool.findIndex((e) => e.browser === browser);
      if (idx !== -1) {
        this.pool.splice(idx, 1);
        if (!this.shuttingDown) {
          console.log("[BrowserPool] Browser disconnected, replacing...");
          this.createEntry()
            .then((entry) => {
              this.pool.push(entry);
              this.drainQueue();
            })
            .catch((err) => console.error("[BrowserPool] Failed to replace browser:", err));
        }
      }
    });
    return { browser, uses: 0, busy: false, createdAt: Date.now() };
  }

  async acquire(): Promise<{ browser: Browser; release: () => Promise<void> }> {
    const entry = this.pool.find((e) => !e.busy);
    if (entry) {
      entry.busy = true;
      entry.uses++;
      return { browser: entry.browser, release: () => this.release(entry) };
    }

    // All busy — wait in queue
    return new Promise((resolve) => {
      this.queue.push((entry) => {
        entry.busy = true;
        entry.uses++;
        resolve({ browser: entry.browser, release: () => this.release(entry) });
      });
    });
  }

  private async release(entry: PoolEntry): Promise<void> {
    // Recycle if browser has been used too many times
    if (entry.uses >= MAX_USES_PER_BROWSER) {
      console.log(`[BrowserPool] Recycling browser after ${entry.uses} uses`);
      const idx = this.pool.indexOf(entry);
      if (idx !== -1) this.pool.splice(idx, 1);
      entry.browser.close().catch(() => {});
      try {
        const fresh = await this.createEntry();
        this.pool.push(fresh);
      } catch (err) {
        console.error("[BrowserPool] Failed to recycle browser:", err);
      }
      this.drainQueue();
      return;
    }

    entry.busy = false;
    this.drainQueue();
  }

  private drainQueue(): void {
    while (this.queue.length > 0) {
      const entry = this.pool.find((e) => !e.busy);
      if (!entry) break;
      const next = this.queue.shift()!;
      next(entry);
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    console.log("[BrowserPool] Shutting down...");
    await Promise.allSettled(this.pool.map((e) => e.browser.close()));
    this.pool = [];
  }

  stats() {
    return {
      total: this.pool.length,
      busy: this.pool.filter((e) => e.busy).length,
      idle: this.pool.filter((e) => !e.busy).length,
      queued: this.queue.length,
    };
  }
}

export const browserPool = new BrowserPool();
