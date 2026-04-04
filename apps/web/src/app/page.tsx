import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Code2, Cpu, Globe, Key, Zap, MousePointer, Eye, GitCompare, MonitorSmartphone } from "lucide-react";

const steps = [
  {
    number: "1",
    title: "Install in your IDE",
    description: "One-click setup for Cursor, Windsurf, Claude Desktop, and VS Code. Your API key is pre-filled.",
  },
  {
    number: "2",
    title: "Ask your AI assistant",
    description: '"Take a screenshot of my site" or "What does example.com look like?" — your AI handles the rest.',
  },
  {
    number: "3",
    title: "AI sees your UI",
    description: "Screenshots are returned inline. Your AI can now debug layouts, compare designs, and verify deploys.",
  },
];

const features = [
  {
    icon: Eye,
    title: "Visual AI Browser",
    description: "AI agents can navigate, click, fill forms, and screenshot any website — just like a human.",
  },
  {
    icon: Cpu,
    title: "Native MCP Server",
    description: "Works with Claude, Cursor, Windsurf, and any MCP-compatible client out of the box.",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Results in seconds via async BullMQ queue. Sync mode available for simple use cases.",
  },
  {
    icon: MonitorSmartphone,
    title: "Any Viewport",
    description: "Desktop, mobile, tablet. Custom width/height or use built-in presets.",
  },
  {
    icon: GitCompare,
    title: "Full Page & PDF",
    description: "Capture entire scrollable pages or export as PDF. Perfect for docs and reports.",
  },
  {
    icon: Globe,
    title: "Global CDN",
    description: "Screenshots served via Cloudflare R2 — zero egress fees, instant worldwide delivery.",
  },
  {
    icon: Code2,
    title: "Simple REST API",
    description: "Two endpoints. POST a URL, GET the result. Ship in minutes with any language.",
  },
  {
    icon: Key,
    title: "API Keys",
    description: "Scoped API keys with usage tracking and one-click revocation.",
  },
  {
    icon: MousePointer,
    title: "Click & Navigate",
    description: "Coming soon: persistent sessions so AI can log in, click, and complete workflows.",
  },
];

const useCases = [
  { emoji: "🐛", title: "UI Debugging", desc: "AI sees your layout and finds the bug" },
  { emoji: "🚀", title: "Deploy Verification", desc: "Confirm your site looks right after pushing" },
  { emoji: "🔍", title: "Competitor Analysis", desc: "AI researches competitor sites visually" },
  { emoji: "📱", title: "Responsive Testing", desc: "Check mobile and desktop in seconds" },
  { emoji: "📸", title: "Auto Documentation", desc: "Keep screenshots in docs always up to date" },
  { emoji: "🧪", title: "Visual QA", desc: "Catch regressions before they reach production" },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    screenshots: "Unlimited screenshots",
    cta: "Get started free",
    href: "/sign-up",
    highlight: false,
  },
  {
    name: "Starter",
    price: "$9",
    period: "/ month",
    screenshots: "2,000 screenshots / mo",
    cta: "Coming soon",
    href: "/sign-up",
    highlight: true,
    disabled: true,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/ month",
    screenshots: "10,000 screenshots / mo",
    cta: "Coming soon",
    href: "/sign-up",
    highlight: false,
    disabled: true,
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
            <Link href="/docs">
              <Button variant="ghost">Docs</Button>
            </Link>
            <Show when="signed-out">
              <Link href="/sign-in">
                <Button variant="ghost">Sign in</Button>
              </Link>
              <Link href="/sign-up">
                <Button>Get started free</Button>
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

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <Badge variant="secondary" className="mb-6">
          MCP Server + REST API · Free forever
        </Badge>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-tight">
          Give your AI coding
          <br />
          <span className="text-primary">assistant eyes.</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          Claude, Cursor, and Windsurf can read your code — but they can&apos;t see your UI.
          screenshotsmcp gives them the ability to screenshot any URL so they can actually help you build.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Camera className="h-4 w-4" />
              Install free — no credit card
            </Button>
          </Link>
          <Link href="/docs">
            <Button size="lg" variant="outline">View docs</Button>
          </Link>
        </div>

        {/* Works with */}
        <div className="mt-14 flex items-center justify-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">Works with</span>
          {["Cursor", "Windsurf", "Claude", "VS Code"].map((ide) => (
            <Badge key={ide} variant="outline" className="text-sm font-normal px-3 py-1">
              {ide}
            </Badge>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-3xl font-bold text-center mb-14">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.number} className="text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground text-lg font-bold flex items-center justify-center mx-auto">
                  {s.number}
                </div>
                <h3 className="font-semibold text-lg">{s.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo code */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <Badge variant="secondary" className="mb-4">MCP Tool</Badge>
            <h2 className="text-3xl font-bold mb-4">Just ask your AI.</h2>
            <p className="text-muted-foreground mb-6">
              Once installed, your AI assistant can take screenshots on command.
              No code, no setup — just natural language.
            </p>
            <Link href="/sign-up">
              <Button>Get started free</Button>
            </Link>
          </div>
          <div className="rounded-lg border bg-muted/30 p-5 space-y-3 text-sm font-mono">
            <div className="flex gap-2">
              <span className="text-muted-foreground">You:</span>
              <span>Screenshot my site at https://myapp.com and tell me if the hero looks right</span>
            </div>
            <div className="flex gap-2">
              <span className="text-primary font-semibold">AI:</span>
              <span className="text-muted-foreground">Taking a screenshot… Here&apos;s what I see: the hero text is cut off on mobile. The CTA button is below the fold at 390px. Here&apos;s how to fix it…</span>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-3xl font-bold text-center mb-12">What developers use it for</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {useCases.map((u) => (
              <div key={u.title} className="rounded-lg border bg-background p-5 space-y-1">
                <span className="text-2xl">{u.emoji}</span>
                <p className="font-semibold text-sm">{u.title}</p>
                <p className="text-xs text-muted-foreground">{u.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Everything you need</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <Card key={f.title}>
              <CardHeader className="pb-2">
                <f.icon className="h-7 w-7 text-primary mb-2" />
                <CardTitle className="text-base">{f.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">{f.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-5xl px-6 py-20" id="pricing">
          <h2 className="text-3xl font-bold text-center mb-3">Simple pricing</h2>
          <p className="text-center text-muted-foreground mb-12">Start free. Paid plans coming soon.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((p) => (
              <Card key={p.name} className={p.highlight ? "border-primary ring-1 ring-primary" : ""}>
                <CardHeader>
                  {p.highlight && <Badge className="w-fit mb-2">Most popular</Badge>}
                  <CardTitle>{p.name}</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{p.price}</span>
                    <span className="text-muted-foreground text-sm">{p.period}</span>
                  </div>
                  <CardDescription>{p.screenshots}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href={"disabled" in p && p.disabled ? "#" : p.href}>
                    <Button
                      className="w-full"
                      variant={p.highlight ? "default" : "outline"}
                      disabled={"disabled" in p && p.disabled}
                    >
                      {p.cta}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto max-w-5xl px-6 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            <span>© 2025 ScreenshotsMCP</span>
          </div>
          <div className="flex gap-4">
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <Link href="#pricing" className="hover:text-foreground">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
