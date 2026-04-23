"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardWs } from "@/lib/use-dashboard-ws";

type RunSummary = { status?: string };

// Tiny 32×32 SVG favicon with a camera glyph + green pulse dot in the corner.
// Rendered as a data URI so we don't need to ship extra static assets.
function buildFaviconDataUri(active: boolean): string {
  const dot = active
    ? `<circle cx="25" cy="7" r="5" fill="#10b981" stroke="#ffffff" stroke-width="1.5"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="6" fill="#0f172a"/>
    <path d="M9 11h3l1.5-2h5L20 11h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" fill="none" stroke="#e2e8f0" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="16" cy="17" r="3.2" fill="none" stroke="#e2e8f0" stroke-width="1.6"/>
    ${dot}
  </svg>`;
  return `data:image/svg+xml;base64,${typeof window !== "undefined" ? window.btoa(svg) : ""}`;
}

function setFavicon(href: string): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>("link#dashboard-live-favicon");
  if (!link) {
    link = document.createElement("link");
    link.id = "dashboard-live-favicon";
    link.rel = "icon";
    link.type = "image/svg+xml";
    document.head.appendChild(link);
  }
  link.href = href;
  return link;
}

/**
 * Reflects active run count into the browser tab:
 *  - title prefix: "(3) " so background tabs signal activity
 *  - favicon dot: green pulse dot in the top-right corner
 *
 * Shares zero state with the sidebar badge — each has its own subscription.
 * That trade-off keeps the dashboard layout a server component (context
 * providers would force a client boundary higher up) at the cost of one
 * extra WebSocket.
 */
export function LiveTabIndicator() {
  const [activeCount, setActiveCount] = useState(0);
  const originalTitleRef = useRef<string | null>(null);
  const originalFaviconRef = useRef<{ href: string | null; existed: boolean } | null>(null);

  useDashboardWs<{ runs: RunSummary[] }>({
    subscription: { channel: "runs" },
    onMessage: (message) => {
      if (message.type !== "runs" || !message.data) return;
      const runs = message.data.runs;
      if (Array.isArray(runs)) {
        setActiveCount(runs.filter((run) => run?.status === "active").length);
      }
    },
  });

  useEffect(() => {
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title.replace(/^\(\d+\)\s+/, "");
    }
    if (originalFaviconRef.current === null) {
      const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]:not(#dashboard-live-favicon)');
      originalFaviconRef.current = existing
        ? { href: existing.href, existed: true }
        : { href: null, existed: false };
    }

    const baseTitle = originalTitleRef.current;
    document.title = activeCount > 0 ? `(${activeCount}) ${baseTitle}` : baseTitle;
    setFavicon(buildFaviconDataUri(activeCount > 0));

    return () => {
      // On unmount (sign out / navigate away from dashboard), restore title
      // and remove our favicon override.
      if (originalTitleRef.current) document.title = originalTitleRef.current;
      const injected = document.querySelector<HTMLLinkElement>("link#dashboard-live-favicon");
      injected?.parentElement?.removeChild(injected);
    };
  }, [activeCount]);

  return null;
}
