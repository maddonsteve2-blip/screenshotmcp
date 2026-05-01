import type { Metadata } from "next";
import Link from "next/link";
import { Eye, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Security — DeepSyte",
  description:
    "DeepSyte security practices, responsible disclosure policy, and how to contact our security team.",
  alternates: { canonical: "/security" },
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/[0.06] py-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 shadow-lg shadow-green-500/20 transition-shadow group-hover:shadow-green-500/40">
              <Eye className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
            </div>
            DeepSyte
          </Link>
          <nav className="flex gap-4 text-sm text-gray-400">
            <Link href="/status" className="hover:text-white transition-colors">Status</Link>
            <Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms-of-service" className="hover:text-white transition-colors">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="flex items-center gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-6">
          <ShieldCheck className="h-6 w-6 text-sky-300" />
          <div>
            <h1 className="text-xl font-semibold">Security</h1>
            <p className="text-sm text-gray-400">
              How we handle your data, how to report vulnerabilities, and how we respond.
            </p>
          </div>
        </div>

        <section className="mt-10 space-y-3 text-sm text-gray-300">
          <h2 className="text-lg font-semibold text-white">Contact</h2>
          <p>
            For security issues, email{" "}
            <a href="mailto:security@deepsyte.com" className="text-white underline">
              security@deepsyte.com
            </a>
            . We aim to acknowledge reports within one business day and will keep you updated through
            triage, remediation, and disclosure. Please do not file public GitHub issues for
            suspected vulnerabilities.
          </p>
        </section>

        <section className="mt-10 space-y-3 text-sm text-gray-300">
          <h2 className="text-lg font-semibold text-white">Responsible disclosure</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Give us a reasonable window to triage and remediate before any public disclosure.</li>
            <li>Do not access data that does not belong to your account, or attempt denial-of-service testing against shared infrastructure.</li>
            <li>Do not exfiltrate or retain user data you encounter during testing.</li>
            <li>We do not currently run a paid bug bounty, but we will publicly credit researchers who follow this policy.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-3 text-sm text-gray-300">
          <h2 className="text-lg font-semibold text-white">Data protection</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>All API traffic is TLS-terminated; internal calls use mutually authenticated shared secrets.</li>
            <li>Customer API keys are stored hashed (SHA-256); the raw key is never retrievable once issued.</li>
            <li>Screenshots and recordings are uploaded to object storage with short-lived signed URLs for retrieval.</li>
            <li>Console logs and network events captured during runs are scoped to the authenticated user and are never shared across accounts.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-3 text-sm text-gray-300">
          <h2 className="text-lg font-semibold text-white">Operational transparency</h2>
          <p>
            Every API response includes a <code className="rounded bg-white/5 px-1 py-0.5">X-Request-ID</code>{" "}
            you can include when contacting support. Production health is continuously monitored and
            published on <Link href="/status" className="underline">/status</Link>. Customer-visible
            product changes ship through <Link href="/changelog" className="underline">/changelog</Link>.
          </p>
        </section>
      </main>
    </div>
  );
}
