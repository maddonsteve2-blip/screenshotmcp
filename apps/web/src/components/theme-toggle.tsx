"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Tri-state theme toggle: light / system / dark.
 * Uses next-themes (provided transitively by fumadocs-ui's RootProvider).
 * The RootProvider configures attribute="class" and defaultTheme="system",
 * so simply setting the theme value toggles the `.dark` class on <html>.
 *
 * The dashboard layout applies `.dashboard-theme`; combined rules in
 * globals.css (`.dashboard-theme.dark`) switch the dashboard surface
 * colors alongside the rest of the app.
 */
export function ThemeToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — theme is not known on the server.
  useEffect(() => setMounted(true), []);

  const current = theme ?? "system";

  if (compact) {
    // Single-button toggle that cycles light -> dark -> system.
    const next = current === "light" ? "dark" : current === "dark" ? "system" : "light";
    const Icon = !mounted
      ? Sun
      : current === "system"
        ? Monitor
        : (resolvedTheme ?? "light") === "dark"
          ? Moon
          : Sun;
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          className,
        )}
        aria-label={`Switch theme (current: ${current})`}
        title={`Theme: ${current}`}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  const options = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "system", label: "System", Icon: Monitor },
    { value: "dark", label: "Dark", Icon: Moon },
  ] as const;

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5",
        className,
      )}
    >
      {options.map(({ value, label, Icon }) => {
        const active = mounted && current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
