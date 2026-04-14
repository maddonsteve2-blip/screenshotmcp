import Link from "next/link";
import { SignOutButton, UserButton } from "@clerk/nextjs";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import DashboardSidebar from "./dashboard-sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 h-screen w-60 border-r flex flex-col">
        <div className="p-6 flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <span className="font-semibold">ScreenshotsMCP</span>
        </div>
        <Separator />
        <DashboardSidebar />
        <Separator />
        <div className="mt-auto p-4 space-y-3">
          <div className="flex items-center gap-3">
            <UserButton />
            <span className="text-sm text-muted-foreground">Account</span>
          </div>
          <SignOutButton>
            <Button variant="outline" className="w-full">Sign Out</Button>
          </SignOutButton>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
