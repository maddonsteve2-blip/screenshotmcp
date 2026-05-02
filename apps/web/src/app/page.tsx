"use client";
import { useState } from "react";
import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { getNpxSetupCommand } from "@deepsyte/types";
import { Button } from "@/components/ui/button";
import Script from "next/script";
import { Camera, Eye, MonitorSmartphone, Search, Lock, Diff, Layers, Terminal, Copy, Check, ArrowRight, Zap, Shield, X, Menu } from "lucide-react";

const HERO_VIDEO_URL = "https://pub-79ded844355643e1a17a61cb64962257.r2.dev/assets/hero-video.mp4";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "DeepSyte",
  applicationCategory: "WebApplication",
  operatingSystem: "Windows, macOS, Linux",
  description:
    "AI-powered website auditing platform. Inspect, test, and verify any website with AI agents that see what users see — in your IDE, browser, or command line.",
  url: "https://www.deepsyte.com",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const steps = [
  {
    number: "01",
    title: "Point it at your site",
    description: "Paste a URL, connect your IDE, or install the CLI. DeepSyte works however you work — no technical skills required.",
  },
  {
    number: "02",
    title: "AI inspects everything",
    description: "DeepSyte audits SEO, performance, accessibility, visuals, and functionality — like a senior developer reviewing every page.",
  },
  {
    number: "03",
    title: "Review the evidence",
    description: "Get screenshots, recordings, findings, and priorities. Fix what matters, prove it worked, move on.",
  },
];

const features = [
  {
    icon: Search,
    title: "Full Website Audits",
    description: "SEO, performance, accessibility, Core Web Vitals, and visual checks — one platform covers everything.",
  },
  {
    icon: Eye,
    title: "AI-Powered Inspection",
    description: "AI agents navigate your site like a real user, catching issues that automated scanners miss.",
  },
  {
    icon: Camera,
    title: "Visual Evidence",
    description: "Screenshots, recordings, and proof of every issue. No more \"it looks fine on my screen.\"",
  },
  {
    icon: Layers,
    title: "Works Everywhere",
    description: "In your IDE, on the web, or from the command line. One tool for developers, store owners, and agencies.",
  },
  {
    icon: Diff,
    title: "Before / After Verification",
    description: "Make a fix, run the audit again, and prove it actually worked — with visual evidence.",
  },
  {
    icon: Lock,
    title: "Private & Authenticated Sites",
    description: "Audit localhost, staging, and password-protected sites. Test checkout flows and internal tools.",
  },
];

const oldWay = [
  "Manually check every page after changes",
  "Miss broken links, slow pages, and SEO issues",
  "Pay agencies thousands for quarterly audits",
  "Get a 200-page PDF report nobody reads",
  "Hope nothing breaks between check-ups",
  "\"It looks fine to me\" — until a customer complains",
];

const newWay = [
  "\"Audit my homepage\" — AI inspects in seconds",
  "DeepSyte catches SEO, performance, and accessibility issues",
  "Real screenshots showing what users actually see",
  "Actionable findings with clear priorities",
  "Continuous verification, not quarterly check-ins",
  "One platform for developers and store owners",
];

const proofPoints = [
  "Full website audits",
  "AI-powered inspection",
  "Visual evidence",
  "SEO & accessibility",
  "Performance monitoring",
  "Before/after verification",
  "IDE + Web + CLI",
  "Private site testing",
];

