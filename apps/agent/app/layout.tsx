import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeepSyte Agent",
  description: "AI-powered web audit and browser automation agent",
  metadataBase: new URL("https://agent.deepsyte.com"),
  alternates: { canonical: "/" },
  openGraph: {
    title: "DeepSyte Agent",
    description: "AI-powered web audit and browser automation agent",
    type: "website",
    url: "https://agent.deepsyte.com",
    siteName: "DeepSyte Agent",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:text-sm"
        >
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
