"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderSearch, Image as ImageIcon, Video } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard/artifacts", label: "All", icon: FolderSearch },
  { href: "/dashboard/screenshots", label: "Captures", icon: ImageIcon },
  { href: "/dashboard/recordings", label: "Replays", icon: Video },
];

export function LibraryTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Library sections"
      className="flex items-center gap-1 rounded-md border bg-muted/40 p-1 w-fit"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
