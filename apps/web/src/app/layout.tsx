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
  title: "DeepSyte – AI-Powered Website Auditing",
  description:
    "See what your website is really doing. AI-powered auditing for SEO, performance, accessibility, and UX — for developers, store owners, and everyone in between.",
  metadataBase: new URL("https://www.deepsyte.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "DeepSyte – See what your website is really doing",
    description:
      "AI-powered website auditing for SEO, performance, accessibility, and UX. Works in your IDE, browser, or CLI. Free forever.",
    url: "https://www.deepsyte.com/",
    siteName: "DeepSyte",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@deepsyte",
    title: "DeepSyte – See what your website is really doing",
    description:
      "AI-powered website auditing for everyone. SEO, performance, accessibility, and UX — in your IDE, browser, or CLI. Free forever.",
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
      <head>
        <link rel="preload" href="https://pub-79ded844355643e1a17a61cb64962257.r2.dev/assets/hero-video.mp4" as="video" type="video/mp4" />
      </head>
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
