import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { createHash, randomBytes } from "crypto";
import { execSync } from "child_process";
import open from "open";
import { getApiUrl, setApiKey } from "./config.js";

interface OAuthResult {
  apiKey: string;
}

// --- IDE Fingerprinting ---
type DetectedIDE = "cursor" | "windsurf" | "vscode" | "unknown";

function detectIDE(): DetectedIDE {
  const env = process.env;

  // Cursor-specific markers
  if (env.CURSOR_LAYOUT || env.CURSOR_SPAWNED_BY_EXTENSION_ID) return "cursor";

  // Windsurf-specific markers
  if (env.WINDSURF_IS_REMOTE) return "windsurf";

  // Check IPC hook path for IDE identity
  const ipcHook = env.VSCODE_IPC_HOOK || env.VSCODE_IPC_HOOK_CLI || "";
  if (/cursor/i.test(ipcHook)) return "cursor";
  if (/windsurf|codeium/i.test(ipcHook)) return "windsurf";
  if (/code|vscode/i.test(ipcHook)) return "vscode";

  // Check TERM_PROGRAM and executable paths
  const termProgram = env.TERM_PROGRAM || "";
  if (/cursor/i.test(termProgram)) return "cursor";
  if (/windsurf/i.test(termProgram)) return "windsurf";
  if (/vscode/i.test(termProgram)) return "vscode";

  // Check parent process path hints
  const editorPath = env.VSCODE_CWD || env._ || "";
  if (/cursor/i.test(editorPath)) return "cursor";
  if (/windsurf|codeium/i.test(editorPath)) return "windsurf";
  if (/code/i.test(editorPath)) return "vscode";

  return "unknown";
}

const IDE_SCHEMES: Record<DetectedIDE, string> = {
  cursor: "cursor://",
  windsurf: "windsurf://",
  vscode: "vscode://",
  unknown: "vscode://",
};

const IDE_NAMES: Record<DetectedIDE, string> = {
  cursor: "Cursor",
  windsurf: "Windsurf",
  vscode: "VS Code",
  unknown: "your editor",
};

// --- Native OS Refocusing ---
function refocusIDE(ide: DetectedIDE): void {
  try {
    const platform = process.platform;
    const pid = process.env.VSCODE_PID;

    if (platform === "darwin") {
      // macOS: use AppleScript to activate IDE by PID or app name
      if (pid) {
        execSync(`osascript -e 'tell application "System Events" to set frontmost of the first process whose unix id is ${pid} to true'`, { stdio: "ignore" });
      } else {
        const appName = ide === "cursor" ? "Cursor" : ide === "windsurf" ? "Windsurf" : "Visual Studio Code";
        execSync(`osascript -e 'tell application "${appName}" to activate'`, { stdio: "ignore" });
      }
    } else if (platform === "win32") {
      // Windows: use PowerShell to bring IDE window to foreground
      if (pid) {
        execSync(`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).AppActivate((Get-Process -Id ${pid}).MainWindowTitle)"`, { stdio: "ignore" });
      } else {
        const procName = ide === "cursor" ? "Cursor" : ide === "windsurf" ? "Windsurf" : "Code";
        execSync(`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).AppActivate('${procName}')"`, { stdio: "ignore" });
      }
    }
    // Linux: xdotool/wmctrl could be used but Wayland blocks it, so skip
  } catch {
    // Refocusing is best-effort, never fail the login flow
  }
}

// --- Success Page HTML ---
function buildSuccessPage(ide: DetectedIDE): string {
  const scheme = IDE_SCHEMES[ide];
  const name = IDE_NAMES[ide];

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>ScreenshotsMCP</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fafafa; color: #111;">
  <div style="text-align: center; max-width: 400px; padding: 2rem;">
    <div style="width: 64px; height: 64px; border-radius: 50%; background: #dcfce7; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
      <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#16a34a" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
    </div>
    <h1 style="font-size: 1.5rem; font-weight: 700; margin: 0 0 0.5rem;">Logged in to ScreenshotsMCP</h1>
    <p style="color: #666; margin: 0 0 1.5rem; font-size: 0.95rem;">Authentication successful.</p>
    <a href="${scheme}" id="return-btn" style="display: inline-block; padding: 0.75rem 2rem; background: #111; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.95rem; transition: background 0.15s;">
      Return to ${name}
    </a>
    <p style="color: #999; font-size: 0.8rem; margin-top: 1rem;">Or close this tab and return to your terminal.</p>
  </div>
  <script>
    // Auto-attempt the protocol redirect after 1 second (user-initiated feel from page load)
    setTimeout(function() {
      try { window.location.href = "${scheme}"; } catch(e) {}
    }, 1000);
    // Try to close this tab after 3 seconds
    setTimeout(function() { window.close(); }, 3000);
  </script>
</body>
</html>`;
}

export async function oauthLogin(): Promise<OAuthResult> {
  const apiUrl = getApiUrl();
  const ide = detectIDE();

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
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
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
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`<h1>Error</h1><p>${tokenData.error_description || tokenData.error || "Token exchange failed"}</p>`);
            server.close();
            reject(new Error(tokenData.error_description || "Token exchange failed"));
            return;
          }

          // Save the key
          setApiKey(tokenData.access_token);

          // Serve the success page with IDE-aware return button
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(buildSuccessPage(ide));

          server.close();

          // Native OS refocusing — bring IDE window to foreground
          refocusIDE(ide);

          resolve({ apiKey: tokenData.access_token });
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>Error</h1><p>${err instanceof Error ? err.message : "Unknown error"}</p>`);
          server.close();
          reject(err);
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(port, "127.0.0.1", () => {
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
