import { Inter } from "next/font/google";
import Link from "next/link";
import { SignOutButton, UserButton } from "@clerk/nextjs";
import { Eye, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import DashboardSidebar from "./dashboard-sidebar";
import FeedbackButton from "./feedback-button";
import { LiveEventToaster } from "./live-event-toaster";
import { LiveTabIndicator } from "./live-tab-indicator";
import { ThemeToggle } from "@/components/theme-toggle";

const inter = Inter({ subsets: ["latin"], variable: "--dashboard-font-sans" });

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`dashboard-theme ${inter.variable} flex min-h-screen bg-background`}>
      <aside className="sticky top-0 hidden h-screen w-60 border-r lg:flex lg:flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Eye className="h-[18px] w-[18px] text-primary" strokeWidth={2.5} />
          </div>
          <span className="text-[1.08rem] font-semibold">DeepSyte</span>
        </div>
        <Separator />
        <DashboardSidebar />
        <Separator />
        <div className="mt-auto flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <UserButton />
              <span className="truncate text-base text-muted-foreground">Account</span>
            </div>
            <ThemeToggle compact />
          </div>
          <SignOutButton>
            <Button variant="outline" className="w-full">Sign Out</Button>
          </SignOutButton>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Eye className="h-[15px] w-[15px] text-primary" strokeWidth={2.5} />
            </div>
            <span className="text-base font-semibold">DeepSyte</span>
          </Link>

          <Dialog>
            <DialogTrigger render={<Button variant="outline" size="sm" />}>
              <Menu data-icon="inline-start" />
              Menu
            </DialogTrigger>
            <DialogContent className={`dashboard-theme ${inter.variable} left-0 top-0 h-dvh w-[min(320px,85vw)] max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none border-r p-0 sm:max-w-[320px]`} showCloseButton={false}>
              <DialogHeader className="border-b p-4">
                <DialogTitle className="text-xl">Dashboard navigation</DialogTitle>
                <DialogDescription className="text-base leading-relaxed">Open the main review, analysis, and account sections.</DialogDescription>
              </DialogHeader>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <DashboardSidebar closeOnNavigate />
                <Separator />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserButton />
                      <span className="truncate text-base text-muted-foreground">Account</span>
                    </div>
                    <ThemeToggle compact />
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

      <FeedbackButton />
      <LiveEventToaster />
      <LiveTabIndicator />
    </div>
  );
}
