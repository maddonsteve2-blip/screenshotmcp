---
name: workos-authkit-signup
description: >
  How to automate sign-up / sign-in against a site that uses WorkOS AuthKit
  (authk.*.ai — wraps WorkOS auth pages with Cloudflare Turnstile). Use this
  workflow when the login/sign-up screen says "Continue to your workspace",
  shows Google + GitHub OAuth buttons, and displays a Cloudflare Turnstile
  "Verify you are human" gate after Continue.
triggers:
  - "sign up to smithery"
  - "smithery.ai publish"
  - "workos auth"
  - "authk."
  - sites embedding a `https://authk.*.ai` iframe or redirect
last_verified: 2026-04-18
derived_from_run: smithery.ai sign-up attempt (session _wtNE5i9m-uKSqGlVgyaE)
---

## One-line summary

WorkOS AuthKit sign-up is fully automatable up to the Turnstile checkbox. The
final click requires a human because WorkOS detects headless-browser
fingerprints and refuses token injection — even when the token is valid. Plan
for a 10-second human handoff on every WorkOS site.

## What WorkOS AuthKit looks like on the wire

| Signal | Value |
|---|---|
| Redirect host | `authk.{vendor}.ai` (e.g. `authk.smithery.ai`) |
| Auth library | Next.js app under `_next/static/chunks/...` |
| Telemetry | `forwarder.workos.com`, `o207216.ingest.sentry.io` |
| OAuth providers | Google + GitHub (WorkOS OAuth proxy) |
| Passwordless | Email `Continue` → sign-up form |
| Bot gate | Cloudflare Turnstile (`challenges.cloudflare.com/turnstile/v0/api.js`) |
| Render mode | `render=explicit` — sitekey only appears in network requests |

## Canonical flow (what works)

1. `auth_test_assist` with `intent: sign_up` — get or reuse a disposable inbox.
2. `browser_navigate` to the sign-up URL (usually `/servers/new`, `/publish`,
   `/app` etc. — the WorkOS redirect fires automatically).
3. `browser_fill input[type=email]` with the disposable address.
4. `browser_click Sign up` — advances to the first-name/last-name form.
5. `browser_fill` the three fields (`input[placeholder='Your first name']`,
   `input[placeholder='Your last name']`, `input[type=email]`).
6. `browser_click button:has-text('Continue')` — you will land on a Cloudflare
   Turnstile gate reading "Before continuing, we need to be sure you are human".

## Extracting the Turnstile sitekey (not in the DOM)

WorkOS renders Turnstile with `render=explicit`, so the sitekey is not in
`data-sitekey` attributes or inline scripts. Pull it from the resource list:

```js
// via browser_evaluate
(() => {
  const entries = performance.getEntriesByType('resource').map(e => e.name)
    .filter(n => n.includes('0x4AA') || n.includes('turnstile/f/'));
  return JSON.stringify(entries.slice(0, 10));
})()
```

The sitekey is embedded in the path after `/turnstile/f/ov2/av0/rch/{slot}/`.

## The hard wall: token injection is blocked

`solve_captcha` (CapSolver) returns a valid token in ~15s. Token verifies on
Cloudflare's side. **But**:

- The Turnstile widget runs inside an opaque iframe; the hidden
  `cf-turnstile-response` input is not created until a real user event fires.
- `browser_evaluate` injection of the token into any input returns
  `injected: 0` because no field exists yet.
- `browser_click_at` on the checkbox coordinate registers but Turnstile
  fingerprints the origin event and refuses to mark verified.

This is **working as designed** — it's the same bot-defence that stops spam.
Do not waste cycles trying to break it.

## Recommended handoff

1. Drive every step up to and including the Turnstile gate.
2. Record the outcome via `auth_test_assist(action='record', outcome='signup_failed', notes='WorkOS AuthKit + Turnstile: human click required on checkbox')`.
3. Hand credentials back to the user:

   ```
   Step         URL you paused on
   Email        {inbox from auth_test_assist}
   Name fields  already filled
   Remaining    One human click on the Turnstile checkbox + Submit
   Inbox        screenshotsmcp inbox:check --inbox-id <email>
   ```

4. The user completes the Turnstile click in their own browser in ~10 seconds,
   submits, then calls `inbox:check` (or `check_inbox` via MCP) to pull any
   OTP/magic link that follows.

## Known WorkOS-backed sites (at time of writing)

| Site | AuthKit subdomain | Notes |
|---|---|---|
| Smithery | `authk.smithery.ai` | Publish flow at `/servers/new` |
| (add more as you encounter them) | | |

## Post-auth: finishing the job

Once the human gets past Turnstile, most WorkOS flows either:
- Drop a session cookie immediately (no email verification) — resume automation.
- Send a magic link — use `check_inbox` on the disposable inbox and
  `browser_navigate` to the link.
- Send an OTP — use `check_inbox` then `browser_fill` the code field.

## Why this workflow exists

Today (2026-04-18) we attempted Smithery sign-up via our own MCP tooling to
dogfood the product. Everything worked — navigation, form fills, CAPTCHA solve,
inbox provisioning — except the final Turnstile handshake. Rather than relitigate
the same wall on every WorkOS site, this workflow captures the pattern so future
runs pause at the right place and hand off cleanly.

## Contrast with Clerk

Clerk sites behave differently:

- Clerk exposes `window.Clerk.client.signUp.create(...)` which accepts
  CAPTCHA tokens programmatically (bypass the UI).
- Sitekey is readable from `/v1/environment` on the Clerk frontend API.
- `solve_captcha` auto-detects Clerk and finishes the flow.

WorkOS offers no equivalent programmatic path. If a site is WorkOS-backed,
stop trying to automate past the Turnstile — escalate to the human.
