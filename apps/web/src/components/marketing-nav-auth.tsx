"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/**
 * Auth-aware button cluster for marketing/public page navbars.
 *
 * - Signed-in: single "Dashboard" button (primary CTA).
 * - Signed-out: "Sign in" ghost + primary sign-up button.
 *
 * Two visual variants so it fits both theme types in use across the site:
 * - `default`: uses shadcn Button primary/ghost (most pages — pricing, compare, roadmap).
 * - `emerald`: green-accent on dark surfaces (legal pages, landing, status).
 */
export function MarketingNavAuth({
  variant = "default",
  signUpLabel = "Get started",
}: {
  variant?: "default" | "emerald";
  signUpLabel?: string;
}) {
  if (variant === "emerald") {
    return (
      <>
        <Show when="signed-out">
          <Link href="/sign-in">
            <Button
              variant="ghost"
              className="text-[1.02rem] text-gray-400 hover:bg-white/5 hover:text-white sm:text-lg"
            >
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button className="bg-green-500 text-[1.02rem] font-semibold text-black hover:bg-green-400 sm:text-lg">
              {signUpLabel}
            </Button>
          </Link>
        </Show>
        <Show when="signed-in">
          <Link href="/dashboard">
            <Button className="bg-green-500 text-[1.02rem] font-semibold text-black hover:bg-green-400 sm:text-lg">
              Dashboard
            </Button>
          </Link>
        </Show>
      </>
    );
  }

  return (
    <>
      <Show when="signed-out">
        <Link href="/sign-in">
          <Button variant="ghost" className="text-[1.02rem] sm:text-lg">
            Sign in
          </Button>
        </Link>
        <Link href="/sign-up">
          <Button className="text-[1.02rem] sm:text-lg">{signUpLabel}</Button>
        </Link>
      </Show>
      <Show when="signed-in">
        <Link href="/dashboard">
          <Button className="text-[1.02rem] sm:text-lg">Dashboard</Button>
        </Link>
      </Show>
    </>
  );
}
