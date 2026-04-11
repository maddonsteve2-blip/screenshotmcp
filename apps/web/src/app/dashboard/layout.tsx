import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Camera, Key, LayoutDashboard, FileText, CreditCard, Download, Image, Play, BarChart3, ScrollText, Settings, Video } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/playground", label: "Playground", icon: Play },
  { href: "/dashboard/screenshots", label: "Screenshots", icon: Image },
  { href: "/dashboard/recordings", label: "Recordings", icon: Video },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/keys", label: "API Keys", icon: Key },
  { href: "/dashboard/install", label: "Install", icon: Download },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/changelog", label: "Changelog", icon: ScrollText },
  { href: "/docs", label: "Docs", icon: FileText },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 border-r flex flex-col">
        <div className="p-6 flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <span className="font-semibold">ScreenshotsMCP</span>
        </div>
        <Separator />
        <nav className="flex-1 p-4 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <Separator />
        <div className="p-4 flex items-center gap-3">
          <UserButton />
          <span className="text-sm text-muted-foreground">Account</span>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
