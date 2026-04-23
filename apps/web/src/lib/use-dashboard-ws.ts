"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DashboardChannel =
  | "runs"
  | "screenshots"
  | "recordings"
  | "artifacts"
  | "run-live"
  | "webhook-deliveries"
  | "screenshot-live"
  | "events";

type DashboardSubscription = {
  channel: DashboardChannel;
  runId?: string;
  endpointId?: string;
  jobId?: string;
};

type DashboardSocketMessage<TData> = {
  type: string;
  data?: TData;
  channel?: string;
  message?: string;
};

type UseDashboardWsOptions<TData> = {
  enabled?: boolean;
  reconnectDelayMs?: number;
  subscription: DashboardSubscription;
  onMessage: (message: DashboardSocketMessage<TData>) => void;
  onConnectionChange?: (connected: boolean) => void;
};

export function useDashboardWs<TData>({
  enabled = true,
  reconnectDelayMs = 3000,
  subscription,
  onMessage,
  onConnectionChange,
}: UseDashboardWsOptions<TData>) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const closedManuallyRef = useRef(false);
  // Exponential backoff so a dead server doesn't create a reconnect storm
  // (previously it hammered every 3s → "WebSocket is closed before the
  // connection is established" floods in the console).
  const retryCountRef = useRef(0);
  const [connected, setConnected] = useState(false);
  // Hold the latest callbacks in refs so callers can pass inline functions
  // without invalidating the socket on every render. Previously these were
  // deps of `connect`, which caused a reconnect loop whenever a consumer
  // passed an unstable `onMessage` (runaway close-before-open storm).
  const onMessageRef = useRef(onMessage);
  const onConnectionChangeRef = useRef(onConnectionChange);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  const stableSubscription = useMemo(
    () => ({
      channel: subscription.channel,
      runId: subscription.runId,
      endpointId: subscription.endpointId,
      jobId: subscription.jobId,
    }),
    [subscription.channel, subscription.runId, subscription.endpointId, subscription.jobId],
  );

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const closeSocket = useCallback(() => {
    clearReconnectTimer();
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnected(false);
    onConnectionChangeRef.current?.(false);
  }, [clearReconnectTimer]);

  const connect = useCallback(async () => {
    if (!enabled) return;

    try {
      const response = await fetch("/api/dashboard-ws-token", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.wsUrl) {
        throw new Error(data?.error || "Unable to get dashboard socket URL");
      }

      const socket = new WebSocket(data.wsUrl as string);
      socketRef.current = socket;

      socket.onopen = () => {
        retryCountRef.current = 0;
        setConnected(true);
        onConnectionChangeRef.current?.(true);
        socket.send(JSON.stringify({ type: "subscribe", ...stableSubscription }));
      };

      socket.onmessage = (event) => {
        try {
          onMessageRef.current(JSON.parse(event.data) as DashboardSocketMessage<TData>);
        } catch {
          onMessageRef.current({ type: "error", message: "Invalid dashboard socket payload" });
        }
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onclose = () => {
        socketRef.current = null;
        setConnected(false);
        onConnectionChangeRef.current?.(false);

        if (closedManuallyRef.current || !enabled) {
          return;
        }

        clearReconnectTimer();
        const delay = computeBackoffMs(reconnectDelayMs, retryCountRef.current++);
        reconnectTimerRef.current = window.setTimeout(() => {
          void connect();
        }, delay);
      };
    } catch (error) {
      onMessageRef.current({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to connect dashboard socket",
      });

      if (!closedManuallyRef.current && enabled) {
        clearReconnectTimer();
        const delay = computeBackoffMs(reconnectDelayMs, retryCountRef.current++);
        reconnectTimerRef.current = window.setTimeout(() => {
          void connect();
        }, delay);
      }
    }
  }, [clearReconnectTimer, enabled, reconnectDelayMs, stableSubscription]);

  useEffect(() => {
    closedManuallyRef.current = false;
    void connect();

    return () => {
      closedManuallyRef.current = true;
      closeSocket();
    };
  }, [closeSocket, connect]);

  const refresh = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "refresh" }));
    }
  }, []);

  return { connected, refresh, close: closeSocket };
}

// Exponential backoff with jitter, capped at 30s. Keeps noisy reconnects off
// the console when the API is down or the auth token endpoint is rejecting.
function computeBackoffMs(baseMs: number, attempt: number): number {
  const capped = Math.min(attempt, 5);
  const exponential = baseMs * Math.pow(2, capped);
  const jitter = Math.random() * 0.3 * exponential;
  return Math.min(30_000, exponential + jitter);
}
