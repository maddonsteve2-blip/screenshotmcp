import type { Metadata } from "next";
import { Outfit, Sora } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialogHost } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" });
const sora = Sora({ subsets: ["latin"], variable: "--font-heading", weight: ["400", "600", "700", "800"] });

function envValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

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
    site: "@screenshotsmcp",
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
  const publishableKey = envValue(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const signInUrl = envValue(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL) ?? "/sign-in";
  const signUpUrl = envValue(process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL) ?? "/sign-up";
  const signInFallbackRedirectUrl = envValue(process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL) ?? "/dashboard";
  const signUpFallbackRedirectUrl = envValue(process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL) ?? "/dashboard";

  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", outfit.variable, sora.variable)}>
      <body className={`${outfit.className} flex flex-col min-h-screen`}>
        <ClerkProvider
          publishableKey={publishableKey}
          signInUrl={signInUrl}
          signUpUrl={signUpUrl}
          signInFallbackRedirectUrl={signInFallbackRedirectUrl}
          signUpFallbackRedirectUrl={signUpFallbackRedirectUrl}
        >
          <TooltipProvider>
            <RootProvider>
              {children}
              <ConfirmDialogHost />
              <Toaster position="bottom-right" richColors closeButton theme="system" />
            </RootProvider>
          </TooltipProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
