# ScreenshotsMCP — Product Audit & Gap Analysis

**Auditor lens:** senior product manager looking at whether you are solving real-world problems for developers (and the AI agents working alongside them).
**Date:** 2026-04-27
**Scope reviewed:** AGENTS.md, landing page, pricing page, dashboard, MCP server (52+ tools), CLI surface, llms.txt, roadmap, docs structure, schema-implied data model.

---

## TL;DR

You have built a *technically excellent* product with one of the largest MCP tool surfaces in the ecosystem (52+ tools, 44 CLI commands), genuinely differentiated capabilities (managed local browser escalation, evidence bundles, workflow-aware run outcomes, GitHub Action with visual diff), and clear thinking about agent-vs-human dual audience.

But the product strategy has three structural problems that will limit who actually *pays you*:

1. **You are not yet monetized.** Stripe is "Now" on the roadmap, paid tiers say "Coming soon," and Free is described as "unlimited screenshots" on the homepage but capped at 100/mo on the pricing page. You cannot win on revenue or trust with that inconsistency.
2. **You position as "browser truth for AI agents" but the buyer of paid tiers is a human developer or eng lead — and they don't yet see ROI proof, social proof, or team primitives.**
3. **Your highest-leverage real-world problem (visual regression / "did my deploy break the UI?") is in "Later" — even though the visual diff endpoint, GitHub Action, and webhook plumbing already exist.** You are sitting on Percy/Chromatic/Argos territory and not claiming it.

The rest of this doc breaks the gaps down by category, then stack-ranks fixes.

---

## What you are doing well

Worth keeping in view, because the fixes below should not regress these:

- **Tool breadth and quality.** 52+ MCP tools covering screenshot, browser actions, audits, console/network capture, auth flows, captcha, test inboxes — that's a Browserbase + Stagehand + Urlbox combined surface in one MCP.
- **Local + remote escalation ladder.** The decision tree (remote first → managed local browser when realism matters) is genuinely novel for an MCP product and solves the "Cloudflare Turnstile / WorkOS silently rejects cloud browsers" problem real devs hit daily.
- **Evidence-oriented run model.** `runs` + `runOutcomes` + `screenshots` + `recordings` + console/network counts + `shareToken` is the right schema for an audit/QA workflow product. Most competitors return a URL and stop.
- **Workflow-aware outcomes.** `task_type`, `user_goal`, `verdict`, `findings`, `proof_coverage`, `next_actions` — this is what makes the product agent-readable and human-reviewable in one shot. Lead with this; nobody else has it.
- **Multi-channel distribution.** MCP, REST, CLI, VS Code extension preview, Chrome extension preview, GitHub Action. Strong PLG surface area.
- **Webhooks shipped with HMAC + retries.** Most "fast-shipped" SaaS skip this; you didn't.
- **Programmatic SEO foundation.** `/compare/*` for 8 competitors is in place — the lever just needs more pulls.

---

## The Real-World Dev Problems You Should Be Solving (and how you're doing on each)

A useful PM frame: forget tools, ask "what painful job is the developer hiring this product to do?"

### Job 1 — "I changed CSS and don't know if I broke production visually"
**Pain level for devs:** extreme. **Money in market:** Percy $249/mo, Chromatic $149/mo, Argos, Lost Pixel.
**You today:** Visual diff REST endpoint shipped. GitHub Action shipped. Sticky PR comments shipped. **But "scheduled visual regression" is in `Later`, your homepage doesn't mention PR comments, and there's no `/visual-regression` landing page.**
**Verdict:** You are sitting on a $1B+ category and not claiming it. **This is the single highest-impact gap.**

### Job 2 — "My AI agent built something — did it actually work in the browser?"
**Pain level:** rapidly growing as Cursor / Claude Code / v0 usage explodes.
**You today:** Strong. Run outcomes, evidence bundles, console + network capture, recordings — exactly the right shape.
**Gap:** Marketing leads with "browser truth" (abstract) instead of "watch your AI agent's work and verify it" (concrete). The live-tab indicator + WebSocket run timeline is *the* feature for this job and it's invisible on the landing page.

