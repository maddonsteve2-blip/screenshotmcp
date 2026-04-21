import type { Metadata } from "next";
import Link from "next/link";
import { Camera, CheckCircle2, Clock, Hammer, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNavAuth } from "@/components/marketing-nav-auth";

export const metadata: Metadata = {
  title: "Roadmap — ScreenshotsMCP",
  description:
    "Public roadmap for ScreenshotsMCP — what we shipped, what we're building, and what's queued. Email hello@screenshotmcp.com to vote on items.",
  alternates: { canonical: "/roadmap" },
};

type Status = "shipped" | "now" | "next" | "later";
type Item = { title: string; detail: string; status: Status };

const items: Item[] = [
  // Shipped
  { status: "shipped", title: "Outbound webhooks (HMAC-signed, retried)", detail: "screenshot.completed, run.completed, quota.warning, test.ping. REST + MCP + CLI management. April 2026." },
  { status: "shipped", title: "Visual diff REST endpoint + GitHub Action", detail: "POST /v1/screenshot/diff returns before/after/diff URLs. stevejford/action@v1 posts sticky PR comments. April 2026." },
  { status: "shipped", title: "Quota grandfathering + warnings", detail: "100 shots/mo on Free for new users; existing users keep their old cap. quota.warning fires at 80% and 95%. April 2026." },
  { status: "shipped", title: "Workflow-aware run outcomes", detail: "task_type, user_goal, workflow_used, verdict, summary, findings, proof_coverage, next_actions on every audit run." },
  { status: "shipped", title: "Public discovery manifest", detail: "/.well-known/mcp.json so Smithery / Pulse / AI clients can auto-discover the server." },
  { status: "shipped", title: "52+ MCP tools, 44 CLI commands, full skill kit", detail: "screenshot, browser session control, AI-assisted UX/SEO/perf review, CAPTCHA, test inboxes." },

  // Now
  { status: "now", title: "Stripe billing live", detail: "Awaiting Stripe approval. Once live, in-app upgrade from Free → Starter ($9 / 2k) → Pro ($29 / 10k)." },
  { status: "now", title: "Activation funnel + lifecycle email", detail: "PostHog-compatible activation_events table is live. Wiring PostHog + Resend day-0/day-3/day-7 sequence." },

  // Next
  { status: "next", title: "Team / org primitives in dashboard", detail: "Invite teammates, shared API keys, per-seat billing. X-Organization-ID header is already supported on the API." },
  { status: "next", title: "Listed on Smithery, Pulse, official MCP server registry", detail: "Discovery manifest is in place; PRs to each registry are next." },
  { status: "next", title: "Programmatic SEO expansion", detail: "/compare/* is live for 8 competitors. Next: /how-to-screenshot/{framework} and /open-graph-preview/{tool}." },
  { status: "next", title: "Affiliate program (30% lifetime)", detail: "Powered by Stripe Connect. Devs-on-Twitter writing posts for us." },

  // Later
  { status: "later", title: "Self-hosted edition", detail: "Single-binary deploy with bring-your-own R2 / S3 / browser pool, for regulated industries." },
  { status: "later", title: "Async batch export (CSV / Parquet)", detail: "Bulk capture of 10k+ URLs with downloadable manifests for analytics teams." },
  { status: "later", title: "Built-in scheduled visual regression", detail: "Daily diff your production URLs against baselines, alert on drift via webhooks." },
  { status: "later", title: "MCP tool marketplace", detail: "Third-party MCP tool authors plug into ScreenshotsMCP for distribution + billing." },
];

const sections: Array<{ status: Status; label: string; Icon: typeof CheckCircle2; tone: string }> = [
  { status: "shipped", label: "Shipped", Icon: CheckCircle2, tone: "text-emerald-500" },
  { status: "now", label: "Now", Icon: Hammer, tone: "text-blue-500" },
  { status: "next", label: "Next", Icon: Clock, tone: "text-amber-500" },
  { status: "later", label: "Later", Icon: Lightbulb, tone: "text-purple-500" },
];

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <span className="text-[1.35rem] font-semibold">ScreenshotsMCP</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/changelog"><Button variant="ghost">Changelog</Button></Link>
            <Link href="/docs"><Button variant="ghost">Docs</Button></Link>
            <MarketingNavAuth />
          </div>
        </div>
      </nav>

      <article className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Public roadmap</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            What we shipped, what we&apos;re building right now, what&apos;s next, and what we&apos;re thinking about for later. Vote on items by emailing{" "}
            <a href="mailto:hello@screenshotmcp.com?subject=Roadmap%20vote" className="text-primary underline">hello@screenshotmcp.com</a>{" "}
            with the title — we ship the most-requested ones first.
          </p>
        </header>

        {sections.map(({ status, label, Icon, tone }) => {
          const filtered = items.filter((i) => i.status === status);
          if (filtered.length === 0) return null;
          return (
            <section key={status} className="mb-12">
              <div className="flex items-center gap-2 mb-5">
                <Icon className={`h-5 w-5 ${tone}`} />
                <h2 className="text-2xl font-semibold">{label}</h2>
                <span className="text-sm text-muted-foreground">({filtered.length})</span>
              </div>
              <ul className="space-y-4">
                {filtered.map((item) => (
                  <li key={item.title} className="rounded-xl border p-5">
                    <h3 className="font-medium">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section className="mt-16 rounded-2xl border bg-muted/40 p-6 text-sm text-muted-foreground">
          <p>
            Missing something you&apos;d pay for? Email{" "}
            <a href="mailto:hello@screenshotmcp.com?subject=Feature%20request" className="text-primary underline">
              hello@screenshotmcp.com
            </a>{" "}
            with the use case — we read every message and quote a delivery date for paid feature requests.
          </p>
        </section>
      </article>
    </div>
  );
}
