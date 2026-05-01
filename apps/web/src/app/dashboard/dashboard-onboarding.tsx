import Link from "next/link";
import { ArrowRight, Key, Download, Play, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PageContainer } from "@/components/page-container";

const steps = [
  {
    number: 1,
    icon: Key,
    title: "Create your first API key",
    description:
      "API keys authenticate every request from the CLI, MCP server, and REST API. You can revoke them anytime.",
    href: "/dashboard/keys",
    cta: "Create API key",
  },
  {
    number: 2,
    icon: Download,
    title: "Connect your agent",
    description:
      "Install the MCP server in Claude, Cursor, or Windsurf, or use the npx CLI in any terminal. Both ship with ready-to-paste config.",
    href: "/dashboard/install",
    cta: "Install DeepSyte",
  },
  {
    number: 3,
    icon: Play,
    title: "Try your first capture",
    description:
      "Run a screenshot in the Playground to see an end-to-end flow — no terminal required.",
    href: "/dashboard/playground",
    cta: "Open Playground",
  },
];

export function DashboardOnboarding({ firstName }: { firstName?: string | null }) {
  return (
    <PageContainer width="data" className="flex flex-col gap-8">
      <div className="flex flex-col gap-2 max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary w-fit">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Welcome{firstName ? `, ${firstName}` : ""}
        </div>
        <h1 className="text-2xl font-bold sm:text-3xl">Let&apos;s get your first screenshot.</h1>
        <p className="text-muted-foreground">
          Three quick steps and you&apos;ll have browser truth flowing into your agent or scripts. Everything is free to try.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {steps.map((step) => (
          <Card key={step.number} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <step.icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Step {step.number}
                </span>
              </div>
              <CardTitle className="mt-3 text-lg">{step.title}</CardTitle>
              <CardDescription>{step.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Link
                href={step.href}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
              >
                {step.cta}
                <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prefer to explore on your own?</CardTitle>
          <CardDescription>
            Read the quickstart, or skip to any dashboard section — you can always return to this page to finish setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link
            href="/docs/getting-started"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            Quickstart docs
          </Link>
          <Link
            href="/dashboard/runs"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Browse runs
          </Link>
          <Link
            href="/dashboard/artifacts"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Open library
          </Link>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