const useCases = [
  { title: "Store Owners", desc: "Is my checkout working? Are pages loading fast? Is my SEO hurting sales? Get answers in minutes, not days.", accent: "from-emerald-500/20 to-transparent" },
  { title: "Developers", desc: "Deep inspection for every deploy, PR, and staging environment. Catch regressions before users do.", accent: "from-cyan-500/20 to-transparent" },
  { title: "Agencies", desc: "Audit client sites in minutes. Share visual evidence and prioritized findings instead of spreadsheets.", accent: "from-violet-500/20 to-transparent" },
  { title: "Marketing Teams", desc: "Verify SEO, OG tags, meta descriptions, and page speed across every page — not just the homepage.", accent: "from-amber-500/20 to-transparent" },
  { title: "QA & Testing", desc: "Evidence-heavy testing with screenshots, recordings, console logs, and network captures in one workflow.", accent: "from-rose-500/20 to-transparent" },
  { title: "Freelancers", desc: "Show clients exactly what's wrong — and prove your fixes worked — with before/after visual evidence.", accent: "from-blue-500/20 to-transparent" },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["Full website audits", "AI-powered inspection", "CLI + IDE + Web", "Screenshots & recordings", "SEO & performance checks"],
    cta: "Start auditing — it's free",
    href: "/sign-up",
    highlight: false,
  },
  {
    name: "Starter",
    price: "$9",
    period: "/ month",
    features: ["2,000 audits / month", "Priority queue", "Video recording", "Email support", "Everything in Free"],
    cta: "Coming soon",
    href: "/sign-up",
    highlight: true,
    disabled: true,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/ month",
    features: ["10,000 audits / month", "Fastest queue", "Custom branding", "Team management", "Everything in Starter"],
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
    commands: [{ text: "npx deepsyte setup", copyable: true }],
    subTabs: [
      { id: "mac-linux", label: "macOS & Linux" },
      { id: "windows", label: "Windows" },
    ],
    subCommands: {
      "mac-linux": [
        { text: "# Or use the install script", comment: true },
        { text: "curl -fsSL https://www.deepsyte.com/install.sh | bash", copyable: true },
      ],
      "windows": [
        { text: "# Or use the PowerShell script", comment: true },
        { text: "irm https://www.deepsyte.com/install.ps1 | iex", copyable: true },
      ],
    },
  },
  {
    id: "npm",
    label: "npm",
    comment: "# Install globally, then set up your IDE",
    commands: [
      { text: "npm install -g deepsyte", copyable: true },
      { text: "deepsyte setup", copyable: true },
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
      className="ml-2 p-2.5 rounded hover:bg-white/10 transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
      aria-label="Copy command"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />}
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
          <Terminal className="h-6 w-6 text-green-400" aria-hidden="true" />
          Up and running in 30 seconds
        </h2>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden">
          <div className="flex items-center gap-3 px-4 pt-3 pb-0 border-b border-white/10">
            <div className="flex gap-1.5 mr-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {quickStartTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`rounded-t-md px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] ${
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

          <div className="space-y-2 p-5 font-mono text-[0.95rem] leading-7 sm:text-base overflow-x-auto">
            {tab.comment && <div className="text-base text-gray-400">{tab.comment}</div>}
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
                      className={`rounded-full px-3 py-2.5 text-sm transition-colors min-h-[44px] ${
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
                  <div key={i} className={`flex items-center justify-between group ${cmd.comment ? "text-sm text-gray-400" : ""}`}>
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

        <p className="mt-4 text-center text-base text-gray-400">
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
              <Eye className="h-4 w-4" aria-hidden="true" />
              Install free
            </Button>
          </Link>
          <Link href="/docs">
            <Button size="lg" variant="outline" className="h-12 gap-2 border-white/15 bg-white/[0.03] text-gray-100 hover:border-white/25 hover:bg-white/[0.08] hover:text-white text-base">
              See the docs
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#07070b] text-gray-100 overflow-x-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-green-500 focus:px-4 focus:py-2 focus:text-black focus:font-semibold">Skip to content</a>
      <Script
        id="json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Nav */}
      <header>
      <nav className="border-b border-white/[0.06] relative z-10 sticky top-0 bg-[#07070b]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 shadow-lg shadow-green-500/20 transition-shadow group-hover:shadow-green-500/40">
              <Eye className="h-[18px] w-[18px] text-white" strokeWidth={2.5} aria-hidden="true" />
            </div>
            <span className="font-[var(--font-heading)] text-[1.35rem] font-bold tracking-tight">DeepSyte</span>
          </Link>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2.5 text-gray-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-3">
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
        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.06] px-6 py-4 flex flex-col gap-3 bg-[#07070b]/95 backdrop-blur-xl">
            <Link href="/docs" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start text-[1.02rem] text-gray-400 hover:bg-white/5 hover:text-white">Docs</Button>
            </Link>
            <Link href="#pricing" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start text-[1.02rem] text-gray-400 hover:bg-white/5 hover:text-white">Pricing</Button>
            </Link>
            <Show when="signed-out">
              <Link href="/sign-in" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start text-[1.02rem] text-gray-400 hover:bg-white/5 hover:text-white">Sign in</Button>
              </Link>
              <Link href="/sign-up" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full bg-green-500 text-[1.02rem] font-semibold text-black hover:bg-green-400">
                  Start free
                </Button>
              </Link>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full bg-green-500 text-[1.02rem] font-semibold text-black hover:bg-green-400">Dashboard</Button>
              </Link>
            </Show>
          </div>
        )}
      </nav>
      </header>

      <main id="main">
      {/* Hero */}
      <section className="relative bg-radial-hero bg-grid-subtle overflow-hidden">
        <div className="mx-auto max-w-5xl px-6 pt-24 pb-20 text-center relative z-10">
          <div className="animate-fade-in-up">
            <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-green-500/20 bg-green-500/5 px-4 py-1.5 text-[0.96rem] text-green-400 sm:text-base">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              46+ AI inspection tools · Free forever
            </div>
          </div>

          <h1 className="font-[var(--font-heading)] text-5xl sm:text-6xl lg:text-[4.5rem] xl:text-[5rem] font-extrabold tracking-[-0.04em] mb-7 leading-[1.05]">
            See what your website{" "}
            <br />
            <span className="text-gradient">is really doing.</span>
          </h1>

          <p className="animate-fade-in-up delay-200 mx-auto mb-10 max-w-2xl text-[1.15rem] leading-relaxed text-gray-400 sm:text-[1.35rem]">
            DeepSyte audits your entire website with AI &mdash; catching SEO gaps, performance issues, broken pages, and accessibility failures before your customers find them.
          </p>

          <div className="animate-fade-in-up delay-300 flex items-center justify-center gap-4 flex-wrap">
            <Link href="/try">
              <Button size="lg" className="bg-green-500 hover:bg-green-400 text-black font-semibold gap-2 glow-green-pulse px-7 h-12 text-base">
                <Eye className="h-4 w-4" aria-hidden="true" />
                Audit my site free
              </Button>
            </Link>
            <Link href="/docs">
              <Button size="lg" variant="outline" className="h-12 gap-2 border-white/15 bg-white/[0.03] text-gray-100 hover:border-white/25 hover:bg-white/[0.08] hover:text-white text-base">
                How it works
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
          <p className="animate-fade-in-up delay-300 mt-4 text-base text-gray-400">No credit card. No signup to try. Free forever.</p>

          {/* Hero video */}
          <div className="animate-fade-in-up delay-400 mt-14 mx-auto max-w-4xl rounded-xl overflow-hidden border border-white/10 shadow-2xl shadow-green-500/5">
            <video autoPlay loop muted playsInline preload="auto" poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1920 1080'%3E%3Crect fill='%23111' width='1920' height='1080'/%3E%3C/svg%3E" className="w-full h-auto">
              <source src={HERO_VIDEO_URL} type="video/mp4" />
            </video>
          </div>

          {/* Works with */}
          <div className="animate-fade-in delay-500 mt-14 flex items-center justify-center gap-3 flex-wrap">
            <span className="mr-2 text-base font-medium tracking-widest text-gray-400 uppercase">Works with</span>
            {["Cursor", "Windsurf", "VS Code", "Claude Desktop", "Shopify", "Any website"].map((ide) => (
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
            <span key={i} className="flex shrink-0 items-center gap-2 text-[0.96rem] text-gray-400 sm:text-base">
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
            Without deep inspection, you&apos;re <span className="text-gradient-warm">guessing</span>
          </h2>
          <p className="text-gray-400 text-lg text-center mb-14 max-w-xl mx-auto">
            The problem isn&apos;t just visibility. It&apos;s knowing what&apos;s actually happening on your site.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Old Way */}
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-7">
              <div className="flex items-center gap-2 mb-6">
                <X className="h-5 w-5 text-red-400" aria-hidden="true" />
                <h3 className="font-[var(--font-heading)] font-bold text-xl text-red-400">The old way</h3>
              </div>
              <ul className="space-y-3.5">
                {oldWay.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-base text-gray-400">
                    <X className="h-4 w-4 text-red-500/50 shrink-0 mt-1" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* New Way */}
            <div className="rounded-xl border border-green-500/20 bg-green-500/[0.03] p-7">
              <div className="flex items-center gap-2 mb-6">
                <Zap className="h-5 w-5 text-green-400" aria-hidden="true" />
                <h3 className="font-[var(--font-heading)] font-bold text-xl text-green-400">With DeepSyte</h3>
              </div>
              <ul className="space-y-3.5">
                {newWay.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-base text-gray-300">
                    <Check className="h-4 w-4 text-green-400 shrink-0 mt-1" aria-hidden="true" />
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
            Point. Inspect. Prove.
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
                Ask a question. Get the answer.
              </h2>
              <p className="mb-4 text-[1.1rem] leading-relaxed text-gray-400 sm:text-xl">
                No technical skills required. Just tell DeepSyte what you want to know about your website.
              </p>
              <p className="mb-8 text-[1.1rem] leading-relaxed text-gray-400 sm:text-xl">
                For developers, it works inside your IDE. For everyone else, it works right here on the web.
              </p>
              <Link href="/sign-up">
                <Button className="bg-green-500 hover:bg-green-400 text-black font-semibold gap-2">
                  Try it free
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </Link>
            </div>
            <div className="space-y-5 rounded-xl border border-white/10 bg-white/[0.02] p-6 font-mono text-[0.96rem] leading-7 sm:text-base">
              <div className="flex gap-3">
                <span className="text-gray-400 shrink-0">You:</span>
                <span className="text-gray-200">Is my checkout page working? And check if my SEO is set up right.</span>
              </div>
              <div className="flex gap-3">
                <span className="text-green-400 shrink-0 font-semibold">DeepSyte:</span>
                <span className="text-gray-400">I&apos;ll navigate through your checkout flow like a real customer, and audit your SEO setup across every page.</span>
              </div>
              <div className="flex gap-3">
                <span className="text-green-400 shrink-0 font-semibold">DeepSyte:</span>
                <span className="text-gray-400">Found 3 issues: your checkout button is hidden on mobile, two pages are missing meta descriptions, and your largest image is slowing load time by 2.3 seconds. Here&apos;s the evidence.</span>
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
            Built for how you actually work
          </h2>
          <p className="text-gray-400 text-lg text-center mb-14 max-w-xl mx-auto">
            Whether you&apos;re shipping code or selling products, DeepSyte shows you what&apos;s happening on your site.
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
            Everything you need to audit any website
          </h2>
          <p className="text-gray-400 text-lg text-center mb-14 max-w-xl mx-auto">
            DeepSyte covers SEO, performance, accessibility, visuals, and functionality in one platform you can actually trust.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 transition-all duration-300 hover:border-green-500/20 hover:bg-green-500/[0.02] group">
                <f.icon className="h-7 w-7 text-green-400/70 mb-4 group-hover:text-green-400 transition-colors" aria-hidden="true" />
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
          <Shield className="h-12 w-12 text-green-400 mx-auto mb-6" aria-hidden="true" />
          <h2 className="font-[var(--font-heading)] text-4xl sm:text-5xl font-bold mb-5 tracking-[-0.03em]">
            Start free. See what you&apos;ve been missing.
          </h2>
          <p className="text-gray-400 text-xl leading-relaxed max-w-xl mx-auto mb-4">
            Most website issues hide in plain sight. Slow pages, broken links, missing SEO, accessibility gaps &mdash; you just need something that actually looks.
          </p>
          <p className="text-gray-400 text-xl leading-relaxed max-w-xl mx-auto mb-10">
            DeepSyte inspects your site with AI, shows you the evidence, and helps you fix what matters.
            <br />
            <span className="text-white font-medium">See deeper. Fix faster. Prove it worked.</span>
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="bg-green-500 hover:bg-green-400 text-black font-semibold gap-2 px-8 h-12 text-base">
              <Eye className="h-4 w-4" aria-hidden="true" />
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
            Most people never need to leave the free plan. Paid tiers add priority queues and team features when you&apos;re ready.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map((p) => (
              <div key={p.name} className={`rounded-xl border p-6 flex flex-col ${
                p.highlight
                  ? "border-green-500/40 bg-green-500/[0.04] ring-1 ring-green-500/20"
                  : "border-white/[0.08] bg-white/[0.02]"
              }`}>
                {p.highlight && (
                  <span className="inline-block text-sm font-semibold text-green-400 bg-green-500/10 rounded-full px-3 py-1 mb-4 w-fit">
                    Most popular
                  </span>
                )}
                <h3 className="font-[var(--font-heading)] font-bold text-xl">{p.name}</h3>
                <div className="flex items-baseline gap-1 mt-2 mb-4">
                  <span className="text-5xl font-bold tracking-tight">{p.price}</span>
                  <span className="text-gray-400 text-base">{p.period}</span>
                </div>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2.5 text-base text-gray-400">
                      <Check className="h-4 w-4 text-green-400/70 shrink-0" aria-hidden="true" />
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
            Your website has stories to tell.
          </h2>
          <p className="text-gray-400 text-xl mb-3 max-w-xl mx-auto">
            Stop guessing what&apos;s happening on your site.
          </p>
          <p className="text-gray-400 text-xl mb-10 max-w-xl mx-auto">
            DeepSyte shows you &mdash; with screenshots, findings, and evidence. The setup takes two minutes. The first audit is free.
            <br />
            <span className="text-white font-medium">See deeper.</span>
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="bg-green-500 hover:bg-green-400 text-black font-semibold gap-2 glow-green-pulse px-8 h-12 text-base">
              <Eye className="h-4 w-4" aria-hidden="true" />
              Start free
            </Button>
          </Link>
        </div>
      </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-green-400/15 to-emerald-600/15 border border-green-500/10">
                  <Eye className="h-3.5 w-3.5 text-green-400" aria-hidden="true" />
                </div>
                <span className="font-[var(--font-heading)] text-base font-bold">DeepSyte</span>
              </div>
              <p className="text-sm text-gray-400 sm:text-base">See deeper.</p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[0.96rem] text-gray-400 sm:gap-8 sm:text-base">
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
          <div className="mt-8 border-t border-white/[0.06] pt-6 text-sm text-gray-400">
            &copy; 2026 DeepSyte. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
