"use client";
import { useState } from "react";
import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Code2, Cpu, Globe, Key, Zap, MousePointer, Eye, GitCompare, MonitorSmartphone, Search, BarChart2, Lock, Accessibility, Diff, Layers, Terminal, Copy, Check } from "lucide-react";

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
    description: "AI agents can navigate, click, fill forms, scroll, and screenshot any website — just like a human.",
  },
  {
    icon: Cpu,
    title: "Native MCP Server",
    description: "Works with Claude, Cursor, Windsurf, and any MCP-compatible client out of the box.",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Results in seconds via async queue. Sync mode available for simple use cases.",
  },
  {
    icon: MonitorSmartphone,
    title: "Any Viewport",
    description: "Desktop, mobile, tablet, dark mode, custom width/height or built-in presets.",
  },
  {
    icon: GitCompare,
    title: "Full Page & PDF",
    description: "Capture entire scrollable pages or export as PDF. Perfect for docs and reports.",
  },
  {
    icon: Search,
    title: "SEO Audit",
    description: "Check meta tags, Open Graph, Twitter cards, headings, structured data, and canonical URLs.",
  },
  {
    icon: BarChart2,
    title: "Performance Metrics",
    description: "Capture Core Web Vitals (TTFB, FCP, LCP, CLS), network waterfall, and resource breakdown.",
  },
  {
    icon: Lock,
    title: "Smart Login",
    description: "Auto-detect login forms, fill credentials, submit, and continue testing as an authenticated user.",
  },
  {
    icon: Accessibility,
    title: "Accessibility Tree",
    description: "Inspect ARIA roles, headings, links, and interactive elements — no session required.",
  },
  {
    icon: Diff,
    title: "Visual Diff",
    description: "Compare two screenshots pixel-by-pixel and get a diff overlay showing exactly what changed.",
  },
  {
    icon: Layers,
    title: "Batch & Cross-Browser",
    description: "Screenshot multiple URLs in one call, or capture in Chromium, Firefox, and WebKit simultaneously.",
  },
  {
    icon: Key,
    title: "API Keys",
    description: "Scoped API keys with usage tracking and one-click revocation.",
  },
];

