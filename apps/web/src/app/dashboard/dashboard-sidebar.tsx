"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, Download, FileText, FolderSearch, type LucideIcon, Image, Key, LayoutDashboard, ListVideo, Play, ScrollText, Settings, Video } from "lucide-react";
import { cn } from "@/lib/utils";

type NavChild = {
  href: string;
  label: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: "exact" | "prefix";
  activePrefixes?: string[];
  children?: NavChild[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Review",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, match: "exact" },
      { href: "/dashboard/runs", label: "Runs", icon: ListVideo, match: "prefix" },
      {
        href: "/dashboard/artifacts",
        label: "Artifacts",
        icon: FolderSearch,
        match: "prefix",
        activePrefixes: ["/dashboard/screenshots", "/dashboard/recordings"],
        children: [
          { href: "/dashboard/screenshots", label: "Captures" },
          { href: "/dashboard/recordings", label: "Replays" },
        ],
      },
      { href: "/dashboard/playground", label: "Playground", icon: Play, match: "exact" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/dashboard/analytics", label: "Usage", icon: BarChart3, match: "exact" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/dashboard/keys", label: "API Keys", icon: Key, match: "exact" },
      { href: "/dashboard/install", label: "Install", icon: Download, match: "exact" },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard, match: "exact" },
      { href: "/dashboard/settings", label: "Settings", icon: Settings, match: "exact" },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/dashboard/changelog", label: "Changelog", icon: ScrollText, match: "exact" },
      { href: "/docs", label: "Docs", icon: FileText, match: "prefix" },
    ],
  },
];

function matchesPath(pathname: string, item: Pick<NavItem, "href" | "match" | "activePrefixes">) {
  if (pathname === item.href) return true;

  if (item.match === "prefix" && pathname.startsWith(`${item.href}/`)) {
    return true;
  }

  return item.activePrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? false;
}

function childMatchesPath(pathname: string, child: NavChild) {
  return pathname === child.href || pathname.startsWith(`${child.href}/`);
}

export default function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 overflow-y-auto p-4 space-y-6">
      {navGroups.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = matchesPath(pathname, item);

              return (
                <div key={item.href} className="space-y-1">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "border border-primary/20 bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                  {item.children && (
                    <div className="ml-7 space-y-1">
                      {item.children.map((child) => {
                        const childActive = childMatchesPath(pathname, child);
                        const ChildIcon = child.label === "Captures" ? Image : Video;

                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            aria-current={childActive ? "page" : undefined}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors",
                              childActive
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
                            )}
                          >
                            <ChildIcon className="h-3.5 w-3.5" />
                            <span>{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
