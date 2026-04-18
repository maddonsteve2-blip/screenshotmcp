/**
 * Narrated run timeline — caption deriver.
 *
 * Pure function. Given a tool invocation and a before/after page snapshot,
 * produces a short `actionLabel` + `outcome` pair for the dashboard timeline.
 *
 * Precedence for `outcome`:
 *   1. agentNote (if provided)            → captionSource = "agent" or "hybrid"
 *   2. hostname change                    → "→ <newHost>"
 *   3. same host, path change             → "→ <newPath>"
 *   4. same URL, h1 change                → "→ <newH1>"
 *   5. same URL, title change             → "→ <newTitle>"
 *   6. nothing observable                 → "no visible change"
 */

export type ToolName =
  | "browser_navigate"
  | "browser_click"
  | "browser_click_at"
  | "browser_fill"
  | "browser_press_key"
  | "browser_select_option"
  | "browser_hover"
  | "browser_scroll"
  | "browser_screenshot"
  | "browser_wait_for"
  | "browser_go_back"
  | "browser_go_forward"
  | "browser_set_viewport"
  | "smart_login"
  | "solve_captcha"
  | "take_screenshot"
  | string; // CLI prefixes like "cli:browser:click" pass through

export interface DeriveCaptionInput {
  toolName: ToolName;
  prevUrl?: string | null;
  nextUrl?: string | null;
  prevTitle?: string | null;
  nextTitle?: string | null;
  prevHeading?: string | null;
  nextHeading?: string | null;
  /** Primary positional arg (selector, key name, url, value, etc.). */
  arg?: string | null;
  /** Second positional arg (e.g. value in fill). Rarely surfaced. */
  arg2?: string | null;
  /** Optional agent-written note that wins the outcome slot. */
  agentNote?: string | null;
}

export interface DerivedCaption {
  actionLabel: string;
  outcome: string;
  captionSource: "auto" | "agent" | "hybrid";
}

const VERBS: Record<string, (arg?: string | null, arg2?: string | null) => string> = {
  browser_navigate: (url) => `Navigated to ${hostFromUrl(url) ?? url ?? "new URL"}`,
  browser_click: (sel) => `Clicked ${shortSel(sel)}`,
  browser_click_at: (coords) => `Clicked at ${coords ?? "coords"}`,
  browser_fill: (sel, val) => `Filled ${shortSel(sel)}${val ? ` = ${maskValue(val)}` : ""}`,
  browser_press_key: (key) => `Pressed ${key ?? "key"}`,
  browser_select_option: (sel, val) => `Selected ${val ?? "option"} in ${shortSel(sel)}`,
  browser_hover: (sel) => `Hovered ${shortSel(sel)}`,
  browser_scroll: () => `Scrolled`,
  browser_screenshot: () => `Captured screenshot`,
  browser_wait_for: (sel) => `Waited for ${shortSel(sel)}`,
  browser_go_back: () => `Back`,
  browser_go_forward: () => `Forward`,
  browser_set_viewport: () => `Resized viewport`,
  smart_login: () => `Attempted login`,
  solve_captcha: () => `Solved CAPTCHA`,
  take_screenshot: (url) => `Captured ${hostFromUrl(url) ?? url ?? "screenshot"}`,
};

export function deriveCaption(input: DeriveCaptionInput): DerivedCaption {
  const {
    toolName,
    prevUrl,
    nextUrl,
    prevTitle,
    nextTitle,
    prevHeading,
    nextHeading,
    arg,
    arg2,
    agentNote,
  } = input;

  const actionLabel = labelFor(toolName, arg, arg2);
  const autoOutcome = outcomeFor({
    prevUrl,
    nextUrl,
    prevTitle,
    nextTitle,
    prevHeading,
    nextHeading,
  });

  const trimmedNote = agentNote?.trim();
  if (trimmedNote) {
    return {
      actionLabel,
      outcome: trimmedNote,
      captionSource: autoOutcome && autoOutcome !== "no visible change" ? "hybrid" : "agent",
    };
  }

  return {
    actionLabel,
    outcome: autoOutcome,
    captionSource: "auto",
  };
}

function labelFor(toolName: string, arg?: string | null, arg2?: string | null): string {
  // CLI prefix passthrough: "cli:browser:click" → look up "browser_click"
  const normalized = toolName.replace(/^cli:/, "").replace(/:/g, "_");
  const verb = VERBS[normalized];
  if (verb) return verb(arg, arg2);
  // Fallback: humanize the tool name
  return normalized
    .split("_")
    .map((w, i) => (i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function outcomeFor(args: {
  prevUrl?: string | null;
  nextUrl?: string | null;
  prevTitle?: string | null;
  nextTitle?: string | null;
  prevHeading?: string | null;
  nextHeading?: string | null;
}): string {
  const { prevUrl, nextUrl, prevTitle, nextTitle, prevHeading, nextHeading } = args;
  if (nextUrl && prevUrl && nextUrl !== prevUrl) {
    const prevHost = hostFromUrl(prevUrl);
    const nextHost = hostFromUrl(nextUrl);
    if (prevHost && nextHost && prevHost !== nextHost) return `→ ${nextHost}`;
    const nextPath = pathFromUrl(nextUrl);
    if (nextPath) return `→ ${nextPath}`;
    return `→ ${nextUrl}`;
  }
  if (nextHeading && nextHeading !== prevHeading) return `→ ${truncate(nextHeading, 80)}`;
  if (nextTitle && nextTitle !== prevTitle) return `→ ${truncate(nextTitle, 80)}`;
  return "no visible change";
}

function hostFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function pathFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.pathname + (u.search || "");
  } catch {
    return null;
  }
}

function shortSel(sel?: string | null): string {
  if (!sel) return "element";
  const s = String(sel);
  if (s.length > 48) return `\`${s.slice(0, 45)}…\``;
  return `\`${s}\``;
}

function maskValue(val: string): string {
  if (val.length > 40) return `${val.slice(0, 20)}…(${val.length} chars)`;
  // Mask anything that looks like a password/token (heuristic: 8+ mixed chars with no spaces)
  if (val.length >= 8 && /[^\s]/.test(val) && /[0-9]/.test(val) && /[a-zA-Z]/.test(val) && !/\s/.test(val)) {
    if (val.includes("@")) return val; // email, fine to show
    return "•".repeat(Math.min(val.length, 8));
  }
  return val;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
