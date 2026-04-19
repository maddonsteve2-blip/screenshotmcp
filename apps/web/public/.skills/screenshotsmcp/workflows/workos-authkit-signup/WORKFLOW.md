---
name: workos-authkit-signup
description: >
  Use this workflow when the sign-up or sign-in page redirects to an `authk.*.ai` host (WorkOS AuthKit). The flow is automatable right up to the Cloudflare Turnstile checkbox, where a human click is required.
---
# WorkOS AuthKit sign-up

## Identify
The site uses WorkOS AuthKit if any of these are true:
- The URL is under `authk.<vendor>.ai` (e.g. `authk.smithery.ai`).
- Telemetry requests hit `forwarder.workos.com` or `o207216.ingest.sentry.io`.
- The page loads `challenges.cloudflare.com/turnstile/v0/api.js?...render=explicit`.

## Flow that works
1. `auth_test_assist` with `intent: sign_up` to reuse or provision a disposable inbox.
2. `browser_navigate` to the sign-up URL.
3. `browser_fill input[type=email]` with the disposable address, then `browser_click 'Sign up'`.
4. Fill the first-name, last-name, and email fields (emails can be duplicated).
5. `browser_click button:has-text('Continue')`. You will land on a Turnstile gate.

## Extract the Turnstile sitekey (not in the DOM)
WorkOS uses `render=explicit` so the sitekey is not in `data-sitekey`. Pull it from the resource list via `browser_evaluate`:

```js
performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('turnstile/f/'))
```

The sitekey is embedded in the path after `/turnstile/f/ov2/av0/rch/{slot}/`.

## Hard wall: do not try to bypass Turnstile
- `solve_captcha` returns a valid token. The token verifies on Cloudflare's side.
- Token injection into the iframed widget is blocked. Synthetic clicks on the checkbox are fingerprinted and rejected.
- This is anti-automation working as designed. Stop when you reach the checkbox.

## Hand off to the human
1. Record the attempt via `auth_test_assist` with `action: 'record', outcome: 'signup_failed'` and notes describing the Turnstile stop.
2. Give the user:
   - The sign-up URL you paused on.
   - The disposable inbox email.
   - The command to check it: `screenshotsmcp inbox:check --inbox-id <email>`.
3. Ask them to click the Turnstile checkbox and submit. Typically 10 seconds.

## After the human click
WorkOS flows usually follow one of these paths:
- Session cookie set immediately — resume automation.
- Magic link emailed — `check_inbox`, then `browser_navigate` to the link.
- OTP emailed — `check_inbox`, then `browser_fill` the code.

## Contrast with Clerk
Clerk exposes a programmatic sign-up API (`window.Clerk.client.signUp.create(...)`) that accepts solved CAPTCHA tokens, and its sitekey is readable from `/v1/environment`. WorkOS has no equivalent programmatic path — the Turnstile click is the gate.

## Known WorkOS-backed sites
- Smithery (`authk.smithery.ai`) — publish flow at `/servers/new`.

Add more as you encounter them. If a site pretends to be WorkOS but does not redirect to `authk.*.ai`, do not assume this wall applies — drive the flow and see.
