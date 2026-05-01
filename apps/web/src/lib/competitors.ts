/**
 * Competitor catalog for programmatic comparison pages at /compare/[slug].
 *
 * Each entry funds one indexable comparison page. Keep claims neutral, factual,
 * and updateable — the goal is to rank for "{competitor} alternative" /
 * "{competitor} vs DeepSyte" / "screenshot API for AI" queries without
 * being a hatchet job.
 */

export interface Competitor {
  slug: string;
  name: string;
  url: string;
  tagline: string;
  positioning: string;
  // Side-by-side comparison rows. `them` and `us` should be short factual cells.
  matrix: Array<{ feature: string; them: string; us: string }>;
  // SEO metadata
  seoTitle: string;
  seoDescription: string;
}

const standardMatrix = (themPricing: string, themMcp: string, themAgentTools: string) =>
  [
    { feature: "Pricing (entry tier)", them: themPricing, us: "$0 / 100 shots / mo · $9 / 2k · $29 / 10k" },
    { feature: "MCP server (Cursor / Windsurf / Claude)", them: themMcp, us: "✅ First-party — 52+ tools" },
    { feature: "AI-agent browser tools (click, fill, eval, console)", them: themAgentTools, us: "✅ Full Playwright session control" },
    { feature: "Visual diff REST endpoint", them: "Limited / via screenshots", us: "✅ POST /v1/screenshot/diff (sync, R2-hosted)" },
    { feature: "GitHub Action for visual regression", them: "DIY", us: "✅ stevejford/action@v1 — sticky PR comments" },
    { feature: "Outbound webhooks (HMAC-signed, retried)", them: "—", us: "✅ screenshot.completed, run.completed, quota.warning" },
    { feature: "CLI", them: "Varies", us: "✅ npx deepsyte — 44 commands" },
    { feature: "CAPTCHA solving (Turnstile / reCAPTCHA / hCaptcha)", them: "—", us: "✅ Built-in via CapSolver" },
    { feature: "Disposable test inboxes (OTP / verification email)", them: "—", us: "✅ AgentMail integration" },
    { feature: "Session video recording (.webm)", them: "Varies", us: "✅ record_video flag" },
    { feature: "AI-assisted UX review (k2.5 vision)", them: "—", us: "✅ ux_review tool" },
  ];

