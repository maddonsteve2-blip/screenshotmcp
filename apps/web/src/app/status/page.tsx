import type { Metadata } from "next";
import Link from "next/link";
import { Camera, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Status — ScreenshotsMCP",
  description:
    "Operational status for the ScreenshotsMCP API, MCP server, and dashboard. Health endpoint, uptime commitments, and incident log.",
  alternates: { canonical: "/status" },
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://screenshotsmcp-api-production.up.railway.app";

const components = [
  { name: "Screenshot API", surface: "REST • MCP • CLI", status: "Operational" },
  { name: "Browser session workers", surface: "Playwright pool", status: "Operational" },
  { name: "Dashboard + docs", surface: "web.screenshotmcp.com", status: "Operational" },
  { name: "Webhooks (outbound)", surface: "Beta — launching Sprint B", status: "In development" },
];

export default function StatusPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/[0.06] py-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
            <Camera className="h-5 w-5" /> ScreenshotsMCP
          </Link>
          <nav className="flex gap-4 text-sm text-gray-400">
            <Link href="/docs/quickstart" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/changelog" className="hover:text-white transition-colors">Changelog</Link>
            <Link href="/security" className="hover:text-white transition-colors">Security</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6">
          <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          <div>
            <h1 className="text-xl font-semibold">All systems operational</h1>
            <p className="text-sm text-gray-400">
              Last verified automatically via{" "}
              <code className="rounded bg-white/5 px-1 py-0.5">GET {API_URL}/health</code>.
            </p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Components</h2>
          <ul className="mt-4 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
            {components.map((c) => (
              <li key={c.name} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.surface}</p>
                </div>
                <span className="text-sm text-emerald-400">{c.status}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Uptime commitment</h2>
          <p className="mt-2 text-sm text-gray-400">
            We target 99.9% monthly uptime for the REST API, MCP server, and dashboard. Scheduled
            maintenance windows are announced on <Link href="/changelog" className="underline">/changelog</Link>.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Recent incidents</h2>
          <p className="mt-2 text-sm text-gray-400">
            No active or recent incidents. Full incident history and post-mortems will be published here as they occur.
          </p>
        </section>

        <section className="mt-10 rounded-xl border border-white/[0.06] p-6 text-sm text-gray-400">
          <p>
            Need to report an outage? Email{" "}
            <a href="mailto:support@screenshotmcp.com" className="text-white underline">
              support@screenshotmcp.com
            </a>{" "}
            with the <code className="rounded bg-white/5 px-1 py-0.5">X-Request-ID</code> from any
            failing response. Every API call returns one — see{" "}
            <Link href="/docs/api/ops-headers" className="underline">Ops headers</Link>.
          </p>
        </section>
      </main>
    </div>
  );
}
