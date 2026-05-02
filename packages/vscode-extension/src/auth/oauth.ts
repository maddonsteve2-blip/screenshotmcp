import * as vscode from "vscode";
import { randomBytes } from "crypto";
import { AuthStore } from "./store";
import { buildAuthorizationUrl, createPkceChallenge } from "./oauthUtils";
import { ScreenshotsMcpServerProvider } from "../mcp/serverProvider";
import { logLine } from "../output";
import { getApiUrl, getDashboardUrl } from "../settings";
import { TimelineStore } from "../timeline/store";
import { StatusBarController } from "../views/statusBar";

interface OAuthSignInOptions {
  automatic: boolean;
}

interface PendingOAuthRequest {
  automatic: boolean;
  authorizationUrl: string;
  redirectUri: string;
  resolver: (apiKey: string | undefined) => void;
  state: string;
  timer: NodeJS.Timeout;
  verifier: string;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export class OAuthController implements vscode.UriHandler, vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  private pending: PendingOAuthRequest | undefined;

  private pendingPromise: Promise<string | undefined> | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly authStore: AuthStore,
    private readonly provider: ScreenshotsMcpServerProvider,
    private readonly statusBar: StatusBarController,
    private readonly timelineStore: TimelineStore,
  ) {
    this.disposables.push(vscode.window.registerUriHandler(this));
  }

  async signIn(options: OAuthSignInOptions): Promise<string | undefined> {
    const existing = await this.authStore.getApiKey();
    if (existing) {
      return existing;
    }

    if (this.pendingPromise) {
      if (!options.automatic && this.pending) {
        logLine("OAuth sign-in already pending. Reopening browser.");
        await vscode.env.openExternal(vscode.Uri.parse(this.pending.authorizationUrl));
      }
      return this.pendingPromise;
    }

    this.pendingPromise = this.startFlow(options).finally(() => {
      this.pendingPromise = undefined;
    });

    return this.pendingPromise;
  }

  async handleUri(uri: vscode.Uri): Promise<void> {
    if (!uri.path.endsWith("/auth-callback")) {
      return;
    }

    if (!this.pending) {
      return;
    }

    const code = getQueryParam(uri, "code");
    const error = getQueryParam(uri, "error");
    const errorDescription = getQueryParam(uri, "error_description");
    const state = getQueryParam(uri, "state");

    if (state !== this.pending.state) {
      logLine("Ignoring OAuth callback with mismatched state.");
      return;
    }

    const pending = this.pending;
    clearTimeout(pending.timer);
    this.pending = undefined;

    if (error) {
      const message = errorDescription ?? error;
      this.timelineStore.add({
        title: "OAuth sign-in failed",
        detail: message,
        status: "error",
      });
      vscode.window.showErrorMessage(`DeepSyte sign-in failed: ${message}`);
      pending.resolver(undefined);
      return;
    }

    if (!code) {
      this.timelineStore.add({
        title: "OAuth sign-in failed",
        detail: "Authorization code missing from callback.",
        status: "error",
      });
      vscode.window.showErrorMessage("DeepSyte sign-in failed: authorization code missing.");
      pending.resolver(undefined);
      return;
    }

    try {
      const apiKey = await exchangeAuthorizationCode(code, pending.verifier, pending.redirectUri);
      await this.authStore.setApiKey(apiKey);
      this.provider.refresh();
      this.statusBar.update(true);
      logLine("DeepSyte OAuth sign-in completed.");
      this.timelineStore.add({
        title: "Signed in with OAuth",
        detail: `Connected to ${getApiUrl()}`,
        status: "success",
      });
      vscode.window.showInformationMessage("DeepSyte connected.");
      pending.resolver(apiKey);
    } catch (errorValue) {
      const message = errorValue instanceof Error ? errorValue.message : String(errorValue);
      logLine(`DeepSyte OAuth callback failed: ${message}`);
      this.timelineStore.add({
        title: "OAuth sign-in failed",
        detail: message,
        status: "error",
      });
      vscode.window.showErrorMessage(`DeepSyte sign-in failed: ${message}`);
      pending.resolver(undefined);
    }
  }

  dispose(): void {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolver(undefined);
      this.pending = undefined;
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async startFlow(options: OAuthSignInOptions): Promise<string | undefined> {
    const verifier = createRandomBase64Url(32);
    const state = createRandomBase64Url(24);
    const challenge = createPkceChallenge(verifier);
    logLine(`Editor host identity: appName=${vscode.env.appName}, uriScheme=${vscode.env.uriScheme}`);
    const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://${this.context.extension.id}/auth-callback`));
    const redirectUri = normalizeRedirectUri(callbackUri.toString(true));
    const authorizationUrl = buildAuthorizationUrl(getDashboardUrl(), this.context.extension.id, redirectUri, state, challenge);

    this.timelineStore.add({
      title: options.automatic ? "OAuth sign-in started automatically" : "OAuth sign-in started",
      detail: `Opening browser sign-in for ${getDashboardUrl()}`,
      status: "info",
    });
    logLine(`Opening OAuth sign-in against ${getDashboardUrl()}`);

    const promise = new Promise<string | undefined>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending?.state !== state) {
          return;
        }
        this.pending = undefined;
        logLine("DeepSyte OAuth sign-in timed out.");
        this.timelineStore.add({
          title: "OAuth sign-in timed out",
          detail: "Browser authorization was not completed within 5 minutes.",
          status: "error",
        });
        resolve(undefined);
      }, 5 * 60 * 1000);

      this.pending = {
        automatic: options.automatic,
        authorizationUrl,
        redirectUri,
        resolver: resolve,
        state,
        timer,
        verifier,
      };
    });

    const opened = await vscode.env.openExternal(vscode.Uri.parse(authorizationUrl));
    if (!opened) {
      if (this.pending?.state === state) {
        clearTimeout(this.pending.timer);
        this.pending = undefined;
      }
      vscode.window.showErrorMessage("DeepSyte sign-in failed: could not open the browser.");
      return undefined;
    }

    return promise;
  }
}

function createRandomBase64Url(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

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

async function exchangeAuthorizationCode(code: string, verifier: string, redirectUri: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });

  const response = await fetch(new URL("/oauth/token", getApiUrl()), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await response.json() as TokenResponse;
  if (!response.ok) {
    throw new Error(data.error_description ?? data.error ?? `Token exchange failed (${response.status})`);
  }

  if (!data.access_token) {
    throw new Error("OAuth token response did not include an access token.");
  }

  return data.access_token;
}

function getQueryParam(uri: vscode.Uri, key: string): string | undefined {
  const params = new URLSearchParams(uri.query);
  return params.get(key) ?? undefined;
}
