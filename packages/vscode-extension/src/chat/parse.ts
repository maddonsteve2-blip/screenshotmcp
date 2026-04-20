/**
 * Pure helpers used by the `@screenshotsmcp` chat participant.
 * Kept free of `vscode` imports so the tests can run under `tsx --test`.
 */

export type InferredCommand = "screenshot" | "audit" | "workflow" | "timeline" | undefined;

export function inferCommand(prompt: string): InferredCommand {
  const trimmed = prompt.trim().toLowerCase();
  if (/^audit\b/.test(trimmed) || /\bux\s*review\b/.test(trimmed)) return "audit";
  if (/\b(screenshot|snap|capture)\b/.test(trimmed)) return "screenshot";
  if (/\b(workflow|runbook)\b/.test(trimmed)) return "workflow";
  if (/\b(timeline|history|recent)\b/.test(trimmed)) return "timeline";
  return undefined;
}

export function extractUrl(prompt: string): string | undefined {
  const match = prompt.match(/https?:\/\/[^\s)"']+/i);
  return match ? match[0] : undefined;
}
