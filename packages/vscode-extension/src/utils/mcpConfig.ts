function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildWorkspaceMcpConfig(
  existing: Record<string, unknown>,
  apiUrl: string,
  apiKey: string,
): Record<string, unknown> {
  const existingMcp = isObject(existing.mcp) ? existing.mcp : {};
  const existingServers = isObject(existingMcp.servers) ? existingMcp.servers : {};

  return {
    ...existing,
    mcp: {
      ...existingMcp,
      servers: {
        ...existingServers,
        deepsyte: {
          type: "http",
          url: `${apiUrl}/mcp/${apiKey}`,
        },
      },
    },
  };
}
