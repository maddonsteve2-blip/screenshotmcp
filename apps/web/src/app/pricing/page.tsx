import Link from "next/link";
import { Camera } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    screenshots: "100 screenshots / mo",
    cta: "Get started free",
    href: "/sign-up",
    highlight: false,
    features: [
      "100 screenshots / month",
      "REST API",
      "MCP server (Claude, Cursor, Windsurf)",
      "PNG, JPEG, WebP formats",
      "Custom viewport sizes",
      "Community support",
    ],
  },
  {
    name: "Starter",
    price: "$9",
    period: "/ month",
    screenshots: "2,000 screenshots / mo",
    cta: "Start free trial",
    href: "/sign-up",
    highlight: true,
    features: [
      "2,000 screenshots / month",
      "REST API",
      "MCP server (Claude, Cursor, Windsurf)",
      "PNG, JPEG, WebP formats",
      "Custom viewport sizes",
      "Full-page screenshots",
      "Email support",
    ],
  },
  {
    name: "Pro",
    price: "$29",
    period: "/ month",
    screenshots: "10,000 screenshots / mo",
    cta: "Start free trial",
    href: "/sign-up",
    highlight: false,
    features: [
      "10,000 screenshots / month",
      "REST API",
      "MCP server (Claude, Cursor, Windsurf)",
      "PNG, JPEG, WebP formats",
      "Custom viewport sizes",
      "Full-page screenshots",
      "Custom delay support",
      "Priority support",
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <span className="text-[1.35rem] font-semibold">ScreenshotsMCP</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/docs">
              <Button variant="ghost" className="text-[1.02rem] sm:text-lg">Docs</Button>
            </Link>
            <Link href="/sign-in">
              <Button variant="ghost" className="text-[1.02rem] sm:text-lg">Sign in</Button>
            </Link>
            <Link href="/sign-up">
              <Button className="text-[1.02rem] sm:text-lg">Get started</Button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center mb-16">
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">Simple, transparent pricing</h1>
          <p className="mx-auto max-w-2xl text-[1.1rem] leading-relaxed text-muted-foreground sm:text-[1.28rem]">
            Start free. No credit card required. Upgrade when you need more.
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
                  <span className="text-5xl font-bold">{plan.price}</span>
                  <span className="text-base text-muted-foreground">{plan.period}</span>
                </div>
                <CardDescription className="text-base font-medium leading-relaxed text-foreground/70">
                  {plan.screenshots}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Link href={plan.href}>
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
                      <span className="text-primary font-bold">✓</span>
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
            <a href="mailto:hello@screenshotsmcp.com" className="text-primary underline underline-offset-4">
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
          <span>© 2025 ScreenshotsMCP</span>
          <div className="flex gap-4">
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
