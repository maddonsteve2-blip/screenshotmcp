import test from "node:test";
import assert from "node:assert/strict";
import { DiagnosticSeverityPure, parseAuditFindings } from "../src/views/auditParse";

const SAMPLE = `# UX Review: https://example.com

## Accessibility
- Missing alt text on the hero image
- Color contrast ratio of 3:1 fails WCAG AA
- Great keyboard focus ring

## Performance
- LCP is 4.2s (target < 2.5s)
- Unused CSS totals 180 KB

## SEO
- No meta description
- og:image is missing

## Content
- Headline is excellent and well-done

## Navigation
- Primary CTA is hidden below the fold but should sit above it
`;

test("parseAuditFindings extracts bullets under each heading", () => {
  const findings = parseAuditFindings(SAMPLE);
  assert.equal(findings.length, 7);
});

test("parseAuditFindings assigns Warning severity to accessibility and performance", () => {
  const findings = parseAuditFindings(SAMPLE);
  const accessibility = findings.filter((f) => f.category === "accessibility");
  const performance = findings.filter((f) => f.category === "performance");
  const seo = findings.filter((f) => f.category === "seo");
  assert.ok(accessibility.every((f) => f.severity === DiagnosticSeverityPure.Warning));
  assert.ok(performance.every((f) => f.severity === DiagnosticSeverityPure.Warning));
  assert.ok(seo.every((f) => f.severity === DiagnosticSeverityPure.Information));
});

test("parseAuditFindings drops purely positive bullets", () => {
  const findings = parseAuditFindings(SAMPLE);
  assert.ok(!findings.some((f) => /Great keyboard focus/.test(f.message)));
  assert.ok(!findings.some((f) => /excellent and well-done/.test(f.message)));
});

test("parseAuditFindings keeps mixed positive/negative bullets when they contain 'but'", () => {
  const findings = parseAuditFindings(SAMPLE);
  const nav = findings.find((f) => f.category === "navigation");
  assert.ok(nav, "expected navigation finding");
  assert.match(nav!.message, /hidden below the fold but should sit above it/);
});

test("parseAuditFindings returns empty array for empty or heading-only text", () => {
  assert.deepEqual(parseAuditFindings(""), []);
  assert.deepEqual(parseAuditFindings("# Just a heading\n\n## Another"), []);
});
