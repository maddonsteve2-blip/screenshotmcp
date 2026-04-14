export interface McpContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface McpResponse {
  result?: {
    content?: McpContent[];
    [key: string]: unknown;
  };
  error?: {
    code: number;
    message: string;
  };
}

export function parseSseResponse(body: string): McpResponse {
  const lines = body.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        return JSON.parse(line.slice(6)) as McpResponse;
      } catch {
      }
    }
  }

  try {
    return JSON.parse(body) as McpResponse;
  } catch {
    return { error: { code: -1, message: `Unexpected response: ${body.slice(0, 200)}` } };
  }
}

export function extractText(response: McpResponse): string {
  if (response.error) {
    return `Error: ${response.error.message}`;
  }

  if (!response.result?.content) {
    return "No content returned";
  }

  return response.result.content
    .filter((entry) => entry.type === "text" && entry.text)
    .map((entry) => entry.text ?? "")
    .join("\n");
}

export function extractImageUrl(response: McpResponse): string | null {
  const text = extractText(response);
  const match = text.match(/https?:\/\/[^\s"]+\.(png|jpg|jpeg|webp|gif|pdf)/i);
  return match ? match[0] : null;
}
