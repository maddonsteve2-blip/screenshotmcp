"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ScreenshotItem } from "../run-detail-types";

export function CapturesTab({ screenshots }: { screenshots: ScreenshotItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Session captures</CardTitle>
        <CardDescription>Persisted screenshots captured during this run.</CardDescription>
      </CardHeader>
      <CardContent>
        {screenshots.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
            No captures were persisted for this run yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {screenshots.map((shot) => (
              <Card key={shot.id} className="overflow-hidden">
                <div className="relative h-56 overflow-hidden bg-muted md:h-64">
                  {shot.publicUrl ? (
                    <Image
                      src={shot.publicUrl}
                      alt={shot.url}
                      fill
                      unoptimized
                      sizes="(min-width: 1280px) 50vw, 100vw"
                      className="object-cover object-top"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Pending</div>
                  )}
                </div>
                <CardContent className="flex flex-col gap-3 p-4">
                  <p className="truncate text-sm text-muted-foreground" title={shot.url}>{shot.url}</p>
                  <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                    <span>
                      {shot.width}×{shot.height ?? "—"} · {shot.format.toUpperCase()}
                    </span>
                    {shot.publicUrl && (
                      <Link
                        href={shot.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
