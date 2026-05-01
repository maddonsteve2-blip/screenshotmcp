import Link from "next/link";
import { Eye } from "lucide-react";

type Entry = {
  date: string;
  version: string;
  tag: "new" | "improved" | "fixed";
  items: string[];
};

const changelog: Entry[] = [
  {
    date: "April 2026",
    version: "v2.0",
    tag: "new",
    items: [
      "Visual Diff tool — pixel-level comparison between two URLs with diff overlay image",
      "Batch Screenshots — capture up to 10 URLs in a single call",
      "Cross-Browser tool — capture in Chromium, Firefox, and WebKit simultaneously",
      "Responsive Breakpoint Detection — auto-detect where your layout shifts",
      "AI UX Review — powered by Kimi k2.5 vision + accessibility + performance data",
      "Playground page — interactive screenshot capture in the dashboard",
      "Analytics dashboard — daily usage charts, top URLs, format + device breakdown",
      "Changelog page",
    ],
  },
  {
    date: "March 2026",
    version: "v1.5",
    tag: "improved",
    items: [
      "38 tools total (up from 33) — see above for new additions",
      "Friendlier error messages for DNS failures, SSL errors, connection timeouts",
      "PDF fix — gallery now shows 'PDF document' instead of broken image or garbage dimensions",
      "Mobile/tablet screenshots now default to viewport-only (no unwanted long-page captures)",
      "Session browser tools now include sessionId in every response",
      "Accessibility tree filtering — SCRIPT, STYLE, SVG nodes excluded from output",
      "SEO audit JSON-LD structured data now fully displayed without truncation",
      "Network requests now show '0KB' correctly instead of '?'",
      "LCP timing note added to perf metrics when value is unavailable",
      "find_login_page — reduced false positives by checking page content for real login forms",
    ],
  },
  {
    date: "February 2026",
    version: "v1.4",
    tag: "new",
    items: [
      "Smart Login tools — find_login_page + smart_login with auto form detection",
      "accessibility_snapshot standalone tool — no session required",
      "browser_set_viewport — resize viewport mid-session",
      "browser_navigate now accepts width/height for custom viewport",
      "screenshot_element now supports delay param + auto-waits for SPA elements",
      "take_screenshot fullPage toggle + maxHeight cap",
      "screenshot_fullpage maxHeight cap",
    ],
  },
  {
    date: "January 2026",
    version: "v1.3",
    tag: "new",
    items: [
      "Browser session tools: navigate, click, fill, hover, scroll, press key, go back/forward",
      "Inspection tools: get_text, get_html, get_accessibility_tree, evaluate",
      "Performance tools: perf_metrics, network_requests",
      "SEO audit tool",
      "Debugging tools: console_logs, network_errors, cookies, storage",
      "Responsive screenshots (desktop + tablet + mobile in one call)",
      "Dark mode screenshots",
      "PDF export",
    ],
  },
  {
    date: "December 2025",
    version: "v1.0",
    tag: "new",
    items: [
      "Initial launch",
      "take_screenshot — async screenshot with BullMQ queue",
      "screenshot_mobile, screenshot_tablet, screenshot_fullpage",
      "REST API + MCP Server",
      "Cloudflare R2 storage with CDN delivery",
      "API key management",
      "Clerk authentication",
      "Dashboard with screenshot gallery",
    ],
  },
];

const tagColors: Record<Entry["tag"], string> = {
  new: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  improved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  fixed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="mx-auto max-w-4xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-[1.2rem] font-semibold">
            <Eye className="h-5 w-5 text-primary" />
            DeepSyte
          </Link>
          <div className="flex gap-4 text-[1.02rem] text-muted-foreground sm:text-lg">
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-12">
          <h1 className="mb-3 text-4xl font-bold sm:text-5xl">Changelog</h1>
          <p className="text-[1.08rem] leading-relaxed text-muted-foreground sm:text-[1.25rem]">Every update, fix, and new feature — in one place.</p>
        </div>

        <div className="space-y-12">
          {changelog.map((entry) => (
            <div key={entry.version} className="flex gap-8">
              {/* Date column */}
              <div className="w-36 shrink-0 pt-1 text-right">
                <p className="text-base font-medium">{entry.date}</p>
                <p className="font-mono text-sm text-muted-foreground">{entry.version}</p>
              </div>

              {/* Timeline dot */}
              <div className="relative flex flex-col items-center">
                <div className="h-3 w-3 rounded-full bg-primary mt-1.5 shrink-0 z-10" />
                <div className="flex-1 w-px bg-border mt-1" />
              </div>

              {/* Content */}
              <div className="flex-1 pb-8">
                <span className={`mb-3 inline-flex items-center rounded-full px-3 py-1 text-sm font-medium capitalize ${tagColors[entry.tag]}`}>
                  {entry.tag}
                </span>
                <ul className="space-y-2">
                  {entry.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-[1.02rem] leading-relaxed sm:text-lg">
                      <span className="text-muted-foreground mt-1 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t py-8 mt-16">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 text-base text-muted-foreground">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span>© 2026 DeepSyte</span>
          </div>
          <div className="flex gap-4">
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <Link href="/#pricing" className="hover:text-foreground">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
