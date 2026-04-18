import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveCaption } from "./captions.js";

const expect = <T>(actual: T) => ({
  toBe: (expected: T) => assert.equal(actual, expected),
  toContain: (needle: string) => assert.ok(String(actual).includes(needle), `expected ${String(actual)} to contain ${needle}`),
  toMatch: (re: RegExp) => assert.match(String(actual), re),
});

describe("deriveCaption", () => {
  it("hostname change becomes arrow to new host", () => {
    const c = deriveCaption({
      toolName: "browser_click",
      prevUrl: "https://auth.example.com/login",
      nextUrl: "https://app.example.com/dashboard",
      arg: "#submit",
    });
    expect(c.actionLabel).toBe("Clicked `#submit`");
    expect(c.outcome).toBe("→ app.example.com");
    expect(c.captionSource).toBe("auto");
  });

  it("path change on same host shows path", () => {
    const c = deriveCaption({
      toolName: "browser_click",
      prevUrl: "https://app.example.com/a",
      nextUrl: "https://app.example.com/b?x=1",
      arg: "a.next",
    });
    expect(c.outcome).toBe("→ /b?x=1");
  });

  it("h1 delta when URL unchanged", () => {
    const c = deriveCaption({
      toolName: "browser_fill",
      prevUrl: "https://app.example.com/form",
      nextUrl: "https://app.example.com/form",
      prevHeading: "Sign in",
      nextHeading: "Enter verification code",
      arg: "input[name=email]",
      arg2: "alice@example.com",
    });
    expect(c.actionLabel).toBe("Filled `input[name=email]` = alice@example.com");
    expect(c.outcome).toBe("→ Enter verification code");
  });

  it("no observable change falls back to neutral", () => {
    const c = deriveCaption({
      toolName: "browser_click",
      prevUrl: "https://app.example.com/",
      nextUrl: "https://app.example.com/",
      prevHeading: "Home",
      nextHeading: "Home",
      arg: ".noop",
    });
    expect(c.outcome).toBe("no visible change");
  });

  it("agent note wins and source becomes hybrid when auto had signal", () => {
    const c = deriveCaption({
      toolName: "browser_click",
      prevUrl: "https://a.com/",
      nextUrl: "https://b.com/",
      arg: "#go",
      agentNote: "Clicked Continue to trigger Turnstile",
    });
    expect(c.outcome).toBe("Clicked Continue to trigger Turnstile");
    expect(c.captionSource).toBe("hybrid");
  });

  it("agent note alone becomes source=agent", () => {
    const c = deriveCaption({
      toolName: "browser_wait_for",
      prevUrl: "https://a.com/",
      nextUrl: "https://a.com/",
      arg: ".otp-input",
      agentNote: "Waiting for OTP email",
    });
    expect(c.captionSource).toBe("agent");
  });

  it("CLI prefix is normalized", () => {
    const c = deriveCaption({
      toolName: "cli:browser:paste",
      arg: "input[aria-label='One-time code']",
    });
    // Falls back to humanized since "browser_paste" is not in the map
    expect(c.actionLabel).toMatch(/^Browser paste/i);
  });

  it("masks long password-like values but leaves emails", () => {
    const pwd = deriveCaption({
      toolName: "browser_fill",
      arg: "#password",
      arg2: "Tr0ub4dor!123",
    });
    expect(pwd.actionLabel).toContain("•");
    const email = deriveCaption({
      toolName: "browser_fill",
      arg: "#email",
      arg2: "a@b.com",
    });
    expect(email.actionLabel).toContain("a@b.com");
  });
});
