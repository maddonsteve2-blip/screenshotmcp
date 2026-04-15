"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type DashboardChannel = "screenshots" | "recordings" | "artifacts" | "run-live";

type DashboardSubscription = {
  channel: DashboardChannel;
  runId?: string;
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
  const [connected, setConnected] = useState(false);

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
    onConnectionChange?.(false);
  }, [clearReconnectTimer, onConnectionChange]);

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
        setConnected(true);
        onConnectionChange?.(true);
        socket.send(JSON.stringify({ type: "subscribe", ...subscription }));
      };

      socket.onmessage = (event) => {
        try {
          onMessage(JSON.parse(event.data) as DashboardSocketMessage<TData>);
        } catch {
          onMessage({ type: "error", message: "Invalid dashboard socket payload" });
        }
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onclose = () => {
        socketRef.current = null;
        setConnected(false);
        onConnectionChange?.(false);

        if (closedManuallyRef.current || !enabled) {
          return;
        }

        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
          void connect();
        }, reconnectDelayMs);
      };
    } catch (error) {
      onMessage({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to connect dashboard socket",
      });

      if (!closedManuallyRef.current && enabled) {
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
          void connect();
        }, reconnectDelayMs);
      }
    }
  }, [clearReconnectTimer, enabled, onConnectionChange, onMessage, reconnectDelayMs, subscription.channel, subscription.runId]);

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
