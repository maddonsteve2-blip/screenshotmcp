import type { Metadata } from "next";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarketingNavAuth } from "@/components/marketing-nav-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PLAN_DESCRIPTORS } from "@deepsyte/types";

export const metadata: Metadata = {
  title: "Pricing & Plans – DeepSyte | AI-Powered Website Auditing",
  description:
    "Simple, transparent pricing for DeepSyte. Start free — no credit card required. Upgrade for higher volume.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing & Plans – DeepSyte | AI-Powered Website Auditing",
    description:
      "Start free. Upgrade for higher volume. No credit card required.",
    url: "/pricing",
    siteName: "DeepSyte",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
};

const plans = [PLAN_DESCRIPTORS.free, PLAN_DESCRIPTORS.starter, PLAN_DESCRIPTORS.pro];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Eye className="h-[18px] w-[18px] text-primary" strokeWidth={2.5} />
            </div>
            <span className="text-[1.35rem] font-semibold">DeepSyte</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/docs">
              <Button variant="ghost" className="text-[1.02rem] sm:text-lg">Docs</Button>
            </Link>
            <MarketingNavAuth />
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center mb-16">
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">Simple, transparent pricing</h1>
          <p className="mx-auto max-w-2xl text-[1.1rem] leading-relaxed text-muted-foreground sm:text-[1.28rem]">
            Start on the free plan — no credit card. Paid tiers are launching soon; join the waitlist to hear first.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={plan.highlight ? "border-primary ring-2 ring-primary relative" : "relative"}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary px-4 py-1 text-sm text-primary-foreground">Most popular</Badge>
                </div>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-5xl font-bold">{plan.priceLabel}</span>
                  <span className="text-base text-muted-foreground">{plan.periodLabel}</span>
                </div>
                <CardDescription className="text-base font-medium leading-relaxed text-foreground/70">
                  {plan.quotaLabel}
                </CardDescription>
                {!plan.available && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Paid plans launch soon — join the waitlist and we&apos;ll email you first.
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <Link href={plan.ctaHref}>
                  <Button
                    className="w-full"
                    variant={plan.highlight ? "default" : "outline"}
                    size="lg"
                  >
                    {plan.cta}
                  </Button>
                </Link>
                <Separator />
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-base leading-relaxed text-muted-foreground">
                      <span aria-hidden="true" className="text-primary font-bold">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="mb-4 text-[1.05rem] text-muted-foreground sm:text-lg">
            Need a higher volume plan?{" "}
            <a href="mailto:hello@deepsyte.com" className="text-primary underline underline-offset-4">
              Contact us
            </a>
          </p>
          <p className="text-base leading-relaxed text-muted-foreground">
            All plans include Cloudflare R2 CDN delivery, API key management, and MCP server access.
          </p>
        </div>
      </section>

      <footer className="border-t mt-16 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-base text-muted-foreground">
          <span>© {new Date().getFullYear()} DeepSyte</span>
          <div className="flex gap-4">
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
