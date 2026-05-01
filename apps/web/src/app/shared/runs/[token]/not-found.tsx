import Link from "next/link";
import { Eye, LinkIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function SharedRunNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Eye className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="font-semibold">DeepSyte</span>
        </Link>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <LinkIcon className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Share link not available</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            This share link has expired, been revoked, or never existed. Ask whoever sent it to create a new one, or try the product yourself.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/try" className={cn(buttonVariants({ variant: "default" }))}>
            Try DeepSyte free
          </Link>
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
