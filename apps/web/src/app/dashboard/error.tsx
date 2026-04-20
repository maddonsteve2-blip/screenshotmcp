"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[dashboard error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">This page ran into a problem</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Something went wrong loading this view. Try again, or go back to the overview.
            </p>
            {error.digest && (
              <p className="text-xs font-mono text-muted-foreground/80">
                Error ID: {error.digest}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            <Button onClick={reset} variant="default" size="sm">
              <RotateCcw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </Button>
            <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <Home className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Overview
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
