import { Inter } from "next/font/google";
import Link from "next/link";
import { SignOutButton, UserButton } from "@clerk/nextjs";
import { Camera, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import DashboardSidebar from "./dashboard-sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--dashboard-font-sans" });

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`dashboard-theme ${inter.variable} flex min-h-screen bg-background`}>
      <aside className="sticky top-0 hidden h-screen w-60 border-r lg:flex lg:flex-col">
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

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">ScreenshotsMCP</span>
          </Link>

          <Dialog>
            <DialogTrigger render={<Button variant="outline" size="sm" />}>
              <Menu data-icon="inline-start" />
              Menu
            </DialogTrigger>
            <DialogContent className={`dashboard-theme ${inter.variable} left-0 top-0 h-dvh w-[min(320px,85vw)] max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none border-r p-0 sm:max-w-[320px]`} showCloseButton={false}>
              <DialogHeader className="border-b p-4">
                <DialogTitle>Dashboard navigation</DialogTitle>
                <DialogDescription>Open the main review, analysis, and account sections.</DialogDescription>
              </DialogHeader>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <DashboardSidebar closeOnNavigate />
                <Separator />
                <div className="p-4">
                  <div className="flex items-center gap-3">
                    <UserButton />
                    <span className="text-sm text-muted-foreground">Account</span>
                  </div>
                  <SignOutButton>
                    <Button variant="outline" className="mt-3 w-full">Sign Out</Button>
                  </SignOutButton>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
