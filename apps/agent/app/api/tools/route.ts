import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.DEEPSYTE_API_URL ||
  "https://deepsyte-api-production.up.railway.app";
const API_KEY = process.env.DEEPSYTE_AGENT_API_KEY!;

/**
 * Calls a DeepSyte tool via the MCP Streamable HTTP endpoint.
 * Handles both JSON and SSE response formats.
 */
async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${API_URL}/mcp/${API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${Date.now()}`,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`MCP call failed: ${response.status} ${text}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const dataLines = text
      .split("\n")
      .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"));

    for (const line of dataLines) {
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.result !== undefined) return parseMcpResult(parsed.result);
        if (parsed.error) throw new Error(parsed.error.message);
      } catch {
        /* try next line */
      }
    }
    throw new Error("No result found in MCP SSE response");
  }

  const json = await response.json();
  if (json.error) throw new Error(json.error.message);
  return parseMcpResult(json.result);
}

/**
 * Extracts the actual payload from an MCP tool result.
 * MCP tools return: { content: [{ type: "text", text: "<json string>" }] }
 */
function parseMcpResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as { content?: Array<{ type: string; text?: string }> };
  if (Array.isArray(r.content)) {
    const textItem = r.content.find((c) => c.type === "text");
    if (textItem?.text) {
      try {
        return JSON.parse(textItem.text);
      } catch {
        return textItem.text;
      }
    }
    const imageItem = r.content.find((c) => c.type === "image");
    if (imageItem) return imageItem;
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, args } = body as {
      tool: string;
      args?: Record<string, unknown>;
    };

    if (!tool) {
      return NextResponse.json(
        { error: "Missing required field: tool" },
        { status: 400 }
      );
    }

    if (!API_KEY) {
      return NextResponse.json(
        { error: "DEEPSYTE_AGENT_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const result = await callMcpTool(tool, args || {});
    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool execution failed";
    console.error("[/api/tools]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
