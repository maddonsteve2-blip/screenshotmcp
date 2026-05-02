"use client";

import { useState } from "react";
import { useCopilotAction, useCopilotReadable, useCopilotChat } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import { EvidencePanel } from "@/components/evidence-panel";
import type { EvidenceItem } from "@/lib/types";

const SYSTEM_PROMPT = `You are DeepSyte Agent, an expert web auditing and browser automation assistant powered by DeepSyte's visual intelligence platform.

You have access to these tools:

BROWSER TOOLS (stateful — use browser_navigate first, then follow up with session tools):
- browser_navigate(url, caption?): Open a browser session. Returns { sessionId, screenshot }.
- browser_screenshot(sessionId, caption?): Take a screenshot in the current session.
- browser_get_text(sessionId): Get visible text content from the page.
- browser_perf_metrics(sessionId): Get Core Web Vitals — LCP, FCP, CLS, TTFB, and resource counts.
- browser_seo_audit(sessionId): Get SEO metadata — title, description, headings, OG tags, canonical.
- browser_close(sessionId): Close the session when done.

STANDALONE TOOLS (stateless):
- take_screenshot(url, fullPage?, width?): Capture a screenshot of any URL. Returns { url, width, height }.
- ux_review(url): AI-powered UX review — accessibility, navigation, content, mobile.
- accessibility_audit(url, width?, height?): WCAG 2.1 AA audit — landmarks, contrast, focus, headings.

WORKFLOW GUIDANCE:
When asked to audit a site, follow this pattern:
1. take_screenshot → see what the page looks like
2. browser_navigate → open a live session
3. browser_perf_metrics → capture LCP, FCP, CLS
4. browser_seo_audit → check title, description, headings
5. accessibility_audit → check WCAG compliance
6. ux_review → optional AI UX analysis
7. browser_close → clean up session
8. Synthesise: present findings with specific, actionable recommendations

Always cite evidence (screenshot URLs, metric values, WCAG criteria) in your summaries.
Be concise and specific — no vague advice like "improve loading speed". Say "LCP is 4.2s; compress hero image and defer render-blocking JS."`;

