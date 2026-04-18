"use client";

import { useState } from "react";
import { MessageSquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Lightweight floating feedback button — opens a small textarea, submits via
 * mailto: so we don't need a backend route or external service. Once we wire
 * Featurebase / Canny / a real /api/feedback route, swap the submit handler.
 */
export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<"bug" | "idea" | "love">("idea");

  const submit = () => {
    if (!message.trim()) return;
    const subject = encodeURIComponent(`[${category}] Dashboard feedback`);
    const body = encodeURIComponent(
      `${message}\n\n---\nPath: ${typeof window !== "undefined" ? window.location.pathname : ""}\nUA: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
    );
    window.location.href = `mailto:hello@screenshotmcp.com?subject=${subject}&body=${body}`;
    setOpen(false);
    setMessage("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
        aria-label="Send feedback"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Feedback
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[min(360px,calc(100vw-2rem))] rounded-xl border bg-background p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Send feedback</h3>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close">
          <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </button>
      </div>

      <div className="mb-3 flex gap-2">
        {(["bug", "idea", "love"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`flex-1 rounded-md border px-2 py-1.5 text-xs capitalize ${
              category === c
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {c === "bug" ? "🐛 Bug" : c === "idea" ? "💡 Idea" : "❤️ Love"}
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={
          category === "bug"
            ? "What broke? Steps to reproduce help us fix it fast."
            : category === "idea"
              ? "What would unblock you?"
              : "What's working well?"
        }
        rows={4}
        className="w-full resize-none rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Sends to hello@screenshotmcp.com</p>
        <Button size="sm" onClick={submit} disabled={!message.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
