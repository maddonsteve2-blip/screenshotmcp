"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, CreditCard, Download, FileText, Library, type LucideIcon, Image, Key, LayoutDashboard, ListVideo, Play, ScrollText, Settings, Video, Webhook } from "lucide-react";
import { DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDashboardWs } from "@/lib/use-dashboard-ws";

type RunSummary = { status?: string };

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
        label: "Library",
        icon: Library,
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
      { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook, match: "exact" },
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

export default function DashboardSidebar({ closeOnNavigate = false }: { closeOnNavigate?: boolean }) {
  const pathname = usePathname();
  const [activeRunCount, setActiveRunCount] = useState<number | null>(null);

  useDashboardWs<{ runs: RunSummary[] }>({
    subscription: { channel: "runs" },
    onMessage: (message) => {
      if (message.type !== "runs" || !message.data) return;
      const next = message.data.runs;
      if (Array.isArray(next)) {
        setActiveRunCount(next.filter((run) => run?.status === "active").length);
      }
    },
  });

  return (
    <nav className="flex-1 overflow-y-auto p-4 space-y-6">
      {navGroups.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="px-3 text-[0.82rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = matchesPath(pathname, item);
              const isRunsItem = item.href === "/dashboard/runs";
              const showActiveBadge = isRunsItem && activeRunCount !== null && activeRunCount > 0;
              const itemLink = (
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors",
                    active
                      ? "border border-primary/20 bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  {showActiveBadge && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                      title={`${activeRunCount} run${activeRunCount === 1 ? "" : "s"} currently active`}
                    >
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      </span>
                      {activeRunCount}
                    </span>
                  )}
                </Link>
              );

              return (
                <div key={item.href} className="space-y-1">
                  {closeOnNavigate ? <DialogClose render={itemLink} /> : itemLink}
                  {item.children && (
                    <div className="ml-7 space-y-1">
                      {item.children.map((child) => {
                        const childActive = childMatchesPath(pathname, child);
                        const ChildIcon = child.label === "Captures" ? Image : Video;
                        const childLink = (
                          <Link
                            key={child.href}
                            href={child.href}
                            aria-current={childActive ? "page" : undefined}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                              childActive
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
                            )}
                          >
                            <ChildIcon className="h-3.5 w-3.5" />
                            <span>{child.label}</span>
                          </Link>
                        );

                        return (
                          closeOnNavigate ? <DialogClose key={child.href} render={childLink} /> : childLink
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
