"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";
import { useDashboardWs } from "@/lib/use-dashboard-ws";

type RawDashboardEvent = {
  type: string;
  userId?: string;
  runId?: string;
  payload?: Record<string, unknown>;
  emittedAt?: string;
};

function truncate(value: string | undefined | null, max = 80): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Global toast consumer for dashboard lifecycle events.
 *
 * Mounted once in the dashboard layout, subscribes to the `events` firehose
 * and surfaces meaningful transitions as toast notifications so users see
 * run/screenshot/webhook outcomes from any page without polling.
 *
 * Kept conservative: only failures + completions fire toasts. Updates,
 * intermediate screenshots, and recording.created are silent so the UI
 * doesn't spam during normal activity.
 */
export function LiveEventToaster() {
  const router = useRouter();
  // Dedupe — sonner handles rapid identical toasts, but if the server
  // re-emits (e.g. retry) we want to avoid stacking.
  const recentRef = useRef<Map<string, number>>(new Map());

  useDashboardWs<unknown>({
    subscription: { channel: "events" },
    onMessage: (message) => {
      if (message.type !== "event") return;
      const event = (message as unknown as { event?: RawDashboardEvent }).event;
      if (!event || typeof event.type !== "string") return;

      // Coalesce duplicates within a 3s window keyed by event type + runId.
      const key = `${event.type}:${event.runId ?? ""}:${
        (event.payload as { screenshotId?: string; deliveryId?: string } | undefined)?.screenshotId ??
        (event.payload as { deliveryId?: string } | undefined)?.deliveryId ??
        ""
      }`;
      const now = Date.now();
      const last = recentRef.current.get(key);
      if (last && now - last < 3000) return;
      recentRef.current.set(key, now);
      if (recentRef.current.size > 100) {
        // Trim old entries to avoid unbounded growth.
        for (const [k, t] of recentRef.current) {
          if (now - t > 30000) recentRef.current.delete(k);
        }
      }

      const runId = event.runId;
      const payload = (event.payload ?? {}) as Record<string, unknown>;

      switch (event.type) {
        case "run.completed": {
          const verdict = typeof payload.verdict === "string" ? payload.verdict : undefined;
          const status = typeof payload.status === "string" ? payload.status : undefined;
          const failed = status === "failed" || verdict === "failed";
          const title = failed ? "Run failed" : "Run completed";
          (failed ? toast.error : toast.success)(title, {
            description: runId ? `Run ${truncate(runId, 20)}` : undefined,
            action: runId
              ? {
                  label: "Open",
                  onClick: () => router.push(`/dashboard/runs/${encodeURIComponent(runId)}`),
                }
              : undefined,
          });
          return;
        }

        case "screenshot.failed": {
          const url = typeof payload.url === "string" ? payload.url : undefined;
          const errorMessage = typeof payload.errorMessage === "string" ? payload.errorMessage : undefined;
          toast.error("Screenshot failed", {
            description: truncate(errorMessage ?? url ?? "Check job for details", 120),
          });
          return;
        }

        case "webhook.delivery.updated": {
          const status = typeof payload.status === "string" ? payload.status : undefined;
          if (status !== "failed" && status !== "exhausted") return;
          const eventType = typeof payload.eventType === "string" ? payload.eventType : "event";
          const attempt = typeof payload.attempt === "number" ? payload.attempt : undefined;
          const exhausted = status === "exhausted";
          toast.error(exhausted ? "Webhook delivery exhausted" : "Webhook delivery failed", {
            description: `${eventType}${attempt ? ` · attempt ${attempt}` : ""}`,
            action: {
              label: "View",
              onClick: () => router.push("/dashboard/webhooks"),
            },
          });
          return;
        }

        default:
          return;
      }
    },
  });

  return null;
}
