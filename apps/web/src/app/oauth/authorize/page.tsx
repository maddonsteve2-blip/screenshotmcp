"use client";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Shield, CheckCircle, Loader2 } from "lucide-react";

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

function getClientDetails(
  redirectUri: string,
  clientId: string,
  clientName: string,
): { label: string; actionLabel: string; finishText: string; minimizedText: string } {
  const normalizedClientId = clientId.toLowerCase();
  const normalizedClientName = clientName.toLowerCase();

  if (redirectUri.startsWith("windsurf://") || normalizedClientId.includes("windsurf") || normalizedClientName.includes("windsurf")) {
    return {
      label: "Windsurf",
      actionLabel: "Open Windsurf",
      finishText: "your browser may ask to open Windsurf. Choose Allow or Open Windsurf to complete sign-in.",
      minimizedText: "If Windsurf stays minimized, bring it to the front manually after approving.",
    };
  }

  if (redirectUri.startsWith("cursor://") || normalizedClientId.includes("cursor") || normalizedClientName.includes("cursor")) {
    return {
      label: "Cursor",
      actionLabel: "Open Cursor",
      finishText: "your browser may ask to open Cursor. Choose Allow or Open Cursor to complete sign-in.",
      minimizedText: "If Cursor stays minimized, bring it to the front manually after approving.",
    };
  }

  if (normalizedClientName.includes("codex") || normalizedClientId.startsWith("deepsyte-mcp-")) {
    return {
      label: "Codex",
      actionLabel: "Return to Codex",
      finishText: "you should be returned to Codex automatically. If the browser asks permission, allow it to complete sign-in.",
      minimizedText: "If Codex does not reconnect immediately, return to Codex and retry the DeepSyte tool.",
    };
  }

  return {
    label: clientName || "your MCP client",
    actionLabel: "Return to app",
    finishText: "you should be returned to your MCP client automatically. If the browser asks permission, allow it to complete sign-in.",
    minimizedText: "If your MCP client does not reconnect immediately, return to it and retry the DeepSyte tool.",
  };
}

function AuthorizeContent() {
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded } = useAuth();
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnUri, setReturnUri] = useState<string | null>(null);

  const clientId = searchParams.get("client_id") || "mcp-client";
  const clientName = searchParams.get("client_name") || "";
  const redirectUri = normalizeRedirectUri(searchParams.get("redirect_uri") || "");
  const state = searchParams.get("state") || "";
  const codeChallenge = searchParams.get("code_challenge") || "";
  const codeChallengeMethod = searchParams.get("code_challenge_method") || "S256";
  const resource = searchParams.get("resource") || "";
  const client = getClientDetails(redirectUri, clientId, clientName);

  async function handleApprove() {
    if (!redirectUri) {
      setError("Missing redirect URI");
      return;
    }

    setApproving(true);
    setError(null);
    setReturnUri(null);

    try {
      const codeRes = await fetch("/api/oauth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          redirect_uri: redirectUri,
          resource,
        }),
      });
      const codeData = await codeRes.json();
      if (!codeRes.ok || !codeData.code) {
        throw new Error(codeData.error || "Failed to generate authorization code");
      }

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
              Approving creates a short-lived MCP session token for this client. Raw API keys cannot authorize MCP access.
            </p>
            <div className="rounded-lg border border-muted bg-muted/30 p-3 text-left text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">How to finish sign-in</p>
            <p>
                After you click <strong>Approve</strong>, {client.finishText}
              </p>
              <p>{client.minimizedText}</p>
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
            <summary className="cursor-pointer font-medium text-foreground">Having trouble?</summary>
            <div className="mt-3 space-y-3 text-muted-foreground">
              <p>
                If the browser prompt is blocked or {client.label} does not return reliably, reopen this authorization page from the client.
              </p>
              <Button variant="outline" className="w-full" render={<a href="/dashboard">Open Dashboard</a>}>
                Open Dashboard
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
