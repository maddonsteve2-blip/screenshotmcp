"use client";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Shield, CheckCircle, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://screenshotsmcp-api-production.up.railway.app";

function AuthorizeContent() {
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded } = useAuth();
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientId = searchParams.get("client_id") || "mcp-client";
  const redirectUri = searchParams.get("redirect_uri") || "";
  const state = searchParams.get("state") || "";
  const codeChallenge = searchParams.get("code_challenge") || "";
  const codeChallengeMethod = searchParams.get("code_challenge_method") || "S256";

  async function handleApprove() {
    if (!redirectUri) {
      setError("Missing redirect URI");
      return;
    }

    setApproving(true);
    setError(null);

    try {
      // Create a new API key for this OAuth connection
      const createRes = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `MCP Client (${clientId})` }),
      });
      const created = await createRes.json();
      if (!created.key) throw new Error("Failed to create API key");

      // Exchange key for an authorization code via the API
      const codeRes = await fetch(`${API_URL}/oauth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: created.key,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          redirect_uri: redirectUri,
        }),
      });
      const codeData = await codeRes.json();
      if (!codeData.code) throw new Error("Failed to generate authorization code");

      // Redirect back to the MCP client with the code
      const url = new URL(redirectUri);
      url.searchParams.set("code", codeData.code);
      if (state) url.searchParams.set("state", state);
      window.location.href = url.toString();
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
            <Camera className="h-10 w-10 mx-auto mb-2 text-primary" />
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
          <Camera className="h-10 w-10 mx-auto mb-2 text-primary" />
          <CardTitle>Authorize Connection</CardTitle>
          <CardDescription>
            <strong>{clientId}</strong> wants to connect to your ScreenshotsMCP account.
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
              A new API key will be created for this connection. You can revoke it anytime from your dashboard.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

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
              disabled={approving}
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