const useCases = [
  { emoji: "🐛", title: "UI Debugging", desc: "AI sees your layout and finds the bug" },
  { emoji: "🚀", title: "Deploy Verification", desc: "Confirm your site looks right after pushing" },
  { emoji: "🔍", title: "Competitor Analysis", desc: "AI researches competitor sites visually" },
  { emoji: "📱", title: "Responsive Testing", desc: "Check mobile and desktop in seconds" },
  { emoji: "📸", title: "Auto Documentation", desc: "Keep screenshots in docs always up to date" },
  { emoji: "🧪", title: "Visual QA", desc: "Catch regressions before they reach production" },
  { emoji: "♿", title: "Accessibility Audit", desc: "Inspect ARIA tree and detect a11y issues" },
  { emoji: "⚡", title: "Performance Testing", desc: "Measure Core Web Vitals and find bottlenecks" },
  { emoji: "🔐", title: "Authenticated Testing", desc: "Log in and test protected pages automatically" },
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

const quickStartTabs = [
  {
    id: "one-liner",
    label: "One-liner",
    comment: "# Install & configure everything in one command",
    commands: [
      { text: "npx screenshotsmcp setup", copyable: true },
    ],
    subTabs: [
      { id: "mac-linux", label: "macOS & Linux" },
      { id: "windows", label: "Windows" },
    ],
    subCommands: {
      "mac-linux": [
        { text: "# Or use the install script", comment: true },
        { text: "curl -fsSL https://screenshotsmcp.com/install.sh | bash", copyable: true },
      ],
      "windows": [
        { text: "# Or use the PowerShell script", comment: true },
        { text: 'irm https://screenshotsmcp.com/install.ps1 | iex', copyable: true },
      ],
    },
  },
  {
    id: "npm",
    label: "npm",
    comment: "# Install globally, then set up your IDE",
    commands: [
      { text: "npm install -g screenshotsmcp", copyable: true },
      { text: "screenshotsmcp setup", copyable: true },
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    comment: "# AI agents: run this directly",
    commands: [
      { text: "npx screenshotsmcp setup --client cursor", copyable: true },
    ],
  },
  {
    id: "windsurf",
    label: "Windsurf",
    comment: "# AI agents: run this directly",
    commands: [
      { text: "npx screenshotsmcp setup --client windsurf", copyable: true },
    ],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    comment: "# AI agents: run this directly",
    commands: [
      { text: "npx screenshotsmcp setup --client claude-code", copyable: true },
    ],
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-2 p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
    </button>
  );
}

function QuickStartSection() {
  const [activeTab, setActiveTab] = useState("one-liner");
  const [activeSubTab, setActiveSubTab] = useState("mac-linux");
  const tab = quickStartTabs.find((t) => t.id === activeTab)!;

  return (
    <section className="border-t bg-gray-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
          <Terminal className="h-5 w-5 text-green-400" />
          Quick Start
        </h2>

        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          {/* Tab bar — macOS-style dots + tabs */}
          <div className="flex items-center gap-3 px-4 pt-3 pb-0 border-b border-gray-800 bg-gray-900/80">
            <div className="flex gap-1.5 mr-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {quickStartTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-2 text-xs font-medium rounded-t-md transition-colors whitespace-nowrap ${
                    activeTab === t.id
                      ? "bg-gray-800 text-green-400 border border-gray-700 border-b-0"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Command area */}
          <div className="p-5 font-mono text-sm space-y-2">
            {tab.comment && (
              <div className="text-gray-500 text-xs">{tab.comment}</div>
            )}
            {tab.commands.map((cmd, i) => (
              <div key={i} className="flex items-center justify-between group">
                <div>
                  <span className="text-green-400 mr-2">$</span>
                  <span className="text-white font-semibold">{cmd.text}</span>
                </div>
                {cmd.copyable && <CopyButton text={cmd.text} />}
              </div>
            ))}

            {/* Sub-tabs (for one-liner: macOS vs Windows) */}
            {tab.subTabs && (
              <div className="mt-4 pt-4 border-t border-gray-800">
                <div className="flex gap-2 mb-3">
                  {tab.subTabs.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setActiveSubTab(st.id)}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        activeSubTab === st.id
                          ? "bg-green-400/10 text-green-400 ring-1 ring-green-400/30"
                          : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                {(tab.subCommands as Record<string, { text: string; comment?: boolean; copyable?: boolean }[]> | undefined)?.[activeSubTab]?.map((cmd: { text: string; comment?: boolean; copyable?: boolean }, i: number) => (
                  <div key={i} className={`flex items-center justify-between group ${
                    cmd.comment ? "text-gray-500 text-xs" : ""
                  }`}>
                    <div>
                      {!cmd.comment && <span className="text-green-400 mr-2">$</span>}
                      <span className={cmd.comment ? "" : "text-white font-semibold"}>{cmd.text}</span>
                    </div>
                    {cmd.copyable && <CopyButton text={cmd.text} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-gray-500 text-sm mt-4">
          Works on macOS, Linux, and Windows. Requires Node.js 18+.
        </p>
      </div>
    </section>
  );
}

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
          46+ AI-Powered Tools · MCP Server + CLI + REST API · Free forever
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
          <span className="text-sm font-medium mb-2">Works with</span>
          {["Cursor", "Windsurf", "VS Code", "Claude Desktop", "Claude Code", "n8n"].map((ide) => (
            <Badge key={ide} variant="outline" className="text-sm font-normal px-3 py-1">
              {ide}
            </Badge>
          ))}
        </div>
      </section>

      {/* Quick Start */}
      <QuickStartSection />

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
        <h2 className="text-3xl font-bold text-center mb-3">Everything you need</h2>
        <p className="text-center text-muted-foreground mb-12">46+ tools across screenshots, browser automation, SEO, performance, accessibility, and AI analysis.</p>
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
            <span>© 2026 ScreenshotsMCP</span>
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
