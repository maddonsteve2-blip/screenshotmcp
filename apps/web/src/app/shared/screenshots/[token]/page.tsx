import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera } from "lucide-react";
import { SharedScreenshotViewer } from "./shared-screenshot-viewer";

export const dynamic = "force-dynamic";

type SharedScreenshot = {
  url: string;
  publicUrl: string;
  width: number;
  height: number | null;
  pageTitle: string | null;
  annotations: unknown[];
  sharedAt: string | null;
};

async function getShared(token: string): Promise<SharedScreenshot | null> {
  const res = await fetch(`/api/shared/screenshots/${encodeURIComponent(token)}`, {
    cache: "no-store",
  }).catch(() => null);
  if (!res || res.status === 404) return null;
  if (!res.ok) return null;
  return (await res.json()) as SharedScreenshot;
}

export async function generateMetadata({
  params,
}: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await getShared(token);
  if (!data) {
    return { title: "Shared screenshot not found — ScreenshotsMCP" };
  }
  return {
    title: `Shared screenshot · ${data.pageTitle ?? data.url} — ScreenshotsMCP`,
    description: `Read-only shared screenshot captured from ${data.url}`,
    openGraph: {
      title: data.pageTitle ?? `Shared screenshot · ${data.url}`,
      description: `Read-only shared screenshot captured from ${data.url}`,
      images: [{ url: data.publicUrl }],
    },
  };
}

export default async function SharedScreenshotPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getShared(token);

  if (!data) notFound();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="h-4 w-4" /> ScreenshotsMCP
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/try" className="text-neutral-400 hover:text-white">Try it</Link>
            <Link
              href="/sign-up"
              className="rounded-md bg-green-500 px-3 py-1.5 font-semibold text-black hover:bg-green-400"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-4 flex flex-col gap-1">
          {data.pageTitle && (
            <h1 className="text-lg font-semibold text-white">{data.pageTitle}</h1>
          )}
          <p className="break-all text-sm text-neutral-400" title={data.url}>{data.url}</p>
          {data.sharedAt && (
            <p className="text-xs text-neutral-500">
              Shared {new Date(data.sharedAt).toLocaleString()}
            </p>
          )}
        </div>

        <SharedScreenshotViewer
          src={data.publicUrl}
          width={data.width}
          height={data.height ?? 0}
          annotations={(data.annotations ?? []) as never[]}
        />

        <div className="mt-8 rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 text-center">
          <p className="text-sm text-neutral-400">
            Captured with <Link href="/" className="text-green-400 hover:underline">ScreenshotsMCP</Link>
            {" — "}
            the browser your AI can see through.
          </p>
        </div>
      </main>
    </div>
  );
}
