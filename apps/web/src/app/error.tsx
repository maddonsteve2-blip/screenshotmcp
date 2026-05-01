"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to any error tracker the app wires up later.
    // eslint-disable-next-line no-console
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            We hit an unexpected error rendering this page. The team has been notified. Try again, or head back to safety.
          </p>
          {error.digest && (
            <p className="text-xs font-mono text-muted-foreground/80">
              Error ID: {error.digest}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button onClick={reset} variant="default">
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
            <Home className="mr-2 h-4 w-4" aria-hidden="true" />
            Back home
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Need help? Email{" "}
          <a href="mailto:support@deepsyte.com" className="underline underline-offset-2">
            support@deepsyte.com
          </a>
          {error.digest ? ` with the error ID above.` : "."}
        </p>
      </div>
    </div>
  );
}
