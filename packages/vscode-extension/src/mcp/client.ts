import { getApiUrl } from "../settings";
import { extractText, parseSseResponse, type McpResponse } from "./response";

export async function callTool(apiKey: string, toolName: string, args: Record<string, unknown> = {}): Promise<McpResponse> {
  const apiUrl = getApiUrl();
  const url = `${apiUrl}/mcp`;
  const initResponse = await fetch(url, {
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
        clientInfo: {
          name: "screenshotsmcp-vscode-extension",
          version: "0.0.1",
        },
      },
    }),
  });

  if (!initResponse.ok) {
    throw new Error(`Initialize failed (${initResponse.status}): ${await initResponse.text()}`);
  }

  const sessionId = initResponse.headers.get("mcp-session-id");
  await initResponse.text();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${apiKey}`,
  };

  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  const toolResponse = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!toolResponse.ok) {
    throw new Error(`Tool call failed (${toolResponse.status}): ${await toolResponse.text()}`);
  }

  return parseSseResponse(await toolResponse.text());
}

export async function validateApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await callTool(apiKey, "list_recent_screenshots", { limit: 1 });
    const text = extractText(result);
    if (/invalid or revoked api key|api key required/i.test(text)) {
      return { ok: false, message: text };
    }
    return { ok: true, message: text };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export { extractImageUrl, extractText } from "./response";
