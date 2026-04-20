"use client";
import { useState } from "react";
import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { getNpxSetupCommand } from "@screenshotsmcp/types";
import { Button } from "@/components/ui/button";
import Script from "next/script";
import { Camera, Eye, MonitorSmartphone, Search, Lock, Diff, Layers, Terminal, Copy, Check, ArrowRight, Zap, Shield, X, Sparkles } from "lucide-react";

const HERO_VIDEO_URL = "https://pub-79ded844355643e1a17a61cb64962257.r2.dev/assets/hero-video.mp4";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ScreenshotsMCP",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Windows, macOS, Linux",
  description:
    "Browser truth platform for AI agents and developers. Inspect, test, and verify websites with screenshots, browser actions, local browser workflows, and evidence-rich reporting.",
  url: "https://www.screenshotmcp.com",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const steps = [
  {
    number: "01",
    title: "Install in 30 seconds",
    description: "Install once and connect ScreenshotsMCP to your IDE, CLI, or MCP client with the fastest path that fits your workflow.",
  },
  {
    number: "02",
    title: "Ask in plain English",
    description: "Ask for a screenshot, browser test, audit, or managed local browser workflow. No Playwright scripts required.",
  },
  {
    number: "03",
    title: "Review the proof",
    description: "Get screenshots, recordings, logs, network evidence, and findings so humans and agents can verify what actually happened.",
  },
];

const features = [
  {
    icon: Eye,
    title: "Real Browser Workflows",
    description: "Navigate, click, fill, scroll, inspect, and verify flows in a real browser instead of asking AI to guess from code alone.",
  },
  {
    icon: MonitorSmartphone,
    title: "Remote + Local Execution",
    description: "Run public workflows remotely, then escalate to a managed local browser for localhost, private apps, VPNs, and authenticated flows.",
  },
  {
    icon: Layers,
    title: "Evidence Bundles",
    description: "Capture screenshots, recordings, console logs, network requests, storage state, and metadata in one proof-oriented workflow.",
  },
  {
    icon: Search,
    title: "Audits with Findings",
    description: "Review SEO, performance, accessibility, and page structure with outputs that agents can act on and humans can trust.",
  },
  {
    icon: Diff,
    title: "Before / After Verification",
    description: "Use responsive capture, diffs, and repeated verification loops to prove fixes instead of stopping at a single screenshot.",
  },
  {
    icon: Lock,
    title: "Auth + Private App Coverage",
    description: "Test sign-in flows, internal tools, and private environments with explicit local approval when cloud execution is not enough.",
  },
];

const oldWay = [
  "Ask AI to change code without seeing the page",
  "Manually reproduce bugs in the browser",
  "Paste screenshots into chat and explain the issue",
  "Lose the console, network, and page state context",
  "Guess what happened on private or local environments",
  "Repeat the whole loop to verify the fix",
];

const newWay = [
  "\"Open my app, test checkout, and capture proof\"",
  "ScreenshotsMCP picks the right browser path",
  "AI captures screenshots, recordings, and logs",
  "You review findings instead of raw guesswork",
  "Run the fix and verify it with fresh evidence",
  "One workflow. Shared proof for humans and agents.",
];

const proofPoints = [
  "Remote + local execution",
  "Managed local browser",
  "Evidence bundles",
  "Session recordings",
  "SEO + accessibility audits",
  "Console + network capture",
  "IDE + CLI + MCP",
  "Auth and private app testing",
];

