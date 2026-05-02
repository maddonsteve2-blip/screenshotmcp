const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://deepsyte-api-production.up.railway.app";
const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET ?? "").trim();

export function getInternalApiBase(): string {
  return API_BASE;
}

export function getInternalApiHeaders(userId: string): Record<string, string> {
  if (!INTERNAL_SECRET) {
    throw new Error("INTERNAL_API_SECRET is not set");
  }

  return {
    Authorization: `Internal ${INTERNAL_SECRET}:${userId}`,
  };
}
