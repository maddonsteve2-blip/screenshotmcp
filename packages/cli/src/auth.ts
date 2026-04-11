import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { createHash, randomBytes } from "crypto";
import open from "open";
import { getApiUrl, setApiKey } from "./config.js";

interface OAuthResult {
  apiKey: string;
}

export async function oauthLogin(): Promise<OAuthResult> {
  const apiUrl = getApiUrl();

  // Generate PKCE pair
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  // Find a free port for the callback server
  const port = await findFreePort();
  const redirectUri = `http://localhost:${port}/callback`;

  return new Promise((resolve, reject) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", `http://localhost:${port}`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h1>Error</h1><p>No authorization code received.</p>");
          server.close();
          reject(new Error("No authorization code received"));
          return;
        }

        try {
          // Exchange code for token
          const tokenRes = await fetch(`${apiUrl}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              code_verifier: codeVerifier,
              redirect_uri: redirectUri,
            }),
          });

          const tokenData = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string };

          if (!tokenData.access_token) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`<h1>Error</h1><p>${tokenData.error_description || tokenData.error || "Token exchange failed"}</p>`);
            server.close();
            reject(new Error(tokenData.error_description || "Token exchange failed"));
            return;
          }

          // Save the key
          setApiKey(tokenData.access_token);

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><meta charset="utf-8"><title>ScreenshotMCP</title></head>
              <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fafafa;">
                <div style="text-align: center;">
                  <h1 style="color: #16a34a;">Logged in to ScreenshotMCP</h1>
                  <p>Redirecting back to your editor...</p>
                  <p style="color: #888; font-size: 14px;">If nothing happens, you can close this tab.</p>
                </div>
                <script>
                  // Try to redirect back to the IDE that initiated the login
                  const schemes = ['cursor://', 'vscode://', 'windsurf://'];
                  let redirected = false;
                  for (const scheme of schemes) {
                    try {
                      const w = window.open(scheme, '_self');
                      if (w) { redirected = true; break; }
                    } catch(e) {}
                  }
                  // Auto-close tab after a short delay
                  setTimeout(() => { window.close(); }, 2000);
                </script>
              </body>
            </html>
          `);

          server.close();
          resolve({ apiKey: tokenData.access_token });
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`<h1>Error</h1><p>${err instanceof Error ? err.message : "Unknown error"}</p>`);
          server.close();
          reject(err);
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(port, () => {
      // Open browser to authorize
      const authorizeUrl = new URL(`${apiUrl}/oauth/authorize`);
      authorizeUrl.searchParams.set("client_id", "screenshotsmcp-cli");
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("code_challenge", codeChallenge);
      authorizeUrl.searchParams.set("code_challenge_method", "S256");
      authorizeUrl.searchParams.set("state", randomBytes(16).toString("hex"));

      open(authorizeUrl.toString());
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Login timed out after 5 minutes"));
    }, 5 * 60 * 1000);
  });
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not find free port")));
      }
    });
  });
}