### Job 3 — "I need to test/QA flows behind login (Clerk, WorkOS, Auth0)"
**Pain level:** very high — every SaaS has this, and Playwright auth is painful.
**You today:** Strongest of any MCP. Test inboxes, AgentMail integration, websiteAuthMemories, smart_login, captcha solver, escalation ladder for Cloudflare/WorkOS.
**Gap:** This is invisible to a first-time visitor. You need a dedicated `/auth-testing` page and a 2-minute video showing it work against a real Clerk login.

### Job 4 — "I want to verify a deploy didn't break anything before I merge"
**Pain level:** extreme for any team shipping daily.
**You today:** All the primitives exist (GitHub Action, webhooks, runs, diffs).
**Gap:** No turnkey "Vercel deploy preview integration" / "Netlify post-deploy hook" / "GitHub Actions matrix template." Devs want a 5-minute integration, not an SDK they assemble.

### Job 5 — "I want to scrape / extract structured data from pages"
**Pain level:** high. **Competitors:** Firecrawl, Apify, Browse.ai, Browserbase + LLM.
**You today:** `browser_get_html`, `browser_get_text`, `browser_evaluate` — primitives exist.
**Gap:** No "extract structured JSON with a schema" tool. Firecrawl's killer feature. You should have `extract_structured(url, zod_schema)` as a first-class tool.

### Job 6 — "Monitor my site / get alerted when it breaks"
**Pain level:** every SRE has this. **Competitors:** Visualping, Better Stack, Checkly.
**You today:** Webhooks, runs, audits, captures — the parts.
**Gap:** No `screenshotsmcp monitor <url> --every 1h --notify` story. Easy SKU.

### Job 7 — "Generate Open Graph / social preview images"
**Pain level:** medium but extremely common. **Competitors:** OG Image API, Vercel OG, Bannerbear.
**You today:** Element capture exists, OG preview tool exists.
**Gap:** No `/og-images` landing page, no Next.js / Astro / Hugo plugin. Easy SEO and adoption play.

### Job 8 — "I'm building an AI app that needs to see web pages"
**Pain level:** new but exploding. **Competitors:** Browserbase, Stagehand, Bright Data.
**You today:** Excellent on MCP. Workflow-aware outcomes are unique.
**Gap:** No language SDKs. AI app builders use Python and TypeScript directly, not always through an MCP host. A `pip install screenshotsmcp` and `npm i @screenshotsmcp/sdk` would 5x your TAM.

---

## Gap Categories

### A. Monetization & pricing strategy (CRITICAL)

The free plan claims "unlimited screenshots" on the homepage and "100/mo (grandfathered for existing users)" on `/pricing`. That alone is a trust killer — fix the copy in the next 24 hours.

The shape of your tiers is also wrong for who actually pays:

- **Per-screenshot pricing breaks for AI agents.** A single Claude Code or Cursor session can burn 50–200 screenshots. Pro at 10k/mo = 5–10 active sessions per developer per day before they're throttled. Power users will churn.
- **No usage-based overage.** Devs would rather pay $0.005/extra-shot than be stopped. You're leaving money on the floor.
- **No team/org tier.** Eng leaders can't adopt this for a team without per-seat or per-org SKU. The B2B buyer doesn't exist in your pricing today.
- **No annual discount.** Standard 20% annual = pulls forward cash and reduces churn.
- **No usage-mode pricing.** Browserbase prices by browser-minute. Worth modeling whether "session minutes" or "active runs" is a better unit than screenshot count for the AI-agent use case.

