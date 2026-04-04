import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Code2, Cpu, Globe, Key, Zap } from "lucide-react";

const features = [
  {
    icon: Globe,
    title: "Any URL",
    description: "Screenshot any public URL with custom viewport, format, and full-page support.",
  },
  {
    icon: Cpu,
    title: "MCP Server",
    description: "Native Model Context Protocol server — works with Claude, Cursor, Windsurf out of the box.",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Async job queue powered by BullMQ. Get your screenshot URL in seconds.",
  },
  {
    icon: Code2,
    title: "Simple REST API",
    description: "Two endpoints. POST a URL, GET the result. Ship in minutes.",
  },
  {
    icon: Key,
    title: "API Keys",
    description: "Generate scoped API keys with usage tracking and one-click revocation.",
  },
  {
    icon: Camera,
    title: "Cloudflare CDN",
    description: "Screenshots served via Cloudflare R2 — zero egress fees, global delivery.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    screenshots: "100 screenshots / mo",
    cta: "Get started",
    href: "/sign-up",
    highlight: false,
  },
  {
    name: "Starter",
    price: "$9",
    period: "/ month",
    screenshots: "2,000 screenshots / mo",
    cta: "Start free trial",
    href: "/sign-up",
    highlight: true,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/ month",
    screenshots: "10,000 screenshots / mo",
    cta: "Start free trial",
    href: "/sign-up",
    highlight: false,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <span className="font-semibold text-lg">ScreenshotsMCP</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/pricing">
              <Button variant="ghost">Pricing</Button>
            </Link>
            <Link href="/docs">
              <Button variant="ghost">Docs</Button>
            </Link>
            <Show when="signed-out">
              <Link href="/sign-in">
                <Button variant="ghost">Sign in</Button>
              </Link>
              <Link href="/sign-up">
                <Button>Get started</Button>
              </Link>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard">
                <Button>Dashboard</Button>
              </Link>
            </Show>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <Badge variant="secondary" className="mb-4">
          MCP + REST API
        </Badge>
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Screenshot any URL.
          <br />
          <span className="text-primary">From code or AI agents.</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          A developer-first screenshot API with a native MCP server. Integrate in minutes.
          Works with Claude, Cursor, Windsurf, and any REST client.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/sign-up">
            <Button size="lg">Start for free</Button>
          </Link>
          <Link href="/docs">
            <Button size="lg" variant="outline">
              View docs
            </Button>
          </Link>
        </div>

        <div className="mt-16 rounded-lg border bg-muted/30 p-6 text-left max-w-2xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground mb-3">Quick start</p>
          <pre className="text-sm overflow-x-auto">
            <code>{`curl -X POST https://api.screenshotsmcp.com/v1/screenshot \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com"}'

# Returns: {"id": "abc123", "status": "pending"}`}</code>
          </pre>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Everything you need</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <f.icon className="h-8 w-8 text-primary mb-2" />
                <CardTitle className="text-lg">{f.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">{f.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16" id="pricing">
        <h2 className="text-3xl font-bold text-center mb-4">Simple pricing</h2>
        <p className="text-center text-muted-foreground mb-12">
          Start free. Scale as you grow.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => (
            <Card
              key={p.name}
              className={p.highlight ? "border-primary ring-1 ring-primary" : ""}
            >
              <CardHeader>
                {p.highlight && (
                  <Badge className="w-fit mb-2">Most popular</Badge>
                )}
                <CardTitle>{p.name}</CardTitle>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{p.price}</span>
                  <span className="text-muted-foreground">{p.period}</span>
                </div>
                <CardDescription>{p.screenshots}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={p.href}>
                  <Button
                    className="w-full"
                    variant={p.highlight ? "default" : "outline"}
                  >
                    {p.cta}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t mt-16 py-8">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between text-sm text-muted-foreground">
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
