"use client";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Shield, CheckCircle, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://screenshotsmcp-api-production.up.railway.app";

function normalizeRedirectUri(value: string): string {
  if (!value.includes("?") && /%3[fF]/.test(value)) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return value;
}

function redirectToClient(value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = value;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    window.location.assign(value);
  }, 250);
}

function getClientDetails(redirectUri: string, clientId: string): { label: string; actionLabel: string } {
  const normalizedClientId = clientId.toLowerCase();

  if (redirectUri.startsWith("windsurf://") || normalizedClientId.includes("windsurf")) {
    return { label: "Windsurf", actionLabel: "Open Windsurf" };
  }

  if (redirectUri.startsWith("cursor://") || normalizedClientId.includes("cursor")) {
    return { label: "Cursor", actionLabel: "Open Cursor" };
  }

  return { label: "VS Code", actionLabel: "Open VS Code" };
}

function AuthorizeContent() {
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded } = useAuth();
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnUri, setReturnUri] = useState<string | null>(null);

  const clientId = searchParams.get("client_id") || "mcp-client";
  const redirectUri = normalizeRedirectUri(searchParams.get("redirect_uri") || "");
  const state = searchParams.get("state") || "";
  const codeChallenge = searchParams.get("code_challenge") || "";
  const codeChallengeMethod = searchParams.get("code_challenge_method") || "S256";
  const client = getClientDetails(redirectUri, clientId);

  async function handleApprove() {
    if (!redirectUri) {
      setError("Missing redirect URI");
      return;
    }

    setApproving(true);
    setError(null);
    setReturnUri(null);

    try {
      let apiKey: string | undefined;
      const createRes = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `MCP Client (${clientId})`, revealExisting: true }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        throw new Error(created.error || "Failed to create API key");
      }

      if (created.key) {
        apiKey = created.key;
      } else if (created.requiresRotation) {
        const rotateRes = await fetch("/api/keys", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
        });
        const rotated = await rotateRes.json();
        if (!rotateRes.ok || !rotated.key) {
          throw new Error(rotated.error || "Failed to rotate API key");
        }
        apiKey = rotated.key;
      } else if (created.existing) {
        throw new Error("Existing API key could not be reused for OAuth");
      }

      if (!apiKey) {
        throw new Error("Failed to create API key");
      }

      // Exchange key for an authorization code via the API
      const codeRes = await fetch(`${API_URL}/oauth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          redirect_uri: redirectUri,
        }),
      });
      const codeData = await codeRes.json();
      if (!codeData.code) throw new Error("Failed to generate authorization code");

      const url = new URL(redirectUri);
      url.searchParams.set("code", codeData.code);
      if (state) url.searchParams.set("state", state);
      const callbackTarget = url.toString();
      setReturnUri(callbackTarget);
      setApproving(false);
      redirectToClient(callbackTarget);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authorization failed");
      setApproving(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSignedIn) {
    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Eye className="h-10 w-10 mx-auto mb-2 text-primary" />
            <CardTitle>Sign in Required</CardTitle>
            <CardDescription>
              Please sign in to authorize this connection.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button render={<a href={`/sign-in?redirect_url=${encodeURIComponent(currentUrl)}`} />}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Eye className="h-10 w-10 mx-auto mb-2 text-primary" />
          <CardTitle>Authorize Connection</CardTitle>
          <CardDescription>
            <strong>{clientId}</strong> wants to connect to your DeepSyte account in {client.label}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Shield className="h-5 w-5 text-primary" />
              <div className="text-sm">
                <p className="font-medium">Permissions requested</p>
                <p className="text-muted-foreground">
                  Take screenshots, control browser sessions, record videos, and access all MCP tools
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              DeepSyte uses one active API key. Approving will reuse your current key when possible, and only refresh older legacy keys that cannot be revealed safely.
            </p>
            <div className="rounded-lg border border-muted bg-muted/30 p-3 text-left text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">How to finish sign-in</p>
              <p>
                After you click <strong>Approve</strong>, your browser may ask to <strong>{client.actionLabel}</strong>. Choose
                <strong> Allow</strong> or <strong>{client.actionLabel}</strong> to complete sign-in.
              </p>
              <p>
                If {client.label} stays minimized, bring it to the front manually after approving.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          {returnUri && (
            <div className="rounded-lg border border-green-500/50 bg-green-50 dark:bg-green-950/20 p-4 space-y-3 text-center">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Approval complete. If {client.label} did not open automatically, use the button below.
              </p>
              <Button className="w-full" render={<a href={returnUri} />}>
                {client.actionLabel}
              </Button>
            </div>
          )}

          <details className="rounded-lg border border-muted bg-muted/20 p-4 text-sm">
            <summary className="cursor-pointer font-medium text-foreground">Having trouble? Use your API key instead</summary>
            <div className="mt-3 space-y-3 text-muted-foreground">
              <p>
                If the browser prompt is blocked or {client.label} does not return reliably, open your API key page and use the
                extension&apos;s <strong>Paste API key</strong> option to sign in manually.
              </p>
              <Button variant="outline" className="w-full" render={<a href="/dashboard/keys">Open API key page</a>}>
                Open API Key Page
              </Button>
            </div>
          </details>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => window.close()}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleApprove}
              disabled={approving || Boolean(returnUri)}
            >
              {approving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Approve
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <AuthorizeContent />
    </Suspense>
  );
}
