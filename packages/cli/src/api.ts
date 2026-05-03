import { getApiKey, getApiUrl, syncApiKeyFromEditorConfigs } from "./config.js";
export { getApiUrl };

interface McpResponse {
  result?: {
    content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    [key: string]: unknown;
  };
  error?: { code: number; message: string };
}

export async function callTool(toolName: string, args: Record<string, unknown> = {}): Promise<McpResponse> {
  const storedApiKey = getApiKey();
  const apiKey = syncApiKeyFromEditorConfigs(storedApiKey);
  if (!apiKey) {
    throw new Error("Not logged in. Run `deepsyte login` first.");
  }
  if (!apiKey.startsWith("dso_")) {
    throw new Error("Website sign-in required. Run `deepsyte login` to authorize through the DeepSyte dashboard.");
  }

  return callToolWithKey(toolName, args, apiKey, true);
}

async function callToolWithKey(
  toolName: string,
  args: Record<string, unknown>,
  apiKey: string,
  allowEditorSyncRetry: boolean,
): Promise<McpResponse> {

  const apiUrl = getApiUrl();
  const url = `${apiUrl}/mcp`;

  // First, initialize
  const initRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "deepsyte-cli", version: "1.0.0" },
      },
    }),
  });

  if (!initRes.ok) {
    const text = await initRes.text();
    if (allowEditorSyncRetry && isInvalidApiKeyResponse(initRes.status, text)) {
      const syncedKey = syncApiKeyFromEditorConfigs(apiKey);
      if (syncedKey && syncedKey !== apiKey) {
        return callToolWithKey(toolName, args, syncedKey, false);
      }
    }
    throw new Error(`API error (${initRes.status}): ${text}`);
  }

  // Parse SSE response to get session info
  const initBody = await initRes.text();
  const sessionId = initRes.headers.get("mcp-session-id");

  // Call the tool
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${apiKey}`,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const toolRes = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!toolRes.ok) {
    const text = await toolRes.text();
    if (allowEditorSyncRetry && isInvalidApiKeyResponse(toolRes.status, text)) {
      const syncedKey = syncApiKeyFromEditorConfigs(apiKey);
      if (syncedKey && syncedKey !== apiKey) {
        return callToolWithKey(toolName, args, syncedKey, false);
      }
    }
    throw new Error(`Tool call failed (${toolRes.status}): ${text}`);
  }

  const toolBody = await toolRes.text();
  const parsed = parseSseResponse(toolBody);
  if (allowEditorSyncRetry && hasInvalidApiKeyPayload(parsed)) {
    const syncedKey = syncApiKeyFromEditorConfigs(apiKey);
    if (syncedKey && syncedKey !== apiKey) {
      return callToolWithKey(toolName, args, syncedKey, false);
    }
  }
  return parsed;
}

function isInvalidApiKeyResponse(status: number, body: string): boolean {
  return status === 401 || /invalid or revoked api key|website sign-in required/i.test(body);
}

function hasInvalidApiKeyPayload(response: McpResponse): boolean {
  if (response.error?.message && /invalid or revoked api key|website sign-in required/i.test(response.error.message)) {
    return true;
  }

  const content = response.result?.content ?? [];
  return content.some((item) => item.type === "text" && /invalid or revoked api key|website sign-in required/i.test(item.text ?? ""));
}

function parseSseResponse(body: string): McpResponse {
  // SSE responses have "event: message\ndata: {...}\n\n" format
  const lines = body.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        // continue
      }
    }
  }
  // Try parsing as plain JSON
  try {
    return JSON.parse(body);
  } catch {
    return { error: { code: -1, message: `Unexpected response: ${body.slice(0, 200)}` } };
  }
}

export function extractText(response: McpResponse): string {
  if (response.error) return `Error: ${response.error.message}`;
  if (!response.result?.content) return "No content returned";
  return response.result.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n");
}

export function extractImageUrl(response: McpResponse): string | null {
  const text = extractText(response);
  const urlMatch = text.match(/https?:\/\/[^\s"]+\.(png|jpg|jpeg|webp|gif|pdf)/i);
  return urlMatch ? urlMatch[0] : null;
}

// ──────────────────────────────────────────────────────────────────────────
// REST helpers for CLI-driven runs (local-browser bridge).
// ──────────────────────────────────────────────────────────────────────────

function getAuthedApiKey(): string {
  const storedApiKey = getApiKey();
  const apiKey = syncApiKeyFromEditorConfigs(storedApiKey);
  if (!apiKey) {
    throw new Error("Not logged in. Run `deepsyte login` first.");
  }
  if (!apiKey.startsWith("dso_")) {
    throw new Error("Website sign-in required. Run `deepsyte login` to authorize through the DeepSyte dashboard.");
  }
  return apiKey;
}

export async function ensureWebsiteAuthenticated(): Promise<void> {
  const apiKey = getAuthedApiKey();
  const res = await fetch(`${getApiUrl()}/v1/auth/whoami`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Website sign-in required. Run \`deepsyte login\` to authorize through the DeepSyte dashboard. (${res.status}: ${text.slice(0, 200)})`);
  }
}

async function restJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const apiKey = getAuthedApiKey();
  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface CreateRunInput {
  startUrl?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  userGoal?: string;
  workflowName?: string;
}

export async function createCliRun(input: CreateRunInput = {}): Promise<{ runId: string }> {
  return restJson<{ runId: string }>("POST", "/v1/runs", input);
}

export interface StepInput {
  pngBase64: string;
  toolName: string;
  prevUrl?: string | null;
  nextUrl?: string | null;
  prevTitle?: string | null;
  pageTitle?: string | null;
  prevHeading?: string | null;
  heading?: string | null;
  arg?: string | null;
  arg2?: string | null;
  agentNote?: string | null;
  width?: number;
  height?: number;
}

export async function postRunStep(runId: string, step: StepInput): Promise<{
  screenshotId: string;
  publicUrl: string;
  stepIndex: number;
  actionLabel: string;
  outcome: string;
}> {
  return restJson("POST", `/v1/runs/${runId}/steps`, step);
}

export async function finishCliRun(
  runId: string,
  data: { status?: "completed" | "failed"; finalUrl?: string; pageTitle?: string } = {},
): Promise<void> {
  await restJson("PATCH", `/v1/runs/${runId}`, { status: data.status ?? "completed", ...data });
}

export async function writeRunOutcome(
  runId: string,
  outcome: {
    problem?: string;
    summary?: string;
    verdict?: "passed" | "failed" | "inconclusive" | "flaky";
    nextActions?: string[];
    findings?: Array<Record<string, unknown>>;
    userGoal?: string;
    taskType?: string;
  },
): Promise<void> {
  await restJson("POST", `/v1/runs/${runId}/outcome`, outcome);
}
