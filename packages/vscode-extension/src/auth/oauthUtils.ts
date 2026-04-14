import { createHash } from "crypto";

export function buildAuthorizationUrl(apiUrl: string, clientId: string, redirectUri: string, state: string, challenge: string): string {
  const url = new URL("/oauth/authorize", apiUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function createPkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
