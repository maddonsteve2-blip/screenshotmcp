"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Loader2, ArrowRight, AlertCircle, Check } from "lucide-react";
import { Show } from "@clerk/nextjs";

type Trial = {
  hourRemaining: number;
  hourLimit: number;
  dayRemaining: number;
  dayLimit: number;
};

type Result = {
  publicUrl: string;
  capturedUrl: string;
  elapsedMs: number;
};

export default function TryPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function handleCapture(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    const normalized = url.startsWith("http://") || url.startsWith("https://")
      ? url
      : `https://${url}`;

    const started = Date.now();

    try {
      const createRes = await fetch("/api/try-screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
      });
      const createData = await createRes.json();

      if (!createRes.ok) {
        setError(createData.error ?? `Request failed (${createRes.status})`);
        if (typeof createData.hourRemaining === "number") {
          setTrial({
            hourRemaining: createData.hourRemaining,
            hourLimit: 3,
            dayRemaining: createData.dayRemaining ?? 0,
            dayLimit: 20,
          });
        }
        setLoading(false);
        return;
      }

      if (createData.trial) setTrial(createData.trial);

      const jobId: string = createData.id ?? createData.jobId;
      if (!jobId) {
        setError("Upstream did not return a job id");
        setLoading(false);
        return;
      }

      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const pollRes = await fetch(`/api/try-screenshot/${jobId}`);
        if (!pollRes.ok) continue;
        const pollData = await pollRes.json();
        if (pollData.status === "done" && (pollData.url || pollData.publicUrl)) {
          setResult({
            publicUrl: pollData.url ?? pollData.publicUrl,
            capturedUrl: normalized,
            elapsedMs: Date.now() - started,
          });
          setLoading(false);
          return;
        }
        if (pollData.status === "failed") {
          setError(pollData.errorMessage ?? "Screenshot failed");
          setLoading(false);
          return;
        }
      }

      setError("Timed out waiting for screenshot. Try again.");
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07070b] text-gray-100">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-gray-400">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            Free trial — no signup required
          </div>
          <h1 className="font-[var(--font-heading)] text-4xl font-bold tracking-[-0.02em] sm:text-5xl">
            Screenshot any site in 5 seconds
          </h1>
          <p className="mt-3 text-gray-400">
            Paste a URL. Get a real browser screenshot back. No account, no credit card.
          </p>
        </div>

        <form
          onSubmit={handleCapture}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md sm:p-6"
        >
          <label htmlFor="try-url" className="sr-only">
            URL
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="try-url"
              type="text"
              inputMode="url"
              placeholder="https://vercel.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              className="h-12 flex-1 border-white/15 bg-black/30 text-base text-white placeholder:text-gray-500"
              required
            />
            <Button
              type="submit"
              size="lg"
              disabled={loading || !url.trim()}
              className="h-12 gap-2 bg-green-500 px-6 font-semibold text-black hover:bg-green-400"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Capturing…
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  Capture
                </>
              )}
            </Button>
          </div>

          {trial && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-400">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-green-400" />
                {trial.hourRemaining} of {trial.hourLimit} captures left this hour
              </span>
              <span className="text-gray-600">·</span>
              <span>
                {trial.dayRemaining} of {trial.dayLimit} left today
              </span>
            </div>
          )}
        </form>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
            <div>
              <p>{error}</p>
              {trial?.hourRemaining === 0 && (
                <Link
                  href="/sign-up"
                  className="mt-2 inline-flex items-center gap-1 text-red-100 underline underline-offset-2 hover:text-white"
                >
                  Sign up free for unlimited screenshots
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        )}

        {result && (
          <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm">
              <div className="truncate text-gray-400">
                {result.capturedUrl}
              </div>
              <div className="flex-shrink-0 text-xs text-gray-500">
                {(result.elapsedMs / 1000).toFixed(1)}s
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.publicUrl}
              alt={`Screenshot of ${result.capturedUrl}`}
              className="block w-full"
            />
            <div className="flex flex-col items-start justify-between gap-3 border-t border-white/10 px-4 py-3 sm:flex-row sm:items-center">
              <a
                href={result.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-400 underline underline-offset-2 hover:text-white"
              >
                Open image ↗
              </a>
              <Link href="/sign-up">
                <Button size="sm" className="gap-1.5 bg-green-500 text-black hover:bg-green-400">
                  Sign up free for unlimited
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        <div className="mt-12 rounded-xl border border-white/[0.06] bg-gradient-to-b from-green-500/[0.03] to-transparent p-6 text-center">
          <Show when="signed-out">
            <p className="text-gray-400">
              Sign up to unlock 46+ browser tools — full-page, mobile, diffs, auth testing, SEO audits, and more.
            </p>
          </Show>
          <Show when="signed-in">
            <p className="text-gray-400">
              You have full access to 46+ browser tools — full-page, mobile, diffs, auth testing, SEO audits, and more.
            </p>
          </Show>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Show when="signed-out">
              <Link href="/sign-up">
                <Button className="gap-2 bg-green-500 text-black hover:bg-green-400">
                  Start free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard">
                <Button className="gap-2 bg-green-500 text-black hover:bg-green-400">
                  Open dashboard
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </Show>
            <Link href="/docs">
              <Button
                variant="outline"
                className="gap-2 border-white/15 bg-white/[0.03] text-gray-100 hover:border-white/25 hover:bg-white/[0.08]"
              >
                See the docs
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
