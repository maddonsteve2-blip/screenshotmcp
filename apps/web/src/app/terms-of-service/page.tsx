import type { Metadata } from "next";
import Link from "next/link";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNavAuth } from "@/components/marketing-nav-auth";

export const metadata: Metadata = {
  title: "Terms of Service | ScreenshotsMCP",
  description: "Terms of Service for ScreenshotsMCP.",
};

const sections = [
  {
    title: "Acceptance of terms",
    body: [
      "By accessing or using ScreenshotsMCP, you agree to these Terms of Service. If you do not agree to these terms, do not use the service.",
    ],
  },
  {
    title: "Use of the service",
    body: [
      "ScreenshotsMCP provides browser automation, screenshots, recordings, audits, developer tools, APIs, MCP integrations, and related services. You may use the service only in compliance with applicable laws, these terms, and any documentation or usage limits we provide.",
      "You are responsible for the content you submit, the websites and systems you access, and ensuring you have all necessary rights and permissions for the workflows you run.",
    ],
  },
  {
    title: "Accounts and authentication",
    body: [
      "You are responsible for maintaining the confidentiality of your account credentials, API keys, and any connected authentication methods. You are also responsible for all activity that occurs under your account.",
      "If you sign in through Google or another identity provider, you authorize us to use the account information needed to authenticate you and operate your ScreenshotsMCP account.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "You may not use ScreenshotsMCP to violate the law, infringe the rights of others, access systems without authorization, distribute malware, interfere with service operation, or conduct abusive, deceptive, or harmful activity.",
      "We may suspend or terminate accounts that violate these terms, create security risks, or misuse the platform.",
    ],
  },
  {
    title: "Customer data and content",
    body: [
      "You retain responsibility for the data, websites, credentials, screenshots, recordings, logs, and other content you submit to or process through the service.",
      "You grant us the limited rights necessary to host, process, transmit, store, and display that content solely for the purpose of operating, securing, supporting, and improving ScreenshotsMCP.",
    ],
  },
  {
    title: "Third-party services",
    body: [
      "ScreenshotsMCP may integrate with third-party services such as Google, Clerk, cloud infrastructure, storage, analytics, and billing providers. Your use of those services may also be subject to their separate terms and policies.",
    ],
  },
  {
    title: "Fees and billing",
    body: [
      "Some ScreenshotsMCP features may be free, while others may require payment. If you purchase a paid plan, you agree to pay the applicable fees and any taxes. Fees are non-refundable except where required by law or expressly stated otherwise.",
    ],
  },
  {
    title: "Termination",
    body: [
      "You may stop using the service at any time. We may suspend or terminate access at any time if necessary to protect the service, comply with the law, address abuse, or enforce these terms.",
    ],
  },
  {
    title: "Disclaimers and limitation of liability",
    body: [
      "ScreenshotsMCP is provided on an as-is and as-available basis. To the maximum extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, non-infringement, and uninterrupted availability.",
      "To the maximum extent permitted by law, ScreenshotsMCP and its affiliates will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of data, profits, revenues, goodwill, or business opportunities.",
    ],
  },
  {
    title: "Changes to these terms",
    body: [
      "We may update these Terms of Service from time to time. If we make material changes, we may provide notice through the service or by other reasonable means. Continued use of the service after an update means you accept the revised terms.",
    ],
  },
  {
    title: "Contact",
    body: [
      "If you have questions about these Terms of Service, contact us at hello@screenshotsmcp.com.",
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#07070b] text-gray-100">
      <nav className="border-b border-white/[0.06] bg-[#07070b]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Camera className="h-5 w-5 text-green-400" />
            <span className="font-[var(--font-heading)] text-[1.35rem] font-bold tracking-tight">ScreenshotsMCP</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/privacy-policy">
              <Button variant="ghost" className="text-[1.02rem] text-gray-400 hover:bg-white/5 hover:text-white sm:text-lg">
                Privacy
              </Button>
            </Link>
            <MarketingNavAuth variant="emerald" />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <div className="mb-12 space-y-4">
          <p className="text-base font-medium uppercase tracking-[0.24em] text-green-400">Legal</p>
          <h1 className="font-[var(--font-heading)] text-4xl font-bold tracking-[-0.03em] sm:text-5xl md:text-[3.5rem]">
            Terms of Service
          </h1>
          <p className="max-w-3xl text-[1.1rem] leading-relaxed text-gray-400 sm:text-[1.28rem]">
            These Terms of Service govern your use of ScreenshotsMCP, including our website, dashboard, APIs, CLI, MCP tools,
            browser automation features, and related services.
          </p>
          <p className="text-base text-gray-500">Last updated: April 15, 2026</p>
        </div>

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
              <h2 className="mb-4 font-[var(--font-heading)] text-[1.75rem] font-semibold tracking-[-0.02em] sm:text-[2rem]">
                {section.title}
              </h2>
              <div className="space-y-4 text-[1.05rem] leading-8 text-gray-300 sm:text-[1.1rem]">
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
