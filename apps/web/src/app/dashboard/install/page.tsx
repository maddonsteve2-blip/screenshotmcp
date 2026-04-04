"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Check, Copy, Download, Terminal, AlertCircle } from "lucide-react";

const MCP_URL = `${process.env.NEXT_PUBLIC_API_URL || "https://screenshotsmcp-api-production.up.railway.app"}/mcp`;

const TEST_PROMPTS = [
  "Take a screenshot of https://example.com and describe what you see",
  "Screenshot https://github.com at mobile viewport (390px wide)",
  "Take a full-page screenshot of https://vercel.com",
  "Screenshot https://news.ycombinator.com and list the top 5 stories",
];

function CopyBlock({ code, id, label, copiedId, onCopy }: {
  code: string;
  id: string;
  label?: string;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  return (
    <div>
      {label && <p className="text-sm font-medium mb-2">{label}</p>}
      <div className="relative">
        <pre className="rounded-md bg-muted p-4 text-xs overflow-x-auto pr-12 leading-relaxed">
          <code>{code}</code>
        </pre>
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 h-7 w-7"
          onClick={() => onCopy(code, id)}
        >
          {copiedId === id
            ? <Check className="h-3.5 w-3.5 text-green-500" />
            : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
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
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "MCP Install" }),
    });
    const data = await res.json();
    if (data.key) {
      setApiKey(data.key);
      setNewKeyCreated(true);
    }
    setCreating(false);
  }

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const key = apiKey || "YOUR_API_KEY";
  const isKeySet = !!apiKey;

  const cursorConfig = JSON.stringify({ type: "http", url: MCP_URL, headers: { "x-api-key": key } });
  const cursorDeepLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=screenshotsmcp&config=${encodeURIComponent(btoa(cursorConfig))}`;

  const cursorManual = `{
  "mcpServers": {
    "screenshotsmcp": {
      "url": "${MCP_URL}",
      "headers": { "x-api-key": "${key}" }
    }
  }
}`;

  const windsurfConfig = `{
  "mcpServers": {
    "screenshotsmcp": {
      "serverUrl": "${MCP_URL}",
      "headers": { "x-api-key": "${key}" }
    }
  }
}`;

  const claudeConfig = `{
  "mcpServers": {
    "screenshotsmcp": {
      "url": "${MCP_URL}",
      "headers": { "x-api-key": "${key}" }
    }
  }
}`;

  const vscodeConfig = `{
  "mcp": {
    "servers": {
      "screenshotsmcp": {
        "type": "http",
        "url": "${MCP_URL}",
        "headers": { "x-api-key": "${key}" }
      }
    }
  }
}`;

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
              <Input
                placeholder="sk_live_... (paste your key or create one)"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setNewKeyCreated(false); }}
                className="font-mono text-sm"
              />
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
          <h2 className="font-semibold text-base">Add to your AI coding tool</h2>
        </div>
        <Tabs defaultValue="cursor">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="cursor">Cursor</TabsTrigger>
            <TabsTrigger value="windsurf">Windsurf</TabsTrigger>
            <TabsTrigger value="claude">Claude</TabsTrigger>
            <TabsTrigger value="vscode">VS Code</TabsTrigger>
          </TabsList>

          <TabsContent value="cursor" className="mt-3">
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-3">
                    One-click install — Cursor will add the config automatically.
                  </p>
                  <a href={isKeySet ? cursorDeepLink : undefined}>
                    <Button disabled={!isKeySet} className="gap-2">
                      <Download className="h-4 w-4" />
                      Install in Cursor
                    </Button>
                  </a>
                  {!isKeySet && (
                    <p className="text-xs text-muted-foreground mt-2">Enter or create an API key above first.</p>
                  )}
                </div>
                <Separator />
                <CopyBlock code={cursorManual} id="cursor-manual" label="Or add manually to ~/.cursor/mcp.json" copiedId={copiedId} onCopy={copy} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="windsurf" className="mt-3">
            <Card>
              <CardContent className="pt-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Add to <code className="bg-muted px-1.5 py-0.5 rounded text-xs">~/.codeium/windsurf/mcp_config.json</code> under <code className="bg-muted px-1.5 py-0.5 rounded text-xs">mcpServers</code>, then reload MCP servers.
                </p>
                <CopyBlock code={windsurfConfig} id="windsurf" copiedId={copiedId} onCopy={copy} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="claude" className="mt-3">
            <Card>
              <CardContent className="pt-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Add to <code className="bg-muted px-1.5 py-0.5 rounded text-xs">claude_desktop_config.json</code>:<br />
                  <span className="text-xs">macOS: <code className="bg-muted px-1 rounded">~/Library/Application Support/Claude/</code></span><br />
                  <span className="text-xs">Windows: <code className="bg-muted px-1 rounded">%APPDATA%\Claude\</code></span>
                </p>
                <CopyBlock code={claudeConfig} id="claude" copiedId={copiedId} onCopy={copy} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vscode" className="mt-3">
            <Card>
              <CardContent className="pt-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Add to your <code className="bg-muted px-1.5 py-0.5 rounded text-xs">settings.json</code>. Requires VS Code 1.101+ or the MCP extension.
                </p>
                <CopyBlock code={vscodeConfig} id="vscode" copiedId={copiedId} onCopy={copy} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Step 3 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">3</div>
          <h2 className="font-semibold text-base">Test it — try these prompts in your AI assistant</h2>
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
