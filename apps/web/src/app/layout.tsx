import type { Metadata } from "next";
import { Inter, Roboto } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const robotoHeading = Roboto({ subsets: ["latin"], variable: "--font-heading", weight: ["400", "500", "700"] });

export const dynamic = "force-dynamic";

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
    <html lang="en" suppressHydrationWarning className={cn("font-sans", inter.variable, robotoHeading.variable)}>
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <ClerkProvider>
          <RootProvider>
            {children}
          </RootProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
