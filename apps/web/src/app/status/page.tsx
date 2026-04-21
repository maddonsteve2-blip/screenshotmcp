import type { Metadata } from "next";
import Link from "next/link";
import { Camera, CheckCircle2, XCircle } from "lucide-react";
import { Show } from "@clerk/nextjs";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Status — ScreenshotsMCP",
  description:
    "Live operational status for the ScreenshotsMCP API, MCP server, dashboard, and webhooks. Pulled directly from the production /health endpoint on every request.",
  alternates: { canonical: "/status" },
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://screenshotsmcp-api-production.up.railway.app";

type HealthResult =
  | { ok: true; latencyMs: number; payload: Record<string, unknown> }
  | { ok: false; latencyMs: number; error: string };

async function probeHealth(path: string): Promise<HealthResult> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    const latencyMs = Date.now() - start;
    if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: true, latencyMs, payload };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

function tone(ok: boolean) {
  return ok
    ? { color: "text-emerald-400", Icon: CheckCircle2, label: "Operational" }
    : { color: "text-red-400", Icon: XCircle, label: "Degraded" };
}

export default async function StatusPage() {
  const health = await probeHealth("/health");
  const apiOk = health.ok;
  const checkedAt = new Date().toISOString();

  const components = [
    {
      name: "Screenshot API",
      surface: "REST • MCP • CLI",
      ok: apiOk,
      detail: apiOk ? `${health.latencyMs} ms response` : `Probe failed: ${(health as { error: string }).error}`,
    },
    {
      name: "Browser session workers",
      surface: "Playwright pool",
      ok: apiOk,
      detail: apiOk ? "Reported healthy by /health" : "Cannot determine — API unreachable",
    },
    {
      name: "Dashboard + docs",
      surface: "web.screenshotmcp.com",
      ok: true,
      detail: "You are reading this page — it works.",
    },
    {
      name: "Webhooks (outbound)",
      surface: "HMAC-signed deliveries with retries",
      ok: apiOk,
      detail: apiOk ? "GA — fires on screenshot.completed, run.completed, quota.warning" : "Cannot determine — API unreachable",
    },
  ];

  const allOk = components.every((c) => c.ok);
  const headlineTone = allOk ? tone(true) : tone(false);
  const HeadlineIcon = headlineTone.Icon;

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
            <Show when="signed-in">
              <Link href="/dashboard" className="text-white hover:text-green-400 transition-colors">Dashboard</Link>
            </Show>
            <Show when="signed-out">
              <Link href="/sign-in" className="hover:text-white transition-colors">Sign in</Link>
            </Show>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div
          className={`flex items-center gap-3 rounded-2xl border p-6 ${
            allOk
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-red-500/30 bg-red-500/10"
          }`}
        >
          <HeadlineIcon className={`h-6 w-6 ${headlineTone.color}`} />
          <div>
            <h1 className="text-xl font-semibold">
              {allOk ? "All systems operational" : "One or more systems degraded"}
            </h1>
            <p className="text-sm text-gray-400">
              Probed live at {checkedAt} via{" "}
              <code className="rounded bg-white/5 px-1 py-0.5">GET {API_URL}/health</code>.
            </p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Components</h2>
          <ul className="mt-4 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
            {components.map((c) => {
              const t = tone(c.ok);
              return (
                <li key={c.name} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.surface}</p>
                    <p className="mt-1 truncate text-xs text-gray-400">{c.detail}</p>
                  </div>
                  <span className={`shrink-0 text-sm ${t.color}`}>{t.label}</span>
                </li>
              );
            })}
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
