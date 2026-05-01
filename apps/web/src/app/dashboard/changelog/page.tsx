import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/page-container";

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
      "CLI with setup command — one-liner install for all IDEs (npx deepsyte setup)",
      "Install scripts: install.sh (bash) and install.ps1 (PowerShell)",
      "Session Recording — record browser sessions as .webm video",
      "CAPTCHA Solver — auto-solve Cloudflare Turnstile, reCAPTCHA, hCaptcha",
      "Disposable Email (AgentMail) — create_test_inbox, check_inbox, send_test_email",
      "Visual Diff tool — pixel-level comparison between two URLs with diff overlay image",
      "Batch Screenshots — capture up to 10 URLs in a single call",
      "Cross-Browser — capture in Chromium, Firefox, and WebKit simultaneously",
      "Responsive Breakpoint Detection — auto-detect where your layout shifts",
      "AI UX Review — powered by Kimi k2.5 vision + accessibility + performance data",
      "Playground page — interactive screenshot capture in the dashboard",
      "Analytics dashboard — daily usage charts, top URLs, format + device breakdown",
    ],
  },
  {
    date: "March 2026",
    version: "v1.5",
    tag: "improved",
    items: [
      "38 tools total (up from 33)",
      "Friendlier error messages for DNS failures, SSL errors, connection timeouts",
      "PDF fix — gallery shows 'PDF document' instead of broken image",
      "Mobile/tablet screenshots default to viewport-only",
      "Session browser tools include sessionId in every response",
      "Accessibility tree filtering — SCRIPT, STYLE, SVG nodes excluded",
      "find_login_page — reduced false positives by checking page content",
    ],
  },
  {
    date: "February 2026",
    version: "v1.4",
    tag: "new",
    items: [
      "Smart Login tools — find_login_page + smart_login",
      "accessibility_snapshot standalone tool — no session required",
      "browser_set_viewport — resize viewport mid-session",
      "screenshot_element — delay param + auto-wait for SPA elements",
      "take_screenshot — fullPage toggle + maxHeight cap",
    ],
  },
  {
    date: "January 2026",
    version: "v1.3",
    tag: "new",
    items: [
      "Browser session tools: navigate, click, fill, hover, scroll, press key",
      "Inspection tools: get_text, get_html, get_accessibility_tree, evaluate",
      "Performance tools: perf_metrics, network_requests",
      "SEO audit tool",
      "Debugging tools: console_logs, network_errors, cookies, storage",
      "Responsive screenshots, dark mode screenshots, PDF export",
    ],
  },
  {
    date: "December 2025",
    version: "v1.0",
    tag: "new",
    items: [
      "Initial launch",
      "take_screenshot, screenshot_mobile, screenshot_tablet, screenshot_fullpage",
      "REST API + MCP Server",
      "Cloudflare R2 storage with CDN delivery",
      "API key management + Clerk authentication",
      "Dashboard with screenshot gallery",
    ],
  },
];

const tagColors: Record<Entry["tag"], string> = {
  new: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  improved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  fixed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function DashboardChangelogPage() {
  return (
    <PageContainer width="text">
      <div className="mb-10">
        <h1 className="text-2xl font-bold">Changelog</h1>
        <p className="text-muted-foreground mt-1">Every update, fix, and new feature — in one place.</p>
      </div>

      <div className="space-y-10">
        {changelog.map((entry) => (
          <div key={entry.version} className="flex gap-6">
            <div className="w-28 shrink-0 pt-0.5 text-right">
              <p className="text-sm font-medium">{entry.date}</p>
              <p className="text-xs text-muted-foreground font-mono">{entry.version}</p>
            </div>

            <div className="relative flex flex-col items-center">
              <div className="h-2.5 w-2.5 rounded-full bg-primary mt-1.5 shrink-0 z-10" />
              <div className="flex-1 w-px bg-border mt-1" />
            </div>

            <div className="flex-1 pb-6">
              <Badge className={`mb-3 capitalize ${tagColors[entry.tag]}`} variant="secondary">
                {entry.tag}
              </Badge>
              <ul className="space-y-1.5">
                {entry.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-muted-foreground mt-0.5 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
