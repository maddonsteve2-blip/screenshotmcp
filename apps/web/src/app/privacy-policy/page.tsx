import type { Metadata } from "next";
import Link from "next/link";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Privacy Policy | ScreenshotsMCP",
  description: "Privacy Policy for ScreenshotsMCP, including how we handle Google OAuth account data.",
};

const sections = [
  {
    title: "Information we collect",
    body: [
      "We collect the information you provide directly to us, including account details, contact information, API key metadata, billing information, support requests, and the browser workflow data you choose to capture through ScreenshotsMCP.",
      "When you use ScreenshotsMCP to capture screenshots, recordings, logs, or other evidence, we process the data needed to provide those features, secure the service, and maintain your account.",
    ],
  },
  {
    title: "Google OAuth and Google user data",
    body: [
      "If you sign in with Google, we receive basic account information from Google, which may include your name, email address, profile image, and your Google account identifier.",
      "We use Google user data only to authenticate you, create and maintain your ScreenshotsMCP account, prevent abuse, and provide the features you request. We do not sell Google user data, and we do not use Google user data for advertising.",
      "We do not share Google user data with third parties except when necessary to operate the service, comply with the law, protect our rights, or with your explicit direction.",
    ],
  },
  {
    title: "How we use information",
    body: [
      "We use your information to operate, improve, secure, and support ScreenshotsMCP, including authenticating users, storing evidence from browser workflows, processing payments, responding to support requests, and enforcing our terms.",
      "We may also use aggregated or de-identified information to understand product usage and improve performance, reliability, and safety.",
    ],
  },
  {
    title: "How we share information",
    body: [
      "We may share information with service providers that help us run ScreenshotsMCP, such as hosting, authentication, analytics, billing, storage, and support infrastructure providers.",
      "We may also disclose information if required by law, to respond to legal requests, to investigate misuse, or to protect the rights, safety, and security of ScreenshotsMCP, our users, or others.",
    ],
  },
  {
    title: "Data retention",
    body: [
      "We retain personal information for as long as reasonably necessary to provide the service, comply with legal obligations, resolve disputes, and enforce our agreements.",
      "You may request deletion of your account and associated personal information by contacting us. Some data may be retained where required for security, fraud prevention, legal compliance, or legitimate business records.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You may update certain account information through the product interface. You may also revoke Google access at any time through your Google account settings.",
      "If you would like to request access, correction, or deletion of your information, contact us using the details below.",
    ],
  },
  {
    title: "Security",
    body: [
      "We use reasonable technical and organizational measures to protect information under our control. However, no method of transmission or storage is completely secure, and we cannot guarantee absolute security.",
    ],
  },
  {
    title: "Contact",
    body: [
      "If you have questions about this Privacy Policy or our handling of personal information, contact us at hello@screenshotsmcp.com.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#07070b] text-gray-100">
      <nav className="border-b border-white/[0.06] bg-[#07070b]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Camera className="h-5 w-5 text-green-400" />
            <span className="font-[var(--font-heading)] text-xl font-bold tracking-tight">ScreenshotsMCP</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/terms-of-service">
              <Button variant="ghost" className="text-gray-400 hover:bg-white/5 hover:text-white">
                Terms
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button className="bg-green-500 font-semibold text-black hover:bg-green-400">Sign in</Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <div className="mb-12 space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-green-400">Legal</p>
          <h1 className="font-[var(--font-heading)] text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="max-w-3xl text-lg leading-relaxed text-gray-400">
            This Privacy Policy explains how ScreenshotsMCP collects, uses, shares, and protects information when you use our website,
            dashboard, API, MCP tools, CLI, and related services, including when you sign in with Google.
          </p>
          <p className="text-sm text-gray-500">Last updated: April 15, 2026</p>
        </div>

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
              <h2 className="mb-4 font-[var(--font-heading)] text-2xl font-semibold tracking-[-0.02em]">
                {section.title}
              </h2>
              <div className="space-y-4 text-base leading-7 text-gray-300">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
