"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Check, Copy, Download, Terminal, AlertCircle, ExternalLink } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://screenshotsmcp-api-production.up.railway.app";
const MCP_URL = `${API_BASE}/mcp`;

const TEST_PROMPTS = [
  "Take a screenshot of https://example.com and describe what you see",
  "Screenshot https://github.com at mobile viewport (390px wide)",
  "Take a full-page screenshot of https://vercel.com",
  "Screenshot https://news.ycombinator.com and list the top 5 stories",
];

function CopyBlock({ code, id, label, copiedId, onCopy }: {
  code: string; id: string; label?: string;
  copiedId: string | null; onCopy: (text: string, id: string) => void;
}) {
  return (
    <div>
      {label && <p className="text-sm font-medium mb-2">{label}</p>}
      <div className="relative">
        <pre className="rounded-md bg-muted p-4 text-xs overflow-x-auto pr-12 leading-relaxed">
          <code>{code}</code>
        </pre>
        <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7" onClick={() => onCopy(code, id)}>
          {copiedId === id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function DeepLinkButton({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  return (
    <div>
      <a href={disabled ? undefined : href}>
        <Button disabled={disabled} className="gap-2">
          <Download className="h-4 w-4" />
          {label}
        </Button>
      </a>
      {disabled && <p className="text-xs text-muted-foreground mt-2">Enter or create an API key above first.</p>}
    </div>
  );
}

export default function InstallPage() {
  const [apiKey, setApiKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKeyCreated, setNewKeyCreated] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function createAndUseKey() {
    setCreating(true);
    const res = await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "MCP Install" }) });
    const data = await res.json();
    if (data.key) { setApiKey(data.key); setNewKeyCreated(true); }
    setCreating(false);
  }

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const key = apiKey || "YOUR_API_KEY";
  const isKeySet = !!apiKey;
  const mcpKeyUrl = `${MCP_URL}/${key}`;

  // Cursor: path-based key in URL (works without headers)
  const cursorDeepLinkConfig = JSON.stringify({ url: mcpKeyUrl });
  const cursorDeepLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=screenshotsmcp&config=${encodeURIComponent(btoa(cursorDeepLinkConfig))}`;
  const cursorManual = `{
  "mcpServers": {
    "screenshotsmcp": {
      "url": "${mcpKeyUrl}"
    }
  }
}`;

  // VS Code: deep link + settings.json
  const vscodeDeepLinkConfig = JSON.stringify({ name: "screenshotsmcp", type: "http", url: mcpKeyUrl });
  const vscodeDeepLink = `vscode:mcp/install?${encodeURIComponent(vscodeDeepLinkConfig)}`;
  const vscodeConfig = `{
  "mcp": {
    "servers": {
      "screenshotsmcp": {
        "type": "http",
        "url": "${mcpKeyUrl}"
      }
    }
  }
}`;

  // Claude Desktop: Windows (cmd wrapper) + macOS
  const claudeConfigWindows = `{
  "mcpServers": {
    "screenshotsmcp": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "mcp-remote@latest", "${mcpKeyUrl}"]
    }
  }
}`;
  const claudeConfigMac = `{
  "mcpServers": {
    "screenshotsmcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "${mcpKeyUrl}"]
    }
  }
}`;

  // Claude Code CLI (global scope with -s user)
  const claudeCodeCmd = `claude mcp add --transport http screenshotsmcp -s user ${mcpKeyUrl}`;

  // Windsurf
  const windsurfConfig = `{
  "mcpServers": {
    "screenshotsmcp": {
      "serverUrl": "${mcpKeyUrl}"
    }
  }
}`;

  // n8n / generic
  const genericUrl = mcpKeyUrl;
  const genericHeader = `Authorization: Bearer ${key}`;

  return (
    <div className="p-8 max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Install</h1>
        <p className="text-muted-foreground mt-1">Add screenshotsmcp to your AI coding tool in 30 seconds.</p>
      </div>

      {/* Step 1 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">1</div>
          <h2 className="font-semibold text-base">Get your API key</h2>
        </div>
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex gap-2">
              <Input placeholder="sk_live_... (paste your key or create one)" value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setNewKeyCreated(false); }} className="font-mono text-sm" />
              <Button variant="outline" onClick={createAndUseKey} disabled={creating} className="shrink-0">
                {creating ? "Creating..." : "Create new"}
              </Button>
            </div>
            {newKeyCreated && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-200">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Key created! Save it now — it won&apos;t be shown again after you leave.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Step 2 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">2</div>
          <h2 className="font-semibold text-base">Add to your AI tool</h2>
        </div>

        <Tabs defaultValue="cursor">
          <TabsList className="w-full flex flex-wrap gap-1 h-auto p-1">
            <TabsTrigger value="cursor" className="flex-1">Cursor</TabsTrigger>
            <TabsTrigger value="vscode" className="flex-1">VS Code</TabsTrigger>
            <TabsTrigger value="claude" className="flex-1">Claude Desktop</TabsTrigger>
            <TabsTrigger value="claude-code" className="flex-1">Claude Code</TabsTrigger>
            <TabsTrigger value="windsurf" className="flex-1">Windsurf</TabsTrigger>
            <TabsTrigger value="other" className="flex-1">n8n / Other</TabsTrigger>
          </TabsList>

          {/* CURSOR */}
          <TabsContent value="cursor" className="mt-3">
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-3">One-click install — Cursor will add the config automatically.</p>
                  <DeepLinkButton href={cursorDeepLink} disabled={!isKeySet} label="Install in Cursor" />
                </div>
                <Separator />
                <CopyBlock code={cursorManual} id="cursor-manual" label="Or add manually to ~/.cursor/mcp.json" copiedId={copiedId} onCopy={copy} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* VS CODE */}
          <TabsContent value="vscode" className="mt-3">
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-3">One-click install for VS Code 1.99+ with MCP support enabled.</p>
                  <DeepLinkButton href={vscodeDeepLink} disabled={!isKeySet} label="Install in VS Code" />
                </div>
                <Separator />
                <CopyBlock code={vscodeConfig} id="vscode" label="Or add manually to .vscode/mcp.json (workspace) or settings.json" copiedId={copiedId} onCopy={copy} />
                <p className="text-xs text-muted-foreground">Enable <code className="bg-muted px-1 rounded">chat.mcp.enabled</code> in VS Code settings if not already on.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CLAUDE DESKTOP */}
          <TabsContent value="claude" className="mt-3">
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/20 p-3 text-xs text-green-800 dark:text-green-200">
                  <strong>Pro/Max Plan?</strong> Use the native connector: Settings → Integrations → Add Custom Integration → paste <code className="bg-green-100 dark:bg-green-900/40 px-1 rounded">{mcpKeyUrl}</code> — no Node.js required.
                </div>
                <Separator />
                <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 text-xs text-blue-800 dark:text-blue-200">
                  <strong>Free Plan:</strong> Requires Node.js. Uses <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">mcp-remote</code> as a local bridge to reach the remote server.
                </div>
                <p className="text-sm text-muted-foreground">
                  Edit <code className="bg-muted px-1.5 py-0.5 rounded text-xs">claude_desktop_config.json</code> — then fully quit and relaunch Claude Desktop.<br />
                  <span className="text-xs text-muted-foreground">macOS: <code className="bg-muted px-1 rounded">~/Library/Application Support/Claude/</code> &nbsp;|&nbsp; Windows: <code className="bg-muted px-1 rounded">%APPDATA%\Claude\</code></span>
                </p>
                <CopyBlock code={claudeConfigWindows} id="claude-win" label="Windows" copiedId={copiedId} onCopy={copy} />
                <CopyBlock code={claudeConfigMac} id="claude-mac" label="macOS / Linux" copiedId={copiedId} onCopy={copy} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* CLAUDE CODE */}
          <TabsContent value="claude-code" className="mt-3">
            <Card>
              <CardContent className="pt-5 space-y-4">
                <p className="text-sm text-muted-foreground">Run this command in your terminal. Claude Code natively supports HTTP MCP servers.</p>
                <CopyBlock code={claudeCodeCmd} id="claude-code" copiedId={copiedId} onCopy={copy} />
                <p className="text-xs text-muted-foreground">The <code className="bg-muted px-1 rounded">-s user</code> flag makes it available globally (not just the current project). Type <code className="bg-muted px-1 rounded">/mcp</code> in Claude Code to verify.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* WINDSURF */}
          <TabsContent value="windsurf" className="mt-3">
            <Card>
              <CardContent className="pt-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Add to <code className="bg-muted px-1.5 py-0.5 rounded text-xs">~/.codeium/windsurf/mcp_config.json</code> under <code className="bg-muted px-1.5 py-0.5 rounded text-xs">mcpServers</code>, then click <strong>Reload MCP Servers</strong> in Windsurf.
                </p>
                <CopyBlock code={windsurfConfig} id="windsurf" copiedId={copiedId} onCopy={copy} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* N8N / OTHER */}
          <TabsContent value="other" className="mt-3">
            <Card>
              <CardContent className="pt-5 space-y-4">
                <p className="text-sm text-muted-foreground">Use the MCP URL directly in any MCP-compatible client (n8n MCP Client Tool node, custom agents, etc.).</p>
                <CopyBlock code={genericUrl} id="generic-url" label="MCP URL (key embedded in path)" copiedId={copiedId} onCopy={copy} />
                <p className="text-xs text-muted-foreground mt-1">Or use the base URL with an Authorization header:</p>
                <CopyBlock code={MCP_URL} id="generic-base" label="Base MCP URL" copiedId={copiedId} onCopy={copy} />
                <CopyBlock code={genericHeader} id="generic-header" label="Authorization header" copiedId={copiedId} onCopy={copy} />
                <div className="flex items-center gap-2 pt-1">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href="https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp/" target="_blank" rel="noopener" className="text-xs text-primary hover:underline">n8n MCP Client Tool docs →</a>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Step 3 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">3</div>
          <h2 className="font-semibold text-base">Test it</h2>
        </div>
        <div className="space-y-2">
          {TEST_PROMPTS.map((prompt, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md border bg-muted/30 px-4 py-3">
              <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1 font-mono">{prompt}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copy(prompt, `p${i}`)}>
                {copiedId === `p${i}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
