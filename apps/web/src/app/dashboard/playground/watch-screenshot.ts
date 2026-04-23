"use client";

export type ScreenshotLiveData = {
  jobId: string;
  found: boolean;
  id?: string;
  url?: string;
  status?: "queued" | "processing" | "done" | "failed" | string;
  publicUrl?: string | null;
  width?: number | null;
  height?: number | null;
  format?: string | null;
  errorMessage?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
};

export type ScreenshotLiveResult =
  | { publicUrl: string; width: number; height: number; format: string; elapsed: string }
  | { error: string };

type WatchOptions = {
  width: number;
  height: number;
  format: string;
  /** Total timeout in ms before rejecting with a timed-out error. */
  timeoutMs?: number;
};

/**
 * Open a dedicated WebSocket for a single screenshot job and resolve when the
 * server reports `done` or `failed`. Each call opens its own socket so batch
 * captures can run concurrently. No polling — the server pushes the terminal
 * state via the `screenshot-live` channel.
 */
export async function watchScreenshot(
  jobId: string,
  options: WatchOptions,
): Promise<ScreenshotLiveResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  let wsUrl: string;
  try {
    const res = await fetch("/api/dashboard-ws-token", { cache: "no-store" });
    const tokenData = await res.json();
    if (!res.ok || !tokenData?.wsUrl) {
      return { error: tokenData?.error || "Unable to open screenshot live socket" };
    }
    wsUrl = tokenData.wsUrl as string;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Socket token fetch failed" };
  }

  return new Promise<ScreenshotLiveResult>((resolve) => {
    let settled = false;
    const settle = (result: ScreenshotLiveResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const socket = new WebSocket(wsUrl);
    const timer = window.setTimeout(
      () => settle({ error: `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for screenshot` }),
      timeoutMs,
    );

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "subscribe", channel: "screenshot-live", jobId }));
    };

    socket.onmessage = (event) => {
      let parsed: { type?: string; data?: ScreenshotLiveData; message?: string };
      try {
        parsed = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (parsed.type === "error" && parsed.message) {
        settle({ error: parsed.message });
        return;
      }

      if (parsed.type !== "screenshot-live" || !parsed.data) return;
      const data = parsed.data;
      if (data.jobId !== jobId) return;

      if (data.status === "done" && data.publicUrl) {
        const elapsedSec = Math.max(0, (Date.now() - startedAt) / 1000);
        settle({
          publicUrl: data.publicUrl,
          width: data.width ?? options.width,
          height: data.height ?? options.height,
          format: data.format ?? options.format,
          elapsed: `${elapsedSec.toFixed(1)}s`,
        });
        return;
      }

      if (data.status === "failed") {
        settle({ error: data.errorMessage || "Screenshot failed" });
        return;
      }
    };

    socket.onerror = () => {
      settle({ error: "Screenshot socket error" });
    };

    socket.onclose = () => {
      if (!settled) {
        // Server closed without a terminal message — surface as error.
        settle({ error: "Screenshot socket closed before result arrived" });
      }
    };
  });
}
