import Link from "next/link";
import { Camera, Home, FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <Camera className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="font-semibold">ScreenshotsMCP</span>
        </Link>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileQuestion className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            The page you&apos;re looking for doesn&apos;t exist or has moved. Check the URL, or head back to somewhere familiar.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/" className={cn(buttonVariants({ variant: "default" }))}>
            <Home className="mr-2 h-4 w-4" aria-hidden="true" />
            Back home
          </Link>
          <Link href="/docs" className={cn(buttonVariants({ variant: "outline" }))}>
            Browse docs
          </Link>
        </div>
      </div>
    </div>
  );
}