**Recommended SKU shape:**
- Free — 100/mo, 1 user, public sites, community support, watermarked share pages.
- Hobby — $9/mo — 2k shots, no watermark, all browser actions, 7-day retention.
- Pro — $29/mo — 10k shots + $0.005/extra, video, GitHub Action, priority queue, 30-day retention.
- Team — $99/mo — 5 seats, shared keys, org primitives, audit log, 90-day retention. **(Add this — it's the one missing.)**
- Enterprise — call us — SSO, SOC 2, regions, self-hosted, custom retention.

### B. Positioning & messaging gaps

- **You bury your unique value.** "Browser truth" is poetic but doesn't say what you do. Your real differentiator: *"The only platform where AI agents do browser work and you can verify every step."* Lead with `runs` and shared run pages.
- **Your hero shows everything.** It should show one thing: a live agent run unfolding, with the "before / after / diff / share link" punchline.
- **You don't pick a primary use case on the homepage.** You list 6. New visitors don't pick — they bounce. Pick one ("AI deploy verification" or "agent QA") and put it above the fold; let the other 5 be a secondary section.
- **No social proof anywhere.** No customer logos, no testimonials, no GitHub stars (is the repo public? if not, why not?), no npm install counter, no "X devs joined this week," no Discord. Devs trust signals over copy.
- **No founder voice / changelog rhythm.** A weekly "what we shipped" post on the changelog page is the cheapest growth channel for a dev tool.

### C. Product / feature gaps (ranked by leverage)

Highest impact first:

1. **Visual regression as a first-class product.** You have the primitives. Wrap them as `screenshotsmcp regress add <url>`, `screenshotsmcp regress run`, `screenshotsmcp regress baseline`. Charge for it. Make a Percy/Chromatic comparison page. **Single biggest revenue lever you're not pulling.**
2. **Structured extraction tool.** `extract_structured(url, schema)` returning typed JSON. Firecrawl's killer move. Trivial for you to ship given you already evaluate JS in pages.
3. **Scheduled jobs / monitoring.** `screenshotsmcp monitor` with cron + diff + webhook. Standalone $20–$50/mo SKU.
4. **Language SDKs.** `@screenshotsmcp/sdk` (TS) and `screenshotsmcp` (Python). Drops the "do I have to install an MCP host?" objection for non-IDE users.
5. **Vercel / Netlify / GitHub Actions integrations as named products** — not buried as primitives. "ScreenshotsMCP for Vercel" page with a 5-line install.
6. **Org / team primitives.** API key scoping (read-only, prod-only, per-project), audit log, invite teammates, shared keys, SSO. **This unblocks B2B revenue.**
7. **Cookie / session import.** Let users paste a Chrome session for "log in as me." Massive for authenticated testing.
8. **Region selection.** EU vs US browser. Compliance + perf wedge for non-US devs.
9. **Proxy / residential IP option.** Tier-2 differentiator vs Browserbase.
10. **Deduplication / cache modes.** "Skip if URL screenshotted in last 1h." Saves agent users money — *that's* the reason they upgrade.

### D. Acquisition & growth gaps

- **Smithery / Pulse / official MCP registry listings are "Next."** This is your #1 acquisition channel and it's not done. Ship in days, not weeks.
- **No `/visual-regression` landing page.** Even though the feature works.
- **No `/agents/cursor`, `/agents/claude-code`, `/agents/windsurf` pages.** Each should rank for "Cursor screenshot tool," "Claude Code browser testing," etc.
- **No referral program.** The roadmap mentions affiliate (30% lifetime), but for devs the right shape is *credit-based referrals* — give 1k free shots for each referral. Cheaper than affiliate, higher viral.
- **No "share this run" virality.** Shared run pages exist (`shareToken`); does the public share page have a "Powered by ScreenshotsMCP — try free" footer? If not, add it. Free top-of-funnel.
- **No public stats / counter.** "X screenshots captured this week" creates social proof and ranks.
- **No Discord / community.** For a dev tool, Discord is the support + retention engine.
- **No "watch our agent run yours" demo.** A live demo where someone enters a URL and watches an agent QA it in real-time would be your best demo asset.

### E. Trust, credibility, compliance

- **No SOC 2 / GDPR / data-residency claims** that I can find. Required to sell into anything bigger than indie devs.
- **No clear data retention policy.** How long are screenshots / recordings / console logs kept? Can the user delete them? Auto-delete? This is a privacy ask and a billing lever (longer retention = higher tier).
- **No status page integrity check.** A `/status` route exists — is it real-time and does it have history? If it's a placeholder, that hurts more than helping.
- **Brand inconsistency.** I see both `screenshotsmcp.com` and `screenshotmcp.com` in the codebase. Pick one and redirect the other.
- **No public security disclosure / bug bounty / `security.txt`.** Devs check.
- **No on-page reassurance about API key safety.** Where is the key stored? Hashed? When does it rotate? Tell the visitor on the keys page.

### F. Onboarding / activation

- **`/try` is great** — the right move. But what's the "aha moment"? After the first screenshot, what is the user shown that pulls them into signing up?
- **Dashboard onboarding shows when no activity.** Good. But does it walk the user through their *second* useful action (running an audit, sharing a run, hooking up GitHub)? Day-2 retention is the gap.
- **No "your first GitHub PR comment" guided flow.** Your most retentive integration deserves a step-by-step.
- **Activation funnel + lifecycle email is "Now"** — finish it. Day-0 / day-3 / day-7 with a single clear next action each is industry standard for PLG.
- **Quota warnings via webhook are great** — also surface them in-app with a clear "upgrade" CTA when paid tiers go live.

### G. Documentation & DX

- **Per-tool MDX pages are good but feel auto-generated.** A new dev wants *recipes*, not API references. Ship a `/cookbook` with: "Verify a Vercel deploy preview," "QA a Clerk login flow," "Visual regression on push," "Weekly homepage screenshot for Slack."
- **No "how I'd choose: CLI vs MCP vs REST" decision page.** With 3 channels, this is needed.
- **No migration page.** "Coming from Puppeteer / Playwright / Urlbox / Browserbase? Here's the equivalent for each call." Captures intent traffic.
- **No FAQ on the marketing site** for objections devs will have ("does this run on my localhost?", "do you store my data?", "what about CAPTCHAs?", "can I self-host?").
- **`/llms.txt` is excellent** — keep maintaining it; very few products do.

---

## Stack-ranked recommendations

Treat this as a 90-day operating plan.

### P0 — Do this week (revenue & trust)

1. Fix the homepage / pricing inconsistency on free-plan limits. Same number, both pages.
2. Ship Stripe billing. Until you have paid customers, every other gap is academic.
3. Pick a single primary use case for the hero ("Verify your deploy / your AI's work / your auth flow") and rewrite above-the-fold around it. Keep the others below.
4. Add social proof — even one — to the homepage. GitHub stars badge, npm download badge, "since 2026 we've captured X screenshots" counter, or one quoted user.
5. Resolve `screenshotmcp.com` vs `screenshotsmcp.com`. Pick one canonical, 301 the other.
6. Submit listings to Smithery, Pulse, official MCP registry. Manifest is already there.

### P1 — Next 30 days (revenue expansion)

7. **Launch Visual Regression as a named product** with its own landing page, pricing tier, and onboarding. Use existing diff + GitHub Action + webhook. Compare directly to Percy / Chromatic / Argos on `/compare/*`.
8. Ship the Team plan ($99/mo, 5 seats). Org primitives + API key scoping + audit log.
9. Ship `extract_structured(url, schema)` and put it on a `/web-scraping` landing page.
10. Ship language SDKs (TS + Python). Each gets a quickstart.
11. Stand up `/cookbook` with at least 5 named recipes (deploy verify, auth QA, visual regression, OG generation, monitoring).
12. Wire activation lifecycle email (day 0/3/7) with a single CTA each.
13. Launch a Discord or GitHub Discussions and link it everywhere.

### P2 — Next 60–90 days (durable moat)

14. Self-serve scheduled monitoring product (`screenshotsmcp monitor`).
15. Region selection + residential IP option.
16. Cookie / storage state import for "log in as me."
17. Dedup / cache mode and surface "you saved $X this month" in dashboard. *This is what makes power AI users upgrade.*
18. SOC 2 Type 1 readiness work; publish a real `/security` and `/compliance`.
19. SSO for Team / Enterprise.
20. VS Code extension out of preview, into Marketplace.
21. Affiliate / credit-based referral program live.
22. `/agents/{cursor,windsurf,claude-code,vscode}` pages each ranked for the "X screenshot/browser tool" intent.

### P3 — Later (asymmetric bets)

23. MCP tool marketplace (third-party authors plug in for distribution + billing). High moat if you nail it.
24. Self-hosted edition for regulated industries.
25. Built-in agentic monitoring (an MCP that monitors *itself* and pages you on regression).

---

## What you should *not* do (negative space)

A few traps to avoid:

- **Don't build more MCP tools.** You have 52+. Marginal tool 53 doesn't move revenue. Marginal landing page #4 does.
- **Don't chase enterprise before SOC 2 is real.** You'll burn cycles on RFPs and lose to vendors who already have it.
- **Don't out-feature Browserbase on raw browser primitives.** They have more capital. Win on "agent run verification + evidence + visual regression" — categories they don't own.
- **Don't ship a generic "AI agent" pitch.** You're better positioned as the *verification layer* for whoever the agent is. Stay neutral; integrate everywhere.

---

## One-line summary

**You have the engineering of a $10M ARR product and the marketing/monetization of a side project. Close that gap in 90 days and the revenue follows.**
