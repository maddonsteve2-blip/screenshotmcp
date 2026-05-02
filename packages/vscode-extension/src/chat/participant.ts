import * as vscode from "vscode";
import { discoverWorkflows } from "../skills/discoverWorkflows";
import type { TimelineStore } from "../timeline/store";
import { validateHttpUrl } from "../utils/url";
import { extractUrl, inferCommand } from "./parse";

const PARTICIPANT_ID = "deepsyte.chat";

export interface ChatParticipantDeps {
  timelineStore: TimelineStore;
}

/**
 * Registers the `@deepsyte` chat participant with commands:
 *   /screenshot <url>   — capture a URL
 *   /audit <url>        — run UX audit
 *   /workflow           — pick a packaged workflow
 *   /timeline           — summarise recent activity
 *
 * Since the browser/audit roundtrip takes several seconds, the participant
 * replies with one-click buttons that invoke the existing commands rather
 * than blocking the chat turn.
 */
export function registerChatParticipant(
  context: vscode.ExtensionContext,
  deps: ChatParticipantDeps,
): void {
  // `vscode.chat.createChatParticipant` was added in 1.90. Guard defensively
  // so older builds still load the extension.
  const chatApi = (vscode as unknown as { chat?: typeof vscode.chat }).chat;
  if (!chatApi || typeof chatApi.createChatParticipant !== "function") {
    return;
  }

  const participant = chatApi.createChatParticipant(
    PARTICIPANT_ID,
    async (request, _ctx, stream, token) => {
      if (token.isCancellationRequested) {
        return;
      }
      const command = request.command ?? inferCommand(request.prompt);
      switch (command) {
        case "screenshot":
          return handleScreenshot(stream, request.prompt);
        case "audit":
          return handleAudit(stream, request.prompt);
        case "workflow":
          return handleWorkflow(stream);
        case "timeline":
          return handleTimeline(stream, deps);
        case "diff":
          return handleDiff(stream, request.prompt);
        default:
          return handleHelp(stream, request.prompt);
      }
    },
  );

  context.subscriptions.push(participant);
}

function handleScreenshot(stream: vscode.ChatResponseStream, prompt: string): void {
  const url = extractUrl(prompt);
  if (!url) {
    stream.markdown(
      "I need a URL to capture. Try: `@deepsyte /screenshot https://example.com`.\n\n",
    );
    stream.button({
      command: "deepsyte.takeScreenshot",
      title: "Pick a URL to screenshot",
    });
    return;
  }
  if (!validateHttpUrl(url)) {
    stream.markdown(`\`${url}\` is not a valid http/https URL.`);
    return;
  }
  stream.markdown(`Ready to capture **${url}**. I'll open the result in an inline panel when it's done.\n\n`);
  stream.button({
    command: "deepsyte.takeScreenshotAtUrl",
    title: `Screenshot ${url}`,
    arguments: [url],
  });
  stream.button({
    command: "deepsyte.auditUrl",
    title: `Also audit ${url}`,
    arguments: [url],
  });
}

function handleAudit(stream: vscode.ChatResponseStream, prompt: string): void {
  const url = extractUrl(prompt);
  if (!url) {
    stream.markdown("I need a URL to audit. Try: `@deepsyte /audit https://example.com`.");
    return;
  }
  if (!validateHttpUrl(url)) {
    stream.markdown(`\`${url}\` is not a valid http/https URL.`);
    return;
  }
  stream.markdown(`Queueing a UX/SEO/accessibility audit of **${url}**. Findings will appear in the Problems tab.\n\n`);
  stream.button({
    command: "deepsyte.auditUrl",
    title: `Run audit for ${url}`,
    arguments: [url],
  });
}

function handleWorkflow(stream: vscode.ChatResponseStream): void {
  const workflows = discoverWorkflows();
  if (workflows.length === 0) {
    stream.markdown("No workflows found. Install a skill that ships `WORKFLOW.md` files first.\n\n");
    stream.button({ command: "deepsyte.syncCoreSkill", title: "Sync Core Skill" });
    return;
  }
  stream.markdown(`Found **${workflows.length}** packaged workflow${workflows.length === 1 ? "" : "s"}:\n\n`);
  for (const w of workflows) {
    stream.markdown(`- **${w.title}** · \`${w.skill}\` · \`${w.relativePath}\`\n`);
    stream.button({
      command: "deepsyte.openWorkflow",
      title: `Open: ${w.title}`,
      arguments: [w.path],
    });
  }
}

function handleTimeline(stream: vscode.ChatResponseStream, deps: ChatParticipantDeps): void {
  const events = deps.timelineStore.getEvents().slice(0, 10);
  if (events.length === 0) {
    stream.markdown("The timeline is empty. Run `/screenshot` or `/audit` first.\n");
    return;
  }
  stream.markdown(`### Recent DeepSyte activity\n\n`);
  for (const e of events) {
    const when = new Date(e.occurredAt).toLocaleString();
    const statusIcon = e.status === "success" ? "\u2705" : e.status === "error" ? "\u274c" : "\u2139\ufe0f";
    stream.markdown(`${statusIcon} **${e.title}** · ${when}`);
    if (e.detail) {
      stream.markdown(` — ${e.detail}`);
    }
    stream.markdown("\n");
  }
  stream.button({ command: "deepsyte.openTimeline", title: "Open full timeline" });
}

function handleDiff(stream: vscode.ChatResponseStream, prompt: string): void {
  const urls = prompt.match(/https?:\/\/[^\s)"']+/gi) ?? [];
  if (urls.length >= 2) {
    const urlA = urls[0]!;
    const urlB = urls[1]!;
    if (!validateHttpUrl(urlA) || !validateHttpUrl(urlB)) {
      stream.markdown("Both URLs must be valid http/https.");
      return;
    }
    stream.markdown(`Ready to compare **${urlA}** vs **${urlB}**.\n\n`);
    stream.button({
      command: "deepsyte.diffUrls",
      title: "Run visual diff",
      arguments: [urlA, urlB],
    });
    return;
  }
  stream.markdown(
    "I need **two** URLs to run a diff. Try: `@deepsyte /diff https://staging.example.com https://example.com`.\n\n",
  );
  stream.button({ command: "deepsyte.diffUrls", title: "Pick two URLs\u2026" });
}

function handleHelp(stream: vscode.ChatResponseStream, prompt: string): void {
  const url = extractUrl(prompt);
  if (url) {
    stream.markdown(`I detected **${url}**. What would you like to do?\n\n`);
    stream.button({
      command: "deepsyte.takeScreenshotAtUrl",
      title: `Screenshot ${url}`,
      arguments: [url],
    });
    stream.button({
      command: "deepsyte.auditUrl",
      title: `Audit ${url}`,
      arguments: [url],
    });
    return;
  }
  stream.markdown(
    [
      "I can capture screenshots and run UX audits without leaving chat. Try one of:",
      "",
      "- `@deepsyte /screenshot https://example.com`",
      "- `@deepsyte /audit https://example.com`",
      "- `@deepsyte /workflow` — list installed runbooks",
      "- `@deepsyte /timeline` — recent activity",
      "",
      "Or just paste a URL and I'll offer both options.",
    ].join("\n"),
  );
}
