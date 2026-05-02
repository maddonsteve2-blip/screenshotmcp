"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://deepsyte-api-production.up.railway.app";

function buildWsUrl(shareToken: string): string {
  const base = API_URL.replace(/^https?:\/\//, (match) => (match === "https://" ? "wss://" : "ws://"));
  return `${base}/ws/dashboard?shareToken=${encodeURIComponent(shareToken)}`;
}

/**
 * Read-only live refresh for the shared run page.
 *
 * Opens a WebSocket authenticated by the run's shareToken and listens for
 * lightweight `{type: "refresh"}` pings. Each ping triggers `router.refresh()`
 * so the server-rendered shared page re-fetches its data — the viewer sees
 * verdict, findings, captures, and replays appear as the owner edits,
 * without any polling.
 *
 * Renders nothing visible except a small "Live" / "Offline" pulse badge.
 */
export function SharedRunLiveRefresh({ shareToken }: { shareToken: string }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const closedManuallyRef = useRef(false);
  // Coalesce bursts of pings into a single refresh.
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    closedManuallyRef.current = false;

    const scheduleRefresh = () => {
      if (refreshTimerRef.current !== null) return;
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, 500);
    };

    const connect = () => {
      try {
        const ws = new WebSocket(buildWsUrl(shareToken));
        socketRef.current = ws;

        ws.onopen = () => setConnected(true);

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as { type?: string };
            if (message.type === "refresh") scheduleRefresh();
          } catch {
            /* ignore malformed frames */
          }
        };

        ws.onerror = () => ws.close();

        ws.onclose = () => {
          socketRef.current = null;
          setConnected(false);
          if (closedManuallyRef.current) return;
          if (reconnectRef.current !== null) return;
          reconnectRef.current = window.setTimeout(() => {
            reconnectRef.current = null;
            connect();
          }, 3000);
        };
      } catch {
        if (!closedManuallyRef.current && reconnectRef.current === null) {
          reconnectRef.current = window.setTimeout(() => {
            reconnectRef.current = null;
            connect();
          }, 3000);
        }
      }
    };

    connect();

    return () => {
      closedManuallyRef.current = true;
      if (reconnectRef.current !== null) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [router, shareToken]);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"
      title={connected ? "Live — this page updates as the owner edits" : "Reconnecting…"}
    >
      <span className="relative flex h-1.5 w-1.5">
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        )}
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
            connected ? "bg-emerald-500" : "bg-muted-foreground/60"
          }`}
        />
      </span>
      {connected ? "Live" : "Offline"}
    </span>
  );
}
