import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ScreenshotsMCP – Screenshot API + MCP Server",
  description:
    "Capture screenshots of any URL via REST API or MCP tool. Works with Claude, Cursor, Windsurf and more.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