const useCases = [
  { title: "Website Debugging", desc: "Catch what users actually saw with screenshots, logs, and follow-up verification instead of code-only guesswork.", accent: "from-emerald-500/20 to-transparent" },
  { title: "Deploy Verification", desc: "Confirm releases with browser runs, visual proof, and evidence you can share with your team.", accent: "from-cyan-500/20 to-transparent" },
  { title: "Authenticated Flows", desc: "Test sign-in, checkout, and internal tools with the right mix of remote and local execution.", accent: "from-violet-500/20 to-transparent" },
  { title: "Evidence-Heavy QA", desc: "Review screenshots, recordings, console errors, and network failures in one workflow.", accent: "from-amber-500/20 to-transparent" },
  { title: "SEO & Performance", desc: "Audit metadata, Core Web Vitals, accessibility, and page structure with outputs agents can act on.", accent: "from-rose-500/20 to-transparent" },
  { title: "Scraping & Extraction", desc: "Move from one-off page capture to structured inspection and data extraction when the workflow calls for it.", accent: "from-blue-500/20 to-transparent" },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["Unlimited screenshots", "46+ MCP tools", "CLI + REST API", "All viewports & formats", "Cross-browser testing"],
    cta: "Start capturing — it's free",
    href: "/sign-up",
    highlight: false,
  },
  {
    name: "Starter",
    price: "$9",
    period: "/ month",
    features: ["2,000 screenshots / mo", "Priority queue", "Video recording", "Email support", "Everything in Free"],
    cta: "Coming soon",
    href: "/sign-up",
    highlight: true,
    disabled: true,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/ month",
    features: ["10,000 screenshots / mo", "Fastest queue", "Custom branding", "Team management", "Everything in Starter"],
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
    commands: [{ text: "npx screenshotsmcp setup", copyable: true }],
    subTabs: [
      { id: "mac-linux", label: "macOS & Linux" },
      { id: "windows", label: "Windows" },
    ],
    subCommands: {
      "mac-linux": [
        { text: "# Or use the install script", comment: true },
        { text: "curl -fsSL https://www.screenshotmcp.com/install.sh | bash", copyable: true },
      ],
      "windows": [
        { text: "# Or use the PowerShell script", comment: true },
        { text: "irm https://www.screenshotmcp.com/install.ps1 | iex", copyable: true },
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
    commands: [{ text: getNpxSetupCommand("cursor"), copyable: true }],
  },
  {
    id: "windsurf",
    label: "Windsurf",
    comment: "# AI agents: run this directly",
    commands: [{ text: getNpxSetupCommand("windsurf"), copyable: true }],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    comment: "# AI agents: run this directly",
    commands: [{ text: getNpxSetupCommand("claude-code"), copyable: true }],
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-2 p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
      aria-label="Copy command"
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
    <section className="relative text-white">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="mb-8 flex items-center gap-3 font-[var(--font-heading)] text-3xl font-bold tracking-[-0.02em] sm:text-4xl md:text-[2.7rem]">
          <Terminal className="h-6 w-6 text-green-400" />
          Up and running in 30 seconds
        </h2>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden">
          <div className="flex items-center gap-3 px-4 pt-3 pb-0 border-b border-white/10">
            <div className="flex gap-1.5 mr-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {quickStartTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === t.id
                      ? "bg-white/10 text-green-400 border border-white/10 border-b-0"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 p-5 font-mono text-[0.95rem] leading-7 sm:text-base">
            {tab.comment && <div className="text-sm text-gray-500">{tab.comment}</div>}
            {tab.commands.map((cmd, i) => (
              <div key={i} className="flex items-center justify-between group">
                <div>
                  <span className="text-green-400 mr-2">$</span>
                  <span className="text-white font-semibold">{cmd.text}</span>
                </div>
                {cmd.copyable && <CopyButton text={cmd.text} />}
              </div>
            ))}
            {tab.subTabs && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex gap-2 mb-3">
                  {tab.subTabs.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setActiveSubTab(st.id)}
                      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                        activeSubTab === st.id
                          ? "bg-green-400/10 text-green-400 ring-1 ring-green-400/30"
                          : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                {(tab.subCommands as Record<string, { text: string; comment?: boolean; copyable?: boolean }[]> | undefined)?.[activeSubTab]?.map((cmd, i) => (
                  <div key={i} className={`flex items-center justify-between group ${cmd.comment ? "text-sm text-gray-500" : ""}`}>
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

        <p className="mt-4 text-center text-base text-gray-500">
          Works on macOS, Linux, and Windows. Requires Node.js 18+.
        </p>
      </div>
    </section>
  );
}

function MidPageCTA() {
  return (
    <section className="border-t border-white/[0.06] bg-gradient-to-b from-green-500/[0.03] to-transparent">
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-gray-400 text-xl mb-6">
          Run anywhere. See everything. <span className="text-white font-medium">Prove what happened.</span>
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/sign-up">
            <Button size="lg" className="bg-green-500 hover:bg-green-400 text-black font-semibold gap-2 glow-green-pulse h-12 text-base">
              <Camera className="h-4 w-4" />
              Install free
            </Button>
          </Link>
          <Link href="/docs">
            <Button size="lg" variant="outline" className="h-12 gap-2 border-white/15 bg-white/[0.03] text-gray-100 hover:border-white/25 hover:bg-white/[0.08] hover:text-white text-base">
              See the docs
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#07070b] text-gray-100">
      <Script
        id="json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Urgency Banner */}
      <div className="bg-gradient-to-r from-green-500/10 via-green-500/20 to-green-500/10 border-b border-green-500/20">
        <div className="mx-auto max-w-6xl px-6 py-2.5 text-center">
          <p className="text-[1.02rem] font-medium text-green-300 sm:text-lg">
            <Sparkles className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Remote when public. Local when realism matters. Proof included.
            <Sparkles className="h-4 w-4 inline ml-1.5 -mt-0.5" />
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="border-b border-white/[0.06] relative z-10 sticky top-0 bg-[#07070b]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Camera className="h-5 w-5 text-green-400" />
            <span className="font-[var(--font-heading)] text-[1.35rem] font-bold tracking-tight">ScreenshotsMCP</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/docs">
              <Button variant="ghost" className="text-[1.02rem] text-gray-400 hover:bg-white/5 hover:text-white sm:text-lg">Docs</Button>
            </Link>
            <Link href="#pricing">
              <Button variant="ghost" className="text-[1.02rem] text-gray-400 hover:bg-white/5 hover:text-white sm:text-lg">Pricing</Button>
            </Link>
            <Show when="signed-out">
              <Link href="/sign-in">
                <Button variant="ghost" className="text-[1.02rem] text-gray-400 hover:bg-white/5 hover:text-white sm:text-lg">Sign in</Button>
              </Link>
              <Link href="/sign-up">
                <Button className="bg-green-500 px-5 text-[1.02rem] font-semibold text-black hover:bg-green-400 sm:text-lg">
                  Start free
                </Button>
              </Link>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard">
                <Button className="bg-green-500 px-5 text-[1.02rem] font-semibold text-black hover:bg-green-400 sm:text-lg">Dashboard</Button>
              </Link>
            </Show>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative bg-radial-hero bg-grid-subtle overflow-hidden">
        <div className="mx-auto max-w-5xl px-6 pt-24 pb-20 text-center relative z-10">
          <div className="animate-fade-in-up">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/5 px-4 py-1.5 text-[0.96rem] text-green-400 sm:text-base">
              <Zap className="h-3.5 w-3.5" />
              Browser truth for AI agents and developers
            </div>
          </div>

          <h1 className="animate-fade-in-up delay-100 font-[var(--font-heading)] text-5xl sm:text-6xl lg:text-[4.5rem] xl:text-[5rem] font-extrabold tracking-[-0.04em] mb-7 leading-[1.05]">
            Give your AI{" "}
            <br />
            <span className="text-gradient">a real browser — and proof.</span>
          </h1>

          <p className="animate-fade-in-up delay-200 mx-auto mb-4 max-w-2xl text-[1.15rem] leading-relaxed text-gray-400 sm:text-[1.35rem]">
            Inspect, test, and verify websites with screenshots, recordings, browser actions, and evidence-rich results inside your existing workflow.
          </p>
          <p className="animate-fade-in-up delay-200 mx-auto mb-10 max-w-2xl text-[1.15rem] leading-relaxed text-gray-400 sm:text-[1.35rem]">
            Start with remote sessions for public sites, escalate to a managed local browser for localhost, private apps, and authenticated flows, and keep the proof either way.
            <br />
            <span className="text-white font-medium">Your AI should not have to guess.</span>
          </p>

          <div className="animate-fade-in-up delay-300 flex items-center justify-center gap-4 flex-wrap">
            <Link href="/try">
              <Button size="lg" className="bg-green-500 hover:bg-green-400 text-black font-semibold gap-2 glow-green-pulse px-7 h-12 text-base">
                <Camera className="h-4 w-4" />
                Try it — no signup
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="lg" variant="outline" className="h-12 gap-2 border-white/15 bg-white/[0.03] text-gray-100 hover:border-white/25 hover:bg-white/[0.08] hover:text-white text-base">
                Install free
              </Button>
            </Link>
            <Link href="/docs">
              <Button size="lg" variant="ghost" className="h-12 gap-2 text-gray-400 hover:bg-white/5 hover:text-white text-base">
                See docs
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="animate-fade-in-up delay-300 mt-4 text-sm text-gray-500 sm:text-base">No credit card. No signup to try. Free plan after that.</p>

          {/* Hero video */}
          <div className="animate-fade-in-up delay-400 mt-14 mx-auto max-w-4xl rounded-xl overflow-hidden border border-white/10 shadow-2xl shadow-green-500/5">
            <video autoPlay loop muted playsInline className="w-full h-auto">
              <source src={HERO_VIDEO_URL} type="video/mp4" />
            </video>
          </div>

          {/* Works with */}
          <div className="animate-fade-in delay-500 mt-14 flex items-center justify-center gap-3 flex-wrap">
            <span className="mr-2 text-sm font-medium tracking-widest text-gray-500 uppercase">Works with</span>
            {["Cursor", "Windsurf", "VS Code", "Claude Desktop", "Claude Code", "n8n"].map((ide) => (
              <span key={ide} className="rounded-full border border-white/8 bg-white/[0.02] px-3.5 py-1 text-[0.96rem] text-gray-400 sm:text-base">
                {ide}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof Ticker */}
      <section className="border-t border-white/[0.06] overflow-hidden py-5">
        <div className="animate-ticker flex gap-8 whitespace-nowrap">
          {[...proofPoints, ...proofPoints].map((point, i) => (
            <span key={i} className="flex shrink-0 items-center gap-2 text-[0.96rem] text-gray-500 sm:text-base">
              <span className="h-1 w-1 rounded-full bg-green-400/50" />
              {point}
            </span>
          ))}
        </div>
      </section>

      {/* Old Way vs New Way */}
      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="font-[var(--font-heading)] text-4xl sm:text-5xl font-bold text-center mb-4 tracking-[-0.03em]">
            Without browser truth, AI <span className="text-gradient-warm">guesses</span>
          </h2>
          <p className="text-gray-400 text-lg text-center mb-14 max-w-xl mx-auto">
            The problem is not just visibility. It&apos;s verification, realism, and proof.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Old Way */}
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-7">
              <div className="flex items-center gap-2 mb-6">
                <X className="h-5 w-5 text-red-400" />
                <h3 className="font-[var(--font-heading)] font-bold text-xl text-red-400">The old way</h3>
              </div>
              <ul className="space-y-3.5">
                {oldWay.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-base text-gray-400">
                    <X className="h-4 w-4 text-red-500/50 shrink-0 mt-1" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* New Way */}
            <div className="rounded-xl border border-green-500/20 bg-green-500/[0.03] p-7">
              <div className="flex items-center gap-2 mb-6">
                <Zap className="h-5 w-5 text-green-400" />
                <h3 className="font-[var(--font-heading)] font-bold text-xl text-green-400">With ScreenshotsMCP</h3>
              </div>
              <ul className="space-y-3.5">
                {newWay.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-base text-gray-300">
                    <Check className="h-4 w-4 text-green-400 shrink-0 mt-1" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Start */}
      <QuickStartSection />

      {/* How it works */}
      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="font-[var(--font-heading)] text-4xl sm:text-5xl font-bold text-center mb-16 tracking-[-0.03em]">
            Inspect. Test. Prove.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {steps.map((s, i) => (
              <div key={s.number} className={`animate-fade-in-up delay-${(i + 1) * 100} space-y-4`}>
                <span className="text-green-400/60 font-mono text-sm font-bold">{s.number}</span>
                <h3 className="font-[var(--font-heading)] font-bold text-2xl tracking-[-0.01em]">{s.title}</h3>
                <p className="text-gray-400 text-base sm:text-lg leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo conversation */}
      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="font-mono text-[0.96rem] font-medium text-green-400 sm:text-base">How it feels</span>
              <h2 className="font-[var(--font-heading)] text-3xl sm:text-4xl font-bold mt-3 mb-5 tracking-[-0.02em]">
                Ask for a run. Review the proof.
              </h2>
              <p className="mb-4 text-[1.1rem] leading-relaxed text-gray-400 sm:text-xl">
                No SDKs to learn. No Playwright scripts. No blind handoff between AI output and human verification.
              </p>
              <p className="mb-8 text-[1.1rem] leading-relaxed text-gray-400 sm:text-xl">
                Once installed, your AI can inspect pages, run browser actions, and return the evidence you need to decide what happens next.
              </p>
              <Link href="/sign-up">
                <Button className="bg-green-500 hover:bg-green-400 text-black font-semibold gap-2">
                  Try it free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="space-y-5 rounded-xl border border-white/10 bg-white/[0.02] p-6 font-mono text-[0.96rem] leading-7 sm:text-base">
              <div className="flex gap-3">
                <span className="text-gray-500 shrink-0">You:</span>
                <span className="text-gray-200">Open my staging app, test checkout, and capture proof if anything fails</span>
              </div>
              <div className="flex gap-3">
                <span className="text-green-400 shrink-0 font-semibold">AI:</span>
                <span className="text-gray-400">Starting with the remote browser for the public flow. I&apos;ll switch to the managed local browser if auth or private pages require it.</span>
              </div>
              <div className="flex gap-3">
                <span className="text-green-400 shrink-0 font-semibold">AI:</span>
                <span className="text-gray-400">I found a failure after sign-in, captured the screenshot, recording, console errors, and network evidence, and I&apos;ve re-run the fix to verify it.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mid-page CTA */}
      <MidPageCTA />

      {/* Use cases — bento grid */}
      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="font-[var(--font-heading)] text-4xl sm:text-5xl font-bold text-center mb-5 tracking-[-0.03em]">
            Where this becomes valuable fast
          </h2>
          <p className="text-gray-400 text-lg text-center mb-14 max-w-xl mx-auto">
            Start with one workflow that needs browser truth, then expand into verification, audits, and evidence-heavy testing.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {useCases.map((u) => (
              <div key={u.title} className={`relative rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-2 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04] group overflow-hidden`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${u.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <h3 className="font-[var(--font-heading)] font-bold text-xl relative z-10">{u.title}</h3>
                <p className="text-base text-gray-400 leading-relaxed relative z-10">{u.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="font-[var(--font-heading)] text-4xl sm:text-5xl font-bold text-center mb-5 tracking-[-0.03em]">
            Run anywhere. See everything. Prove what happened.
          </h2>
          <p className="text-gray-400 text-lg text-center mb-14 max-w-xl mx-auto">
            ScreenshotsMCP is strongest when you need real browser execution plus evidence you can review, share, and trust.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 transition-all duration-300 hover:border-green-500/20 hover:bg-green-500/[0.02] group">
                <f.icon className="h-7 w-7 text-green-400/70 mb-4 group-hover:text-green-400 transition-colors" />
                <h3 className="font-[var(--font-heading)] font-bold text-xl mb-2">{f.title}</h3>
                <p className="text-base text-gray-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Guarantee Section */}
      <section className="border-t border-white/[0.06] bg-gradient-to-b from-green-500/[0.04] to-transparent">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <Shield className="h-12 w-12 text-green-400 mx-auto mb-6" />
          <h2 className="font-[var(--font-heading)] text-4xl sm:text-5xl font-bold mb-5 tracking-[-0.03em]">
            Start free. Keep the proof.
          </h2>
          <p className="text-gray-400 text-xl leading-relaxed max-w-xl mx-auto mb-4">
            Start with the free plan, verify real workflows, and decide later whether you need more volume, priority, or team features.
          </p>
          <p className="text-gray-400 text-xl leading-relaxed max-w-xl mx-auto mb-10">
            Remote sessions, managed local browser workflows, screenshots, recordings, audits, and evidence bundles.
            <br />
            <span className="text-white font-medium">The point is not more tooling. It&apos;s better verification.</span>
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="bg-green-500 hover:bg-green-400 text-black font-semibold gap-2 px-8 h-12 text-base">
              <Camera className="h-4 w-4" />
              Start free
            </Button>
          </Link>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-white/[0.06]" id="pricing">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="font-[var(--font-heading)] text-4xl sm:text-5xl font-bold text-center mb-3 tracking-[-0.03em]">
            Simple pricing. Start free.
          </h2>
          <p className="text-gray-400 text-lg text-center mb-14 max-w-lg mx-auto">
            Most developers never need to leave the free plan. Paid tiers add priority queues and team features when you&apos;re ready.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map((p) => (
              <div key={p.name} className={`rounded-xl border p-6 flex flex-col ${
                p.highlight
                  ? "border-green-500/40 bg-green-500/[0.04] ring-1 ring-green-500/20"
                  : "border-white/[0.08] bg-white/[0.02]"
              }`}>
                {p.highlight && (
                  <span className="inline-block text-xs font-semibold text-green-400 bg-green-500/10 rounded-full px-3 py-1 mb-4 w-fit">
                    Most popular
                  </span>
                )}
                <h3 className="font-[var(--font-heading)] font-bold text-xl">{p.name}</h3>
                <div className="flex items-baseline gap-1 mt-2 mb-4">
                  <span className="text-5xl font-bold tracking-tight">{p.price}</span>
                  <span className="text-gray-500 text-base">{p.period}</span>
                </div>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2.5 text-base text-gray-400">
                      <Check className="h-4 w-4 text-green-400/70 shrink-0" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <Link href={"disabled" in p && p.disabled ? "#" : p.href}>
                  <Button
                    className={`w-full ${p.highlight ? "bg-green-500 hover:bg-green-400 text-black font-semibold" : "border-white/10 text-gray-300 hover:bg-white/5"}`}
                    variant={p.highlight ? "default" : "outline"}
                    disabled={"disabled" in p && !!p.disabled}
                  >
                    {p.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA — personality close */}
      <section className="border-t border-white/[0.06] bg-radial-hero">
        <div className="mx-auto max-w-3xl px-6 py-28 text-center">
          <h2 className="font-[var(--font-heading)] text-4xl sm:text-5xl font-bold mb-5 tracking-[-0.03em]">
            Give your AI browser truth.
          </h2>
          <p className="text-gray-400 text-xl mb-3 max-w-xl mx-auto">
            Stop asking AI to guess what happened in the browser.
          </p>
          <p className="text-gray-400 text-xl mb-10 max-w-xl mx-auto">
            The setup takes minutes. The first useful workflow can happen immediately. The proof stays with the run.
            <br />
            <span className="text-white font-medium">Install it, run it, and verify it.</span>
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="bg-green-500 hover:bg-green-400 text-black font-semibold gap-2 glow-green-pulse px-8 h-12 text-base">
              <Camera className="h-4 w-4" />
              Install free
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Camera className="h-4 w-4 text-green-400/50" />
                <span className="font-[var(--font-heading)] text-base font-bold">ScreenshotsMCP</span>
              </div>
              <p className="text-sm text-gray-500 sm:text-base">Give your AI a real browser — and proof.</p>
            </div>
            <div className="flex gap-8 text-[0.96rem] text-gray-500 sm:text-base">
              <Link href="/docs" className="hover:text-gray-300 transition-colors">Docs</Link>
              <Link href="#pricing" className="hover:text-gray-300 transition-colors">Pricing</Link>
              <Link href="/docs/quickstart" className="hover:text-gray-300 transition-colors">Quick Start</Link>
              <Link href="/dashboard" className="hover:text-gray-300 transition-colors">Dashboard</Link>
              <Link href="/changelog" className="hover:text-gray-300 transition-colors">Changelog</Link>
              <Link href="/status" className="hover:text-gray-300 transition-colors">Status</Link>
              <Link href="/security" className="hover:text-gray-300 transition-colors">Security</Link>
              <Link href="/privacy-policy" className="hover:text-gray-300 transition-colors">Privacy</Link>
              <Link href="/terms-of-service" className="hover:text-gray-300 transition-colors">Terms</Link>
            </div>
          </div>
          <div className="mt-8 border-t border-white/[0.06] pt-6 text-sm text-gray-500">
            &copy; 2026 ScreenshotsMCP. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