export default function ChatPage() {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [auditUrl, setAuditUrl] = useState("");
  const { appendMessage } = useCopilotChat();

  const handleQuickAudit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = auditUrl.trim();
    if (!url) return;
    void appendMessage({ id: Date.now().toString(), role: "user", content: `Run a full audit on ${url}` } as any);
    setAuditUrl("");
  };

  useCopilotReadable({
    description: "Evidence collected so far in this audit session",
    value: evidence,
  });

  // --- Tool: take_screenshot ---
  useCopilotAction({
    name: "take_screenshot",
    description:
      "Capture a screenshot of any URL. Returns the public image URL, dimensions.",
    parameters: [
      { name: "url", type: "string", description: "URL to screenshot", required: true },
      {
        name: "fullPage",
        type: "boolean",
        description: "Capture full scrollable page (default false)",
        required: false,
      },
      {
        name: "width",
        type: "number",
        description: "Viewport width in pixels (default 1280)",
        required: false,
      },
    ],
    handler: async ({ url, fullPage, width }) => {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "take_screenshot",
          args: { url, fullPage: fullPage ?? false, width: width ?? 1280 },
        }),
      });
      const result = await res.json();
      if (result?.url) {
        setEvidence((prev) => [
          ...prev,
          { type: "screenshot", url: result.url, caption: url, timestamp: new Date() },
        ]);
      }
      return result;
    },
  });

  // --- Tool: browser_navigate ---
  useCopilotAction({
    name: "browser_navigate",
    description:
      "Open a browser session at a URL. Returns sessionId (required for follow-up calls) and a screenshot.",
    parameters: [
      { name: "url", type: "string", description: "URL to navigate to", required: true },
      {
        name: "caption",
        type: "string",
        description: "Brief note about what you are doing",
        required: false,
      },
    ],
    handler: async ({ url, caption }) => {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "browser_navigate",
          args: { url, caption },
        }),
      });
      const result = await res.json();
      const shotUrl = result?.screenshot?.url ?? result?.screenshotUrl ?? result?.url;
      if (shotUrl) {
        setEvidence((prev) => [
          ...prev,
          {
            type: "screenshot",
            url: shotUrl,
            caption: caption ?? url,
            timestamp: new Date(),
          },
        ]);
      }
      return result;
    },
  });

  // --- Tool: browser_screenshot ---
  useCopilotAction({
    name: "browser_screenshot",
    description: "Take a screenshot of the current browser session.",
    parameters: [
      {
        name: "sessionId",
        type: "string",
        description: "Session ID from browser_navigate",
        required: true,
      },
      {
        name: "caption",
        type: "string",
        description: "Brief note about what you are capturing",
        required: false,
      },
    ],
    handler: async ({ sessionId, caption }) => {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "browser_screenshot",
          args: { sessionId, caption },
        }),
      });
      const result = await res.json();
      const shotUrl = result?.url ?? result?.screenshotUrl;
      if (shotUrl) {
        setEvidence((prev) => [
          ...prev,
          { type: "screenshot", url: shotUrl, caption, timestamp: new Date() },
        ]);
      }
      return result;
    },
  });

  // --- Tool: browser_perf_metrics ---
  useCopilotAction({
    name: "browser_perf_metrics",
    description:
      "Get Core Web Vitals and performance metrics for the current browser session. Returns LCP, FCP, CLS, TTFB, DOM size.",
    parameters: [
      {
        name: "sessionId",
        type: "string",
        description: "Session ID from browser_navigate",
        required: true,
      },
    ],
    handler: async ({ sessionId }) => {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "browser_perf_metrics", args: { sessionId } }),
      });
      const result = await res.json();
      setEvidence((prev) => [
        ...prev,
        { type: "finding", category: "performance", data: result, timestamp: new Date() },
      ]);
      return result;
    },
  });

  // --- Tool: browser_seo_audit ---
  useCopilotAction({
    name: "browser_seo_audit",
    description:
      "Get SEO metadata from the current browser session: title, meta description, headings, Open Graph, canonical URL.",
    parameters: [
      {
        name: "sessionId",
        type: "string",
        description: "Session ID from browser_navigate",
        required: true,
      },
    ],
    handler: async ({ sessionId }) => {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "browser_seo_audit", args: { sessionId } }),
      });
      const result = await res.json();
      setEvidence((prev) => [
        ...prev,
        { type: "finding", category: "seo", data: result, timestamp: new Date() },
      ]);
      return result;
    },
  });

  // --- Tool: browser_get_text ---
  useCopilotAction({
    name: "browser_get_text",
    description: "Extract all visible text content from the current browser session.",
    parameters: [
      {
        name: "sessionId",
        type: "string",
        description: "Session ID from browser_navigate",
        required: true,
      },
    ],
    handler: async ({ sessionId }) => {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "browser_get_text", args: { sessionId } }),
      });
      return res.json();
    },
  });

  // --- Tool: ux_review ---
  useCopilotAction({
    name: "ux_review",
    description:
      "Run an AI-powered UX review on any URL. Returns actionable feedback across accessibility, SEO, performance, navigation, content, and mobile.",
    parameters: [
      { name: "url", type: "string", description: "URL to review", required: true },
    ],
    handler: async ({ url }) => {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "ux_review", args: { url } }),
      });
      const result = await res.json();
      setEvidence((prev) => [
        ...prev,
        { type: "finding", category: "ux", data: result, timestamp: new Date() },
      ]);
      return result;
    },
  });

  // --- Tool: accessibility_audit ---
  useCopilotAction({
    name: "accessibility_audit",
    description:
      "Run a WCAG 2.1 AA accessibility audit. Returns categorized PASS/FAIL results with WCAG criteria references.",
    parameters: [
      { name: "url", type: "string", description: "URL to audit", required: true },
      {
        name: "width",
        type: "number",
        description: "Viewport width in pixels (default 1280)",
        required: false,
      },
      {
        name: "height",
        type: "number",
        description: "Viewport height in pixels (default 800)",
        required: false,
      },
    ],
    handler: async ({ url, width, height }) => {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "accessibility_audit",
          args: { url, width: width ?? 1280, height: height ?? 800 },
        }),
      });
      const result = await res.json();
      setEvidence((prev) => [
        ...prev,
        {
          type: "finding",
          category: "accessibility",
          data: result,
          timestamp: new Date(),
        },
      ]);
      return result;
    },
  });

  // --- Tool: browser_close ---
  useCopilotAction({
    name: "browser_close",
    description: "Close a browser session when done to free resources.",
    parameters: [
      {
        name: "sessionId",
        type: "string",
        description: "Session ID to close",
        required: true,
      },
    ],
    handler: async ({ sessionId }) => {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "browser_close", args: { sessionId } }),
      });
      return res.json();
    },
  });

  return (
    <main id="main-content" className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Left: Evidence Panel — 60% */}
      <div className="flex-[3] min-w-0 overflow-hidden">
        <EvidencePanel items={evidence} />
      </div>

      {/* Right: Agent Chat — 40% */}
      <div className="flex-[2] flex flex-col min-w-0 border-l border-gray-800">
        {/* Header */}
        <header className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 text-white"
              aria-hidden="true"
            >
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path
                fillRule="evenodd"
                d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">DeepSyte Agent</h1>
            <p className="text-xs text-gray-400">
              Powered by MiniMax M2.7 · {evidence.length} evidence items
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs bg-green-500/10 text-green-400 px-2.5 py-1 rounded-full border border-green-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
              Live
            </span>
          </div>
        </header>

        {/* Quick Audit bar */}
        <form onSubmit={handleQuickAudit} className="px-4 py-2.5 border-b border-gray-800 bg-gray-950 flex gap-2 flex-shrink-0">
          <input
            type="text"
            value={auditUrl}
            onChange={(e) => setAuditUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!auditUrl.trim()}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
          >
            Audit
          </button>
        </form>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          <CopilotChat
            instructions={SYSTEM_PROMPT}
            suggestions={[
              { title: "Full site audit", message: "Run a full audit on https://example.com" },
              { title: "Screenshot", message: "Take a screenshot of https://stripe.com" },
              { title: "Performance", message: "Check Core Web Vitals for https://vercel.com" },
              { title: "Accessibility", message: "Run an accessibility audit on https://github.com" },
            ]}
            labels={{
              title: "DeepSyte Agent",
              initial: "Hi! I'm **DeepSyte Agent** — your AI-powered web auditing assistant.\n\nEnter a URL above for a full audit, or use a suggestion below.",
              placeholder: "Ask me to audit a site, take a screenshot, or check performance…",
            }}
            className="h-full"
          />
        </div>
      </div>
    </main>
  );
}
