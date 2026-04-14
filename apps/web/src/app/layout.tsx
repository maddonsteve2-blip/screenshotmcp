import type { Metadata } from "next";
import { Outfit, Sora } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";
import { cn } from "@/lib/utils";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" });
const sora = Sora({ subsets: ["latin"], variable: "--font-heading", weight: ["400", "600", "700", "800"] });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ScreenshotsMCP – Screenshot API + MCP Server",
  description:
    "Give your AI coding assistant eyes. Tools for screenshots, browser automation, SEO audits, and performance testing. Works with Claude and VS Code.",
  metadataBase: new URL("https://www.screenshotmcp.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "ScreenshotsMCP – Give your AI coding assistant eyes",
    description:
      "46+ AI-powered tools for screenshots, browser automation, SEO audits, performance testing, and accessibility checks. Free forever.",
    url: "https://www.screenshotmcp.com",
    siteName: "ScreenshotsMCP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ScreenshotsMCP – Give your AI coding assistant eyes",
    description:
      "46+ AI-powered tools for screenshots, browser automation, SEO audits, and more. Free forever.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", outfit.variable, sora.variable)}>
      <body className={`${outfit.className} flex flex-col min-h-screen`}>
        <ClerkProvider>
          <RootProvider>
            {children}
          </RootProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