export const competitors: Competitor[] = [
  {
    slug: "browserbase",
    name: "Browserbase",
    url: "https://www.browserbase.com",
    tagline: "Headless browser infrastructure for AI agents",
    positioning:
      "Browserbase ships hosted Chromium sessions for agents and is great for long-running scrapes and stateful flows. DeepSyte overlaps on the browser-session surface but ships first-party MCP, screenshots-as-output, visual diff, GitHub Action, and webhooks as the primary product — so AI clients can do screenshot-driven work without writing Stagehand or Playwright code.",
    matrix: standardMatrix(
      "Pay-as-you-go session minutes",
      "Community / partial",
      "✅ Stagehand SDK",
    ),
    seoTitle: "Browserbase vs DeepSyte — which one for your AI agent?",
    seoDescription:
      "Honest side-by-side: pricing, MCP support, browser session tools, visual diff, webhooks, and CLI. Pick the one that matches your stack.",
  },
  {
    slug: "browserless",
    name: "Browserless",
    url: "https://www.browserless.io",
    tagline: "Hosted Chrome / Chromium as an API",
    positioning:
      "Browserless is the OG hosted-Chrome API and powers a lot of scraping pipelines. DeepSyte is purpose-built for AI-agent workflows: MCP transport, run-backed audit outcomes, signed webhooks, and a GitHub Action are first-class — not assembled by the customer.",
    matrix: standardMatrix(
      "From $40 / mo (Cloud Unit pricing)",
      "—",
      "✅ Puppeteer endpoint",
    ),
    seoTitle: "Browserless vs DeepSyte — AI-agent browsers compared",
    seoDescription:
      "Browserless gives you raw Chromium; DeepSyte gives you screenshots, MCP tools, visual diff, and webhooks out of the box. See the matrix.",
  },
  {
    slug: "screenshotone",
    name: "ScreenshotOne",
    url: "https://screenshotone.com",
    tagline: "Screenshot API with caching and bulk capture",
    positioning:
      "ScreenshotOne is a clean, fast pure-screenshot API. DeepSyte includes the same capture surface plus AI-agent browser control, visual diff, GitHub Action, MCP transport, and outbound webhooks — making it the right pick when screenshots are one step inside a larger AI workflow.",
    matrix: standardMatrix(
      "From $17 / mo (1k captures)",
      "—",
      "—",
    ),
    seoTitle: "ScreenshotOne vs DeepSyte — screenshots for AI agents",
    seoDescription:
      "ScreenshotOne nails pure capture. DeepSyte adds MCP tools, visual diff, GitHub Action, and signed webhooks. See the full feature matrix.",
  },
  {
    slug: "urlbox",
    name: "Urlbox",
    url: "https://urlbox.com",
    tagline: "High-end screenshot rendering API",
    positioning:
      "Urlbox is famously good at hard-to-render pages and has deep PDF support. DeepSyte focuses on the AI-agent envelope: MCP transport, run-backed audits, visual diff REST, GitHub Action, signed webhooks, and a CLI for terminal-driven captures.",
    matrix: standardMatrix(
      "From $19 / mo (1k renders)",
      "—",
      "—",
    ),
    seoTitle: "Urlbox vs DeepSyte — render fidelity vs AI workflow",
    seoDescription:
      "Urlbox excels at fidelity. DeepSyte is built for AI agents — MCP, visual diff, GitHub Action, and webhooks. Compare the trade-offs.",
  },
  {
    slug: "apiflash",
    name: "ApiFlash",
    url: "https://apiflash.com",
    tagline: "Simple screenshot API with generous free tier",
    positioning:
      "ApiFlash is a great low-cost capture API. DeepSyte overlaps on the capture surface and adds full Playwright session control, MCP for AI clients, visual diff, GitHub Action, and signed webhooks — useful when screenshots are part of a larger agent pipeline.",
    matrix: standardMatrix(
      "100 free, then $9 / mo",
      "—",
      "—",
    ),
    seoTitle: "ApiFlash vs DeepSyte — picking the right screenshot API",
    seoDescription:
      "ApiFlash for plain captures. DeepSyte when screenshots are one step inside an AI agent or CI pipeline. Side-by-side comparison.",
  },
  {
    slug: "microlink",
    name: "Microlink",
    url: "https://microlink.io",
    tagline: "Browser-as-API with link previews and PDF export",
    positioning:
      "Microlink is excellent for link previews, OG metadata, and PDF rendering. DeepSyte is structured around AI-agent workflows: MCP, visual diff, GitHub Action, signed webhooks, and a CLI — with a sync OG-preview tool included for parity.",
    matrix: standardMatrix(
      "Pay-as-you-go from $24 / mo",
      "—",
      "✅ MQL query language",
    ),
    seoTitle: "Microlink vs DeepSyte — link previews & screenshots",
    seoDescription:
      "Both render the web. Microlink for previews/PDF; DeepSyte for AI agents needing MCP, visual diff, GitHub Action, and webhooks.",
  },
  {
    slug: "scrapingbee",
    name: "ScrapingBee",
    url: "https://www.scrapingbee.com",
    tagline: "Web scraping & screenshot API",
    positioning:
      "ScrapingBee is built for scraping at scale with proxies and JS rendering. DeepSyte focuses on the AI-agent envelope around captures: MCP transport, agent-driven Playwright sessions, visual diff, GitHub Action, and signed webhooks for downstream automation.",
    matrix: standardMatrix(
      "From $49 / mo",
      "—",
      "✅ JS scenarios",
    ),
    seoTitle: "ScrapingBee vs DeepSyte — scraping vs AI workflows",
    seoDescription:
      "ScrapingBee for proxy-heavy scraping. DeepSyte for AI agents needing MCP tools, visual diff, GitHub Action, and signed webhooks.",
  },
  {
    slug: "apify",
    name: "Apify",
    url: "https://apify.com",
    tagline: "Web scraping & automation platform with Actor marketplace",
    positioning:
      "Apify is a marketplace + runtime for scraping Actors and works well for long-running data extraction. DeepSyte is a focused AI-agent surface — MCP, visual diff, GitHub Action, signed webhooks, and a CLI — without the platform complexity.",
    matrix: standardMatrix(
      "Free + usage-based ($5 starter credit)",
      "—",
      "✅ Actor SDK",
    ),
    seoTitle: "Apify vs DeepSyte — platform vs focused AI workflow",
    seoDescription:
      "Apify is a scraping platform. DeepSyte is a focused screenshot + AI-agent toolkit with MCP, visual diff, GitHub Action, and webhooks.",
  },
];

export function getCompetitor(slug: string): Competitor | undefined {
  return competitors.find((c) => c.slug === slug);
}
