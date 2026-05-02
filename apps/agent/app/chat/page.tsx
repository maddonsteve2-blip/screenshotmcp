"use client";

import { useState } from "react";
import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import { EvidencePanel } from "@/components/evidence-panel";
import type { EvidenceItem, ActivityItem } from "@/lib/types";

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

CRITICAL OUTPUT RULES — FOLLOW EXACTLY:
1. After calling ANY tool, output ZERO text. Nothing. No confirmation, no description, no "I've done X". Complete silence.
2. The evidence panel on the left ALREADY shows the result to the user. You narrating it is noise.
3. NEVER say: "I'll use...", "I'm going to...", "Let me...", "The screenshot shows...", "I've captured...", "Here are the results..."
4. Only produce text output when a user explicitly asks for analysis/recommendations AFTER results are shown.
5. For analysis responses: max 5 bullet points, specific metrics only ("LCP 4.2s" not "slow loading").
6. When a message says 'call take_screenshot', use ONLY take_screenshot — do NOT use browser_navigate."
When a message says 'call accessibility_audit', use ONLY accessibility_audit.
When a message says 'call browser_perf_metrics', navigate first then call browser_perf_metrics then browser_close.`;

function ToolStatus({ status, label }: { status: string; label: string }) {
  if (status === "complete") return null;
  return (
    <div className="flex items-center gap-1.5 text-xs py-0.5 text-gray-300">
      <span className="inline-flex w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
      {label}
    </div>
  );
}

export default function ChatPage() {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [auditUrl, setAuditUrl] = useState("");
  const [lockedUrl, setLockedUrl] = useState("");
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const startActivity = (id: string, tool: string, label: string) =>
    setActivity((prev) => [...prev, { id, tool, label, status: "running", timestamp: new Date() }]);
  const endActivity = (id: string, s: "done" | "error") =>
    setActivity((prev) => prev.map((a) => (a.id === id ? { ...a, status: s } : a)));

  const handleQuickAudit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = auditUrl.trim();
    if (!url) return;
    setLockedUrl(url);
    setAuditUrl("");
  };

  useCopilotReadable({
    description: "Evidence collected so far in this audit session",
    value: evidence,
  });

  useCopilotReadable({
    description: "URL locked in for auditing — use this URL for all tools unless the user specifies otherwise",
    value: lockedUrl || "none",
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
    render: (props: any) => (
      <ToolStatus status={props.status} label={`Screenshot: ${props.args?.url ?? "..."}`} />
    ),
    handler: async ({ url, fullPage, width }) => {
      const id = `ss-${Date.now()}`;
      startActivity(id, "take_screenshot", `Screenshot: ${url}`);
      try {
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
        endActivity(id, "done");
        return result;
      } catch (e) {
        endActivity(id, "error");
        throw e;
      }
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
    render: (props: any) => (
      <ToolStatus status={props.status} label={`Browser: ${props.args?.url ?? "..."}`} />
    ),
    handler: async ({ url, caption }) => {
      const id = `nav-${Date.now()}`;
      startActivity(id, "browser_navigate", `Opening: ${url}`);
      try {
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
        endActivity(id, "done");
        return result;
      } catch (e) {
        endActivity(id, "error");
        throw e;
      }
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
    render: (props: any) => (
      <ToolStatus status={props.status} label={props.status === "complete" ? "Screenshot captured" : "Capturing screenshot..."} />
    ),
    handler: async ({ sessionId, caption }) => {
      const id = `bss-${Date.now()}`;
      startActivity(id, "browser_screenshot", "Capturing screenshot");
      try {
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
        endActivity(id, "done");
        return result;
      } catch (e) {
        endActivity(id, "error");
        throw e;
      }
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
    render: (props: any) => (
      <ToolStatus status={props.status} label={props.status === "complete" ? "Performance metrics captured" : "Measuring Core Web Vitals..."} />
    ),
    handler: async ({ sessionId }) => {
      const id = `perf-${Date.now()}`;
      startActivity(id, "browser_perf_metrics", "Measuring Core Web Vitals");
      try {
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
        endActivity(id, "done");
        return result;
      } catch (e) {
        endActivity(id, "error");
        throw e;
      }
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
    render: (props: any) => (
      <ToolStatus status={props.status} label={props.status === "complete" ? "SEO audit complete" : "Running SEO audit..."} />
    ),
    handler: async ({ sessionId }) => {
      const id = `seo-${Date.now()}`;
      startActivity(id, "browser_seo_audit", "Running SEO audit");
      try {
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
        endActivity(id, "done");
        return result;
      } catch (e) {
        endActivity(id, "error");
        throw e;
      }
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
    render: (props: any) => (
      <ToolStatus status={props.status} label={props.status === "complete" ? "Page text extracted" : "Reading page text..."} />
    ),
    handler: async ({ sessionId }) => {
      const id = `text-${Date.now()}`;
      startActivity(id, "browser_get_text", "Reading page text");
      try {
        const res = await fetch("/api/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "browser_get_text", args: { sessionId } }),
        });
        const result = await res.json();
        endActivity(id, "done");
        return result;
      } catch (e) {
        endActivity(id, "error");
        throw e;
      }
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
    render: (props: any) => (
      <ToolStatus status={props.status} label={`UX review: ${props.args?.url ?? "..."}`} />
    ),
    handler: async ({ url }) => {
      const id = `ux-${Date.now()}`;
      startActivity(id, "ux_review", `UX review: ${url}`);
      try {
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
        endActivity(id, "done");
        return result;
      } catch (e) {
        endActivity(id, "error");
        throw e;
      }
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
    render: (props: any) => (
      <ToolStatus status={props.status} label={`Accessibility audit: ${props.args?.url ?? "..."}`} />
    ),
    handler: async ({ url, width, height }) => {
      const id = `a11y-${Date.now()}`;
      startActivity(id, "accessibility_audit", `Accessibility audit: ${url}`);
      try {
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
        endActivity(id, "done");
        return result;
      } catch (e) {
        endActivity(id, "error");
        throw e;
      }
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
    render: (props: any) => (
      <ToolStatus status={props.status} label={props.status === "complete" ? "Browser session closed" : "Closing browser..."} />
    ),
    handler: async ({ sessionId }) => {
      const id = `close-${Date.now()}`;
      startActivity(id, "browser_close", "Closing browser session");
      try {
        const res = await fetch("/api/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "browser_close", args: { sessionId } }),
        });
        const result = await res.json();
        endActivity(id, "done");
        return result;
      } catch (e) {
        endActivity(id, "error");
        throw e;
      }
    },
  });

  return (
    <main id="main-content" className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Left: Evidence Panel — 60% */}
      <div className="flex-[3] min-w-0 overflow-hidden">
        <EvidencePanel items={evidence} activity={activity} lockedUrl={lockedUrl} />
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

        {/* URL bar — lock a target URL for the agent */}
        <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-950 flex gap-2 flex-shrink-0">
          {lockedUrl ? (
            <>
              <div className="flex-1 flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1.5 min-w-0">
                <span className="text-xs text-blue-400">&#x1F512;</span>
                <span className="text-sm text-blue-300 truncate">{lockedUrl}</span>
              </div>
              <button
                onClick={() => setLockedUrl("")}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
              >
                Clear
              </button>
            </>
          ) : (
            <form onSubmit={handleQuickAudit} className="flex gap-2 flex-1">
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
          )}
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          <CopilotChat
            instructions={SYSTEM_PROMPT}
            suggestions={[
              {
                title: "Full site audit",
                message: lockedUrl
                  ? `Full audit: call take_screenshot, then browser_navigate, then browser_perf_metrics, then browser_seo_audit, then accessibility_audit on ${lockedUrl}. Output no text between tools.`
                  : `Full audit: call take_screenshot, then browser_navigate, then browser_perf_metrics, then browser_seo_audit, then accessibility_audit on https://example.com. Output no text between tools.`,
              },
              {
                title: "Screenshot",
                message: lockedUrl
                  ? `Call take_screenshot with url="${lockedUrl}". Output no text after.`
                  : `Call take_screenshot with url="https://stripe.com". Output no text after.`,
              },
              {
                title: "Performance",
                message: lockedUrl
                  ? `Call browser_navigate on ${lockedUrl}, then call browser_perf_metrics, then browser_close. Output no text between tools.`
                  : `Call browser_navigate on https://vercel.com, then call browser_perf_metrics, then browser_close. Output no text between tools.`,
              },
              {
                title: "Accessibility",
                message: lockedUrl
                  ? `Call accessibility_audit with url="${lockedUrl}". Output no text after.`
                  : `Call accessibility_audit with url="https://github.com". Output no text after.`,
              },
            ]}
            labels={{
              title: "DeepSyte Agent",
              initial: lockedUrl
                ? `Hi! I'm **DeepSyte Agent**. I'm ready to audit **${lockedUrl}** — use a quick action below or ask me anything.`
                : "Hi! I'm **DeepSyte Agent** — your AI-powered web auditing assistant.\n\nEnter a URL above to lock it in, then use the quick actions below.",
              placeholder: lockedUrl
                ? `Ask about ${lockedUrl}…`
                : "Enter a URL above, then ask me to audit it…",
            }}
            className="h-full"
          />
        </div>
      </div>
    </main>
  );
}
