"use client";

import { useState, useCallback } from "react";
import { CORE_SITEWIDE_PERFORMANCE_WORKFLOW_PATH, CORE_SKILL_INSTALL_PATH, DEFAULT_ONBOARDING_CLIENT, ONBOARDING_CLIENTS, TWO_STEP_ONBOARDING_NUANCE, getNpxInstallCommand, getNpxSetupCommand, getTwoStepOnboardingCommand } from "@screenshotsmcp/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Check, Copy, ArrowLeft, ArrowRight, Key, Terminal, AlertCircle, Download, ExternalLink, Monitor, Smartphone, Globe, Code2, MessageSquare, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { PageContainer } from "@/components/page-container";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://screenshotsmcp-api-production.up.railway.app";
const MCP_URL = `${API_BASE}/mcp`;
const CLI_ONBOARDING_CLIENT = DEFAULT_ONBOARDING_CLIENT;
const CLI_SETUP_COMMAND = getNpxSetupCommand(CLI_ONBOARDING_CLIENT);
const CLI_TWO_STEP_COMMAND = getTwoStepOnboardingCommand(CLI_ONBOARDING_CLIENT);
const CLI_INSTALL_COMMAND = getNpxInstallCommand(CLI_ONBOARDING_CLIENT);

/* ───── helpers ───── */
function CopyBlock({ code, id, label, copiedId, onCopy }: {
  code: string; id: string; label?: string;
  copiedId: string | null; onCopy: (text: string, id: string) => void;
}) {
  return (
    <div>
      {label && <p className="mb-2 text-base font-medium text-foreground/80">{label}</p>}
      <div className="relative">
        <pre className="overflow-x-auto rounded-lg border bg-muted/60 p-4 pr-12 text-[0.95rem] leading-7 sm:text-base"><code>{code}</code></pre>
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 h-8 w-8 hover:bg-background"
          onClick={() => onCopy(code, id)}
          aria-label={copiedId === id ? "Copied" : "Copy to clipboard"}
        >
          {copiedId === id ? <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">{n}</span>
  );
}

/* ───── tool definitions ───── */
interface Tool {
  id: string;
  name: string;
  subtitle: string;
  icon: React.ReactNode;
  badge?: string;
}

interface Category {
  label: string;
  tools: Tool[];
}

const CATEGORIES: Category[] = [
  {
    label: "IDEs",
    tools: [
      { id: "cursor", name: "Cursor", subtitle: "One-click install", icon: <Code2 className="h-5 w-5" /> },
      { id: "vscode", name: "VS Code", subtitle: "Deep link install", icon: <Monitor className="h-5 w-5" /> },
      { id: "windsurf", name: "Windsurf", subtitle: "MCP config", icon: <Sparkles className="h-5 w-5" /> },
    ],
  },
  {
    label: "Claude",
    tools: [
      { id: "claude", name: "Claude Desktop", subtitle: "Custom Connector", icon: <MessageSquare className="h-5 w-5" /> },
      { id: "claude-code", name: "Claude Code", subtitle: "CLI", icon: <Terminal className="h-5 w-5" /> },
    ],
  },
  {
    label: "CLI",
    tools: [
      { id: "cli", name: "CLI", subtitle: "npm install", icon: <Terminal className="h-5 w-5" />, badge: "NEW" },
      { id: "chrome-extension", name: "Chrome Extension", subtitle: "Browser preview", icon: <Globe className="h-5 w-5" /> },
    ],
  },
  {
    label: "MCP",
    tools: [
      { id: "mcp-url", name: "MCP URL", subtitle: "For Custom Clients", icon: <Globe className="h-5 w-5" /> },
      { id: "n8n", name: "n8n & Others", subtitle: "Auth Header", icon: <Smartphone className="h-5 w-5" /> },
    ],
  },
];

const TEST_PROMPTS = [
  "Open https://example.com, inspect the page, and tell me what you see",
  "Use screenshot_responsive to capture https://github.com at all device sizes and summarize the differences",
  "Start with auth_test_assist for https://example.com, follow its recommended auth path, reuse the saved inbox credentials, test the auth flow end-to-end, and summarize reusable auth heuristics first with site-specific evidence second",
  "Start a remote browser session for https://example.com, declare the workflow, page set, and required evidence up front, inspect console and network failures with the session tools, and summarize the verdict with supporting proof",
  "Open my local app, inspect the page, and export evidence for anything suspicious",
  "Use webhook_create to register https://example.com/hooks for screenshot.completed and quota.warning, then fire webhook_test to confirm signed delivery (manage at /dashboard/webhooks)",
];

/* ───── main page ───── */
export default function InstallPage() {
  const [apiKey, setApiKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKeyCreated, setNewKeyCreated] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  async function createAndUseKey() {
    setCreating(true);
    const res = await apiFetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "MCP Install" }) });
    const data = await res.json();
    if (data.key) { setApiKey(data.key); setNewKeyCreated(true); }
    setCreating(false);
  }

  const copy = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const key = apiKey || "YOUR_API_KEY";
  const isKeySet = !!apiKey;
  const mcpKeyUrl = `${MCP_URL}/${key}`;

  return (
    <PageContainer width="text">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Install browser truth</h1>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">Connect DeepSyte so your AI can inspect, test, and verify with real browser evidence.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 text-base font-medium" onClick={() => document.getElementById("api-key-section")?.scrollIntoView({ behavior: "smooth" })}>
          <Key className="h-3.5 w-3.5" />
          Get API Key
        </Button>
      </div>

      {/* Sliding container */}
      <div className="relative overflow-hidden">
        {/* ── Grid view ── */}
        <div className={`transition-all duration-300 ease-in-out ${selectedTool ? "-translate-x-full opacity-0 absolute inset-0" : "translate-x-0 opacity-100"}`}>
          <Card className="border shadow-sm">
            <CardContent className="p-6 space-y-6">
              {CATEGORIES.map((cat) => (
                <div key={cat.label}>
                  <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{cat.label}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {cat.tools.map((tool) => (
                      <button
                        key={tool.id}
                        onClick={() => setSelectedTool(tool.id)}
                        className="group flex items-center gap-3 rounded-lg border bg-background p-4 text-left hover:border-primary/40 hover:bg-accent/50 transition-all duration-150"
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                          {tool.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-medium">{tool.name}</span>
                            {tool.badge && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[0.72rem] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">{tool.badge}</span>}
                          </div>
                          <p className="text-sm text-muted-foreground">{tool.subtitle}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* API Key section */}
          <div id="api-key-section" className="mt-8 space-y-4">
            <div className="flex items-center gap-3">
              <StepNumber n={1} />
              <h2 className="text-lg font-semibold">Get your API key</h2>
            </div>
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex gap-2">
                  <Input placeholder="sk_live_... (paste your key or create one)" value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setNewKeyCreated(false); }} className="font-mono text-base" />
                  <Button variant="outline" onClick={createAndUseKey} disabled={creating} className="shrink-0">
                    {creating ? "Creating..." : "Create new"}
                  </Button>
                </div>
                {newKeyCreated && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-base text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Key created! Save it now — it won&apos;t be shown again after you leave.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Test prompts */}
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3">
              <StepNumber n={2} />
              <h2 className="text-lg font-semibold">Try these prompts</h2>
            </div>
            <div className="space-y-2">
              {TEST_PROMPTS.map((prompt, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 hover:bg-muted/50 transition-colors">
                  <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 font-mono text-[0.95rem] leading-7 text-foreground/80 sm:text-base">{prompt}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => copy(prompt, `p${i}`)}
                    aria-label={copiedId === `p${i}` ? "Copied" : "Copy prompt"}
                  >
                    {copiedId === `p${i}` ? <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Instructions panel (slides in from right) ── */}
        <div className={`transition-all duration-300 ease-in-out ${selectedTool ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 absolute inset-0"}`}>
          {selectedTool && (
            <ToolInstructions
              toolId={selectedTool}
              mcpKeyUrl={mcpKeyUrl}
              mcpBaseUrl={MCP_URL}
              apiKey={key}
              isKeySet={isKeySet}
              copiedId={copiedId}
              onCopy={copy}
              onBack={() => setSelectedTool(null)}
            />
          )}
        </div>
      </div>
    </PageContainer>
  );
}

/* ───── instructions per tool ───── */
function ToolInstructions({ toolId, mcpKeyUrl, mcpBaseUrl, apiKey, isKeySet, copiedId, onCopy, onBack }: {
  toolId: string; mcpKeyUrl: string; mcpBaseUrl: string; apiKey: string; isKeySet: boolean;
  copiedId: string | null; onCopy: (text: string, id: string) => void; onBack: () => void;
}) {
  const titles: Record<string, { name: string; icon: React.ReactNode }> = {
    cursor: { name: "Cursor", icon: <Code2 className="h-5 w-5" /> },
    vscode: { name: "VS Code", icon: <Monitor className="h-5 w-5" /> },
    windsurf: { name: "Windsurf", icon: <Sparkles className="h-5 w-5" /> },
    claude: { name: "Claude Desktop", icon: <MessageSquare className="h-5 w-5" /> },
    "claude-code": { name: "Claude Code", icon: <Terminal className="h-5 w-5" /> },
    cli: { name: "CLI", icon: <Terminal className="h-5 w-5" /> },
    "chrome-extension": { name: "Chrome Extension", icon: <Globe className="h-5 w-5" /> },
    "mcp-url": { name: "MCP URL", icon: <Globe className="h-5 w-5" /> },
    n8n: { name: "n8n & Others", icon: <Smartphone className="h-5 w-5" /> },
  };

  const t = titles[toolId] || { name: toolId, icon: <Globe className="h-5 w-5" /> };

  const cursorDeepLinkConfig = JSON.stringify({ url: mcpKeyUrl });
  const cursorDeepLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=deepsyte&config=${encodeURIComponent(btoa(cursorDeepLinkConfig))}`;

  const vscodeDeepLinkConfig = JSON.stringify({ name: "deepsyte", type: "http", url: mcpKeyUrl });
  const vscodeDeepLink = `vscode:mcp/install?${encodeURIComponent(vscodeDeepLinkConfig)}`;

  return (
    <Card className="border shadow-sm">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t.icon}</span>
            <h2 className="text-xl font-semibold">Install in {t.name}</h2>
          </div>
        </div>

        {/* Steps */}
        <div className="p-6 space-y-6">
          {toolId === "cursor" && (
            <>
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-base leading-relaxed text-green-800 dark:bg-green-950/20 dark:text-green-200">
                <strong>✨ OAuth — No API key needed!</strong> Cursor supports OAuth. Just use the base URL and you&apos;ll be prompted to sign in automatically.
              </div>
              <Step n={1} title="Option A: OAuth (recommended)">
                <CopyBlock code={`{
  "mcpServers": {
    "deepsyte": {
      "url": "${mcpBaseUrl}"
    }
  }
}`} id="cursor-oauth" copiedId={copiedId} onCopy={onCopy} />
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Add to <code className="bg-muted px-1 rounded">~/.cursor/mcp.json</code>. Cursor will open a browser to authorize on first use.</p>
              </Step>
              <Separator />
              <Step n={2} title="Option B: API key in URL (no browser popup)">
                <CopyBlock code={mcpKeyUrl} id="cursor-url" copiedId={copiedId} onCopy={onCopy} />
                <a href={isKeySet ? cursorDeepLink : undefined}>
                  <Button disabled={!isKeySet} className="gap-2 w-full mt-3">
                    <Download className="h-4 w-4" /> One-click Install in Cursor
                  </Button>
                </a>
                {!isKeySet && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Enter an API key first (go back and scroll down).</p>}
              </Step>
            </>
          )}

          {toolId === "vscode" && (
            <>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-base leading-relaxed text-blue-800 dark:bg-blue-950/20 dark:text-blue-200">
                <strong>Extension preview:</strong> A native DeepSyte VS Code extension is now being developed in the monorepo with a dedicated Activity Bar sidebar, automatic browser OAuth sign-in, automatic editor MCP setup, automatic managed core skill sync, API key fallback, native MCP registration, screenshot commands, output logs, and a live timeline panel.
              </div>
              <div className="rounded-lg border bg-muted/40 p-4 text-base leading-relaxed text-muted-foreground">
                Preview commands include <code className="bg-muted px-1 rounded">DeepSyte: Sign In</code>, <code className="bg-muted px-1 rounded">DeepSyte: Check Status</code>, <code className="bg-muted px-1 rounded">DeepSyte: Take Screenshot</code>, <code className="bg-muted px-1 rounded">DeepSyte: Open Timeline</code>, <code className="bg-muted px-1 rounded">DeepSyte: Configure Editor Integration</code>, and <code className="bg-muted px-1 rounded">DeepSyte: Sync Core Skill</code>. The sidebar also exposes quick actions and recent activity directly in VS Code, and the extension configures the editor and repairs the managed core skill automatically after sign-in when needed.
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-base leading-relaxed text-green-800 dark:bg-green-950/20 dark:text-green-200">
                <strong>✨ OAuth — No API key needed!</strong> VS Code supports OAuth. Just use the base URL and you&apos;ll be prompted to sign in.
              </div>
              <Step n={1} title="Option A: OAuth (recommended)">
                <CopyBlock code={`{
  "mcp": {
    "servers": {
      "deepsyte": {
        "type": "http",
        "url": "${mcpBaseUrl}"
      }
    }
  }
}`} id="vscode-oauth" copiedId={copiedId} onCopy={onCopy} />
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Add to <code className="bg-muted px-1 rounded">.vscode/mcp.json</code>. Enable <code className="bg-muted px-1 rounded">chat.mcp.enabled</code> in settings.</p>
              </Step>
              <Separator />
              <Step n={2} title="Option B: API key in URL">
                <CopyBlock code={mcpKeyUrl} id="vscode-url" copiedId={copiedId} onCopy={onCopy} />
                <a href={isKeySet ? vscodeDeepLink : undefined}>
                  <Button disabled={!isKeySet} className="gap-2 w-full mt-3">
                    <Download className="h-4 w-4" /> One-click Install in VS Code
                  </Button>
                </a>
              </Step>
            </>
          )}

          {toolId === "windsurf" && (
            <>
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 p-4 text-sm text-green-800 dark:text-green-200">
                <strong>✨ OAuth — No API key needed!</strong> Windsurf supports OAuth. Just use the base URL and you&apos;ll be prompted to sign in.
              </div>
              <Step n={1} title="Option A: OAuth (recommended)">
                <CopyBlock code={`{
  "mcpServers": {
    "deepsyte": {
      "serverUrl": "${mcpBaseUrl}"
    }
  }
}`} id="windsurf-oauth" copiedId={copiedId} onCopy={onCopy} />
                <p className="text-xs text-muted-foreground mt-2">Add to <code className="bg-muted px-1 rounded">~/.codeium/windsurf/mcp_config.json</code>. Windsurf will open a browser to authorize on first use.</p>
              </Step>
              <Separator />
              <Step n={2} title="Option B: API key in URL">
                <CopyBlock code={`{
  "mcpServers": {
    "deepsyte": {
      "serverUrl": "${mcpKeyUrl}"
    }
  }
}`} id="windsurf-config" copiedId={copiedId} onCopy={onCopy} />
              </Step>
              <Step n={3} title="Reload MCP Servers">
                <p className="text-sm text-muted-foreground">Click <strong>Reload MCP Servers</strong> in the Windsurf command palette or restart the IDE.</p>
              </Step>
            </>
          )}

          {toolId === "claude" && (
            <>
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 p-4 text-sm text-green-800 dark:text-green-200">
                <strong>Pro/Max Plan?</strong> Go to Settings → Integrations → Add Custom Integration → paste the base URL below. OAuth will handle auth automatically.
              </div>
              <Step n={1} title="Option A: OAuth via mcp-remote (recommended)">
                <p className="text-xs text-muted-foreground mb-3">
                  No API key needed! mcp-remote handles OAuth automatically.<br />
                  macOS: <code className="bg-muted px-1 rounded">~/Library/Application Support/Claude/</code> · Windows: <code className="bg-muted px-1 rounded">%APPDATA%\Claude\</code>
                </p>
                <CopyBlock code={`{
  "mcpServers": {
    "deepsyte": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "mcp-remote@latest", "${mcpBaseUrl}"]
    }
  }
}`} id="claude-oauth-win" label="Windows" copiedId={copiedId} onCopy={onCopy} />
                <div className="mt-3">
                  <CopyBlock code={`{
  "mcpServers": {
    "deepsyte": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "${mcpBaseUrl}"]
    }
  }
}`} id="claude-oauth-mac" label="macOS / Linux" copiedId={copiedId} onCopy={onCopy} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">A browser window will open on first launch to sign in. The token is cached automatically.</p>
              </Step>
              <Separator />
              <Step n={2} title="Option B: API key in URL (no browser popup)">
                <CopyBlock code={`{
  "mcpServers": {
    "deepsyte": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "${mcpKeyUrl}"]
    }
  }
}`} id="claude-key" copiedId={copiedId} onCopy={onCopy} />
              </Step>
              <Step n={3} title="Restart Claude Desktop">
                <p className="text-sm text-muted-foreground">Fully quit and relaunch Claude Desktop to load the new MCP server.</p>
              </Step>
            </>
          )}

          {toolId === "claude-code" && (
            <>
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 p-4 text-sm text-green-800 dark:text-green-200">
                <strong>✨ OAuth — No API key needed!</strong> Claude Code supports OAuth. A browser will open to sign in on first use.
              </div>
              <Step n={1} title="Option A: OAuth (recommended)">
                <CopyBlock code={`claude mcp add --transport http deepsyte -s user ${mcpBaseUrl}`} id="claude-code-oauth" copiedId={copiedId} onCopy={onCopy} />
                <p className="text-xs text-muted-foreground mt-2">Claude Code will open a browser to authorize on first use. No API key needed.</p>
              </Step>
              <Separator />
              <Step n={2} title="Option B: API key in URL">
                <CopyBlock code={`claude mcp add --transport http deepsyte -s user ${mcpKeyUrl}`} id="claude-code-cmd" copiedId={copiedId} onCopy={onCopy} />
              </Step>
              <Step n={3} title="Verify the connection">
                <p className="text-sm text-muted-foreground">Type <code className="bg-muted px-1.5 py-0.5 rounded font-mono">/mcp</code> in Claude Code to see connected servers.</p>
              </Step>
            </>
          )}

          {toolId === "cli" && (
            <>
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-4 text-sm text-blue-800 dark:text-blue-200">
                <strong>Terminal + browser workflow tool</strong> — Use DeepSyte directly from the command line, mirror the same remote MCP browser/auth flows for public sites, and escalate to a managed local browser when public cloud execution is not enough.
              </div>
              <Step n={1} title="Recommended: one-command onboarding for a new agent">
                <CopyBlock code={CLI_SETUP_COMMAND} id="cli-setup" copiedId={copiedId} onCopy={onCopy} />
                <p className="text-xs text-muted-foreground mt-2">Use {ONBOARDING_CLIENTS.map((client, index) => (<span key={client}>{index > 0 && (index === ONBOARDING_CLIENTS.length - 1 ? " or " : ", ")}<code className="bg-muted px-1 rounded">{client}</code></span>))}. This authenticates if needed, configures the MCP client, and installs or repairs the managed core skill plus packaged workflows in <code className="bg-muted px-1 rounded">{CORE_SKILL_INSTALL_PATH}</code>, including <code className="bg-muted px-1 rounded">{CORE_SITEWIDE_PERFORMANCE_WORKFLOW_PATH}</code>.</p>
              </Step>
              <Step n={2} title="Or do it in two steps">
                <CopyBlock code={CLI_TWO_STEP_COMMAND} id="cli-login-install" copiedId={copiedId} onCopy={onCopy} />
                <p className="text-xs text-muted-foreground mt-2">Use this when you already know the client you want to configure or only need to repair one client. {TWO_STEP_ONBOARDING_NUANCE}</p>
              </Step>
              <Step n={3} title="Client-specific install nuances">
                <CopyBlock code={CLI_INSTALL_COMMAND} id="cli-install" copiedId={copiedId} onCopy={onCopy} />
                <p className="text-xs text-muted-foreground mt-2">Supported: {ONBOARDING_CLIENTS.map((client, index) => (<span key={client}>{index > 0 && (index === ONBOARDING_CLIENTS.length - 1 ? " or " : ", ")}<code className="bg-muted px-1 rounded">{client}</code></span>))}. <code className="bg-muted px-1 rounded">install vscode</code> writes a workspace-local <code className="bg-muted px-1 rounded">.vscode/mcp.json</code>, while <code className="bg-muted px-1 rounded">install claude-code</code> prints the <code className="bg-muted px-1 rounded">claude mcp add ...</code> command for you to run manually.</p>
              </Step>
              <Separator />
              <Step n={4} title="Repair or use it standalone from the terminal">
                <CopyBlock code={`deepsyte screenshot https://example.com
deepsyte fullpage https://example.com
deepsyte responsive https://example.com
deepsyte auth:test https://example.com
deepsyte auth:find-login https://example.com
deepsyte auth:authorize-email
deepsyte browse https://example.com
deepsyte browse https://example.com --task-type site_audit --user-goal "Audit public pages for UX regressions" --workflow-name sitewide-performance-audit --auth-scope out --page-set homepage,pricing,docs --required-evidence screenshots,console,network
deepsyte browse:console <sessionId> --level error
deepsyte browse:network-errors <sessionId>
deepsyte browse:a11y <sessionId>
deepsyte browse:perf <sessionId>
deepsyte browse:seo <sessionId>
deepsyte browse:captcha <sessionId>
deepsyte browse:close <sessionId>
deepsyte mobile https://example.com
deepsyte dark https://example.com
deepsyte review https://example.com
deepsyte browser open https://example.com
deepsyte browser open https://example.com --record-video
deepsyte browser status
deepsyte browser goto https://example.org
deepsyte browser back
deepsyte browser forward
deepsyte browser click-at 320 480
deepsyte browser hover ".menu-trigger"
deepsyte browser wait-for ".results-loaded" --timeout 8000
deepsyte browser select "select[name=country]" "Australia"
deepsyte browser viewport 393 852
deepsyte browser screenshot
deepsyte browser text
deepsyte browser console --level error
deepsyte browser network-errors
deepsyte browser network-requests --resource-type fetch --min-duration 200
deepsyte browser evidence --label checkout-bug
deepsyte browser close --evidence --label checkout-bug
deepsyte browser cookies get
deepsyte browser storage getAll --type localStorage
deepsyte browser eval "document.title"
deepsyte browser a11y --max-depth 6
deepsyte browser perf
deepsyte browser seo
deepsyte browser close
deepsyte perf https://example.com
deepsyte skills sync
deepsyte --help`} id="cli-commands" copiedId={copiedId} onCopy={onCopy} />
                <p className="text-xs text-muted-foreground mt-2">Install globally with <code className="bg-muted px-1 rounded">npm install -g deepsyte</code> for ongoing use. For public sites, the CLI now mirrors the remote MCP workflow directly: start auth with <code className="bg-muted px-1 rounded">deepsyte auth:test &lt;url&gt;</code>, use <code className="bg-muted px-1 rounded">deepsyte browse &lt;url&gt;</code> to get a remote session, and add workflow-aware flags such as <code className="bg-muted px-1 rounded">--task-type</code>, <code className="bg-muted px-1 rounded">--user-goal</code>, <code className="bg-muted px-1 rounded">--workflow-name</code>, <code className="bg-muted px-1 rounded">--page-set</code>, and <code className="bg-muted px-1 rounded">--required-evidence</code> when you want the run UI to show an explicit verdict, proof coverage, and next actions. Continue with <code className="bg-muted px-1 rounded">browse:console</code>, <code className="bg-muted px-1 rounded">browse:network-errors</code>, <code className="bg-muted px-1 rounded">browse:a11y</code>, <code className="bg-muted px-1 rounded">browse:perf</code>, <code className="bg-muted px-1 rounded">browse:seo</code>, <code className="bg-muted px-1 rounded">browse:cookies</code>, <code className="bg-muted px-1 rounded">browse:storage</code>, or <code className="bg-muted px-1 rounded">browse:captcha</code> without reopening the page. Use <code className="bg-muted px-1 rounded">deepsyte browser open ...</code> only when you need the separate extension-free managed local browser for localhost, VPN-only, or approval-gated workflows. While that local browser stays open, DeepSyte continuously captures console logs and network activity, and you can control it with commands such as <code className="bg-muted px-1 rounded">browser status</code>, <code className="bg-muted px-1 rounded">browser goto</code>, <code className="bg-muted px-1 rounded">browser back</code>, <code className="bg-muted px-1 rounded">browser forward</code>, <code className="bg-muted px-1 rounded">browser click-at</code>, <code className="bg-muted px-1 rounded">browser hover</code>, <code className="bg-muted px-1 rounded">browser wait-for</code>, <code className="bg-muted px-1 rounded">browser select</code>, <code className="bg-muted px-1 rounded">browser viewport</code>, <code className="bg-muted px-1 rounded">browser console</code>
, <code className="bg-muted px-1 rounded">browser network-errors</code>, <code className="bg-muted px-1 rounded">browser network-requests</code>, <code className="bg-muted px-1 rounded">browser evidence</code>, <code className="bg-muted px-1 rounded">browser cookies</code>, <code className="bg-muted px-1 rounded">browser storage</code>, <code className="bg-muted px-1 rounded">browser eval</code>, <code className="bg-muted px-1 rounded">browser a11y</code>, <code className="bg-muted px-1 rounded">browser perf</code>, <code className="bg-muted px-1 rounded">browser seo</code>, and <code className="bg-muted px-1 rounded">browser close</code> to gather reviewable proof locally.</p>
              </Step>
            </>
          )}

          {toolId === "chrome-extension" && (
            <>
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-4 text-sm text-blue-800 dark:text-blue-200">
                <strong>Chrome preview</strong> — The monorepo includes an unpacked Chrome extension under <code className="bg-muted px-1 rounded">packages/chrome-extension</code>.
              </div>
              <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                Public pages use the same DeepSyte Playwright-backed MCP path as the CLI when an API key is configured. Localhost and private pages stay local-first so you can still capture and inspect dev servers.
              </div>
              <Step n={1} title="Load the extension in Chrome">
                <CopyBlock code={`chrome://extensions`} id="chrome-extension-url" copiedId={copiedId} onCopy={onCopy} />
                <p className="text-xs text-muted-foreground mt-2">Enable Developer mode, click <strong>Load unpacked</strong>, then select <code className="bg-muted px-1 rounded">packages/chrome-extension</code>.</p>
              </Step>
              <Separator />
              <Step n={2} title="Paste your existing API key into extension settings">
                <CopyBlock code={apiKey} id="chrome-extension-key" copiedId={copiedId} onCopy={onCopy} />
                <p className="text-xs text-muted-foreground mt-2">The extension validates the key before storing it, so revoked keys are rejected.</p>
              </Step>
              <Separator />
              <Step n={3} title="Use screenshots and page tools">
                <p className="text-sm text-muted-foreground">Use <strong>Screenshot</strong> and <strong>Full Page Screenshot</strong> for capture, then use <strong>Read Text</strong> and <strong>Read DOM</strong> in the popup to inspect the current page.</p>
              </Step>
            </>
          )}

          {toolId === "mcp-url" && (
            <>
              <Step n={1} title="Copy the MCP URL">
                <CopyBlock code={mcpKeyUrl} id="mcp-url-copy" copiedId={copiedId} onCopy={onCopy} />
                <p className="text-xs text-muted-foreground mt-2">The API key is embedded in the URL path. No extra headers needed.</p>
              </Step>
              <Step n={2} title="Use it with your favourite agentic SDK or MCP client">
                <p className="text-sm text-muted-foreground">Paste this URL into any tool that supports MCP servers via HTTP. The server uses Streamable HTTP transport.</p>
              </Step>
            </>
          )}

          {toolId === "n8n" && (
            <>
              <Step n={1} title="Copy the MCP URL">
                <CopyBlock code={mcpKeyUrl} id="n8n-url" label="MCP URL (key embedded in path)" copiedId={copiedId} onCopy={onCopy} />
              </Step>
              <Step n={2} title="Or use base URL with Authorization header">
                <CopyBlock code={mcpBaseUrl} id="n8n-base" label="Base MCP URL" copiedId={copiedId} onCopy={onCopy} />
                <div className="mt-3">
                  <CopyBlock code={`Authorization: Bearer ${apiKey}`} id="n8n-header" label="Authorization header" copiedId={copiedId} onCopy={onCopy} />
                </div>
              </Step>
              <Step n={3} title="Configure your client">
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href="https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp/" target="_blank" rel="noopener" className="text-sm text-primary hover:underline">n8n MCP Client Tool docs →</a>
                </div>
              </Step>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <StepNumber n={n} />
        <h3 className="text-[1.02rem] font-medium sm:text-lg">{title}</h3>
      </div>
      <div className="ml-10">{children}</div>
    </div>
  );
}
