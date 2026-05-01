import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, ArrowRight, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNavAuth } from "@/components/marketing-nav-auth";
import { competitors, getCompetitor } from "@/lib/competitors";

export const dynamicParams = false;

export function generateStaticParams() {
  return competitors.map((c) => ({ competitor: c.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ competitor: string }> },
): Promise<Metadata> {
  const { competitor } = await params;
  const c = getCompetitor(competitor);
  if (!c) return { title: "Comparison not found" };
  return {
    title: c.seoTitle,
    description: c.seoDescription,
    alternates: { canonical: `/compare/${c.slug}` },
    openGraph: {
      title: c.seoTitle,
      description: c.seoDescription,
      url: `/compare/${c.slug}`,
      siteName: "ScreenshotsMCP",
      type: "article",
      images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
    },
  };
}

export default async function CompareCompetitorPage(
  { params }: { params: Promise<{ competitor: string }> },
) {
  const { competitor } = await params;
  const c = getCompetitor(competitor);
  if (!c) notFound();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <span className="text-[1.35rem] font-semibold">ScreenshotsMCP</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/docs"><Button variant="ghost">Docs</Button></Link>
            <Link href="/pricing"><Button variant="ghost">Pricing</Button></Link>
            <MarketingNavAuth signUpLabel="Get started free" />
          </div>
        </div>
      </nav>

      <article className="mx-auto max-w-4xl px-6 py-16">
        <header className="mb-12">
          <p className="text-sm text-muted-foreground mb-3">Comparison · updated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long" })}</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            {c.name} vs ScreenshotsMCP
          </h1>
          <p className="mt-4 text-xl text-muted-foreground leading-relaxed">{c.tagline}</p>
        </header>

        <section className="prose prose-lg dark:prose-invert max-w-none mb-12">
          <h2>The short version</h2>
          <p>{c.positioning}</p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Side-by-side</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Feature</th>
                  <th className="px-4 py-3 text-left font-medium">{c.name}</th>
                  <th className="px-4 py-3 text-left font-medium text-primary">ScreenshotsMCP</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {c.matrix.map((row) => (
                  <tr key={row.feature}>
                    <td className="px-4 py-3 font-medium">{row.feature}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.them}</td>
                    <td className="px-4 py-3">{row.us}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Pricing and capability rows reflect each provider&apos;s public docs at time of writing. Found something stale?{" "}
            <a href="mailto:hello@screenshotmcp.com" className="underline">Tell us</a>.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">When ScreenshotsMCP is the better fit</h2>
          <ul className="space-y-3">
            {[
              "You want your AI agent (Cursor, Windsurf, Claude) to take screenshots, click, fill forms, and audit pages from one MCP server.",
              "You need visual regression in CI without building it yourself — drop in a GitHub Action and get sticky PR comments.",
              "You want signed outbound webhooks (HMAC-SHA256, retried) for screenshot.completed, run.completed, and quota.warning.",
              "You want a CLI for terminal-driven captures and audits, not just an SDK.",
              "You need built-in CAPTCHA solving, disposable test inboxes, session video recording, and AI-assisted UX review.",
            ].map((reason) => (
              <li key={reason} className="flex items-start gap-3">
                <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">When {c.name} is the better fit</h2>
          <p className="text-muted-foreground">
            If your workload is dominated by {c.name}&apos;s primary strength ({c.tagline.toLowerCase()}) and you don&apos;t need AI-agent MCP transport, GitHub Action, or signed webhooks — stay with {c.name}. There&apos;s no reason to switch a tool that&apos;s already paying off.
          </p>
        </section>

        <section className="mb-16 rounded-2xl border bg-muted/40 p-8">
          <h2 className="text-2xl font-semibold mb-3">Try ScreenshotsMCP free</h2>
          <p className="text-muted-foreground mb-6">
            100 screenshots per month forever, no card required. Wire it into Cursor, Windsurf, Claude, or any MCP-aware AI client in under a minute.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/sign-up?ref=compare-${c.slug}`}>
              <Button size="lg" className="gap-2">Get started free <ArrowRight className="h-4 w-4" /></Button>
            </Link>
            <Link href="/dashboard/install">
              <Button size="lg" variant="outline">Installation guide</Button>
            </Link>
            <a href={c.url} target="_blank" rel="noopener" className="ml-auto text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Visit {c.name} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </section>

        <section className="border-t pt-8">
          <p className="text-sm text-muted-foreground mb-3">More comparisons</p>
          <div className="flex flex-wrap gap-2">
            {competitors.filter((other) => other.slug !== c.slug).map((other) => (
              <Link
                key={other.slug}
                href={`/compare/${other.slug}`}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-muted/40"
              >
                {other.name} <ArrowRight className="h-3 w-3" />
              </Link>
            ))}
          </div>
        </section>
      </article>
    </div>
  );
}
