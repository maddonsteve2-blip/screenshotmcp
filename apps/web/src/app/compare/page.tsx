import type { Metadata } from "next";
import Link from "next/link";
import { Eye, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNavAuth } from "@/components/marketing-nav-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { competitors } from "@/lib/competitors";

export const metadata: Metadata = {
  title: "DeepSyte comparisons — vs Browserbase, Browserless, ScreenshotOne, and more",
  description:
    "Honest side-by-side comparisons against the screenshot, browser-as-API, and AI-agent browsing tools you might be evaluating. Pricing, MCP support, visual diff, webhooks, GitHub Action — at a glance.",
  alternates: { canonical: "/compare" },
};

export default function CompareIndexPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
              <Eye className="h-[18px] w-[18px] text-primary" strokeWidth={2.5} />
            </div>
            <span className="text-[1.35rem] font-semibold">DeepSyte</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/docs"><Button variant="ghost">Docs</Button></Link>
            <Link href="/pricing"><Button variant="ghost">Pricing</Button></Link>
            <MarketingNavAuth signUpLabel="Get started free" />
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-center mb-14">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Comparisons</h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Pick the tool that matches your stack. Each page is a side-by-side feature, pricing, and AI-agent fit comparison — updated when the providers change.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {competitors.map((c) => (
            <Card key={c.slug} className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{c.name}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
                <CardDescription className="text-base">{c.tagline}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href={`/compare/${c.slug}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Compare {c.name} vs DeepSyte →
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
