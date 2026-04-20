"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mail, ExternalLink, Check, AlertCircle, Trash2, Eye, EyeOff, Inbox, Copy, Clock } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

export default function SettingsPage() {
  const [agentmailKey, setAgentmailKey] = useState("");
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [inboxes, setInboxes] = useState<Array<{ id: string; email: string; password: string; displayName?: string; lastUsedAt?: string; createdAt: string }>>([]);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/settings").then((r) => r.json()),
      apiFetch("/api/test-inboxes").then((r) => r.json()),
    ])
      .then(([settings, inboxData]) => {
        setHasKey(settings.hasAgentmailKey ?? false);
        setMaskedKey(settings.agentmailApiKey ?? null);
        setInboxes(inboxData.inboxes ?? []);
      })
      .catch(() => undefined);
  }, []);

  async function saveKey() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentmailApiKey: agentmailKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      } else {
        setMessage({ type: "success", text: "AgentMail API key saved successfully!" });
        setHasKey(data.hasAgentmailKey);
        setMaskedKey(data.agentmailApiKey);
        setAgentmailKey("");
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    }
    setSaving(false);
  }

  async function removeKey() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentmailApiKey: "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to remove" });
      } else {
        setMessage({ type: "success", text: "AgentMail API key removed." });
        setHasKey(false);
        setMaskedKey(null);
        setAgentmailKey("");
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    }
    setSaving(false);
  }

  function copyWithFeedback(value: string, id: string) {
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function buildAgentPrompt(inbox: { email: string; password: string }) {
    return [
      `Start with auth_test_assist for this site so you reuse the saved auth memory and inbox.`,
      `Read its recommended auth path, account-exists confidence, likely auth method, and expected follow-up before choosing sign-in or sign-up.`,
      `Primary reusable inbox: ${inbox.email}`,
      `Primary reusable password: ${inbox.password}`,
      `If sign-in fails because the account does not exist, try sign-up with the same email and password.`,
      `If smart_login is uncertain on a Clerk or multi-step auth form, fall back to browser tools and inspect network or console evidence before deciding it failed.`,
      `If the site sends a verification email or OTP, use check_inbox with ${inbox.email}.`,
      `When you report the result, summarize reusable auth heuristics first and present any site-specific path as supporting evidence.`,
      `After the auth attempt, call auth_test_assist again with action "record" and the outcome.`,
    ].join("\n");
  }

  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:px-6 lg:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your integrations and preferences</p>
      </div>

      {/* AgentMail Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  AgentMail
                  {hasKey && <Badge variant="secondary" className="text-xs">Connected</Badge>}
                </CardTitle>
                <CardDescription>Disposable email inboxes for automated testing</CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* What is AgentMail */}
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4">
            <p className="text-sm font-medium">What is AgentMail?</p>
            <p className="text-sm text-muted-foreground">
              AgentMail is an API platform that gives AI agents their own email inboxes to send, receive, and act upon emails.
              ScreenshotsMCP uses AgentMail to power the <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">create_test_inbox</code> and <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">check_inbox</code> tools,
              which let your AI assistant create disposable email addresses for testing sign-up flows, reading verification codes, and more.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-green-600" />
                <span><strong>Free plan:</strong> 3 inboxes, 3,000 emails/mo</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-green-600" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-green-600" />
                <span>Real email addresses (@agentmail.to)</span>
              </div>
            </div>
          </div>

          {/* How to get a key */}
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">How to get your API key</p>
            <ol className="list-inside list-decimal text-sm text-muted-foreground flex flex-col gap-2">
              <li>
                Create a free account at{" "}
                <a href="https://console.agentmail.to" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                  console.agentmail.to <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Navigate to your API keys in the console</li>
              <li>Copy your API key (starts with <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">am_</code>) and paste it below</li>
            </ol>
          </div>

          {/* Current key status */}
          {hasKey && maskedKey && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
              <Check className="h-4 w-4 shrink-0 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">API key configured</p>
                <p className="text-xs font-mono text-muted-foreground">{maskedKey}</p>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="destructive"
                onClick={removeKey}
                disabled={saving}
                className="shrink-0"
                aria-label="Remove API key"
              >
                <Trash2 />
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="agentmail-key">{hasKey ? "Replace API key" : "API key"}</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="agentmail-key"
                  type={showKey ? "text" : "password"}
                  placeholder="am_..."
                  value={agentmailKey}
                  onChange={(e) => setAgentmailKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && agentmailKey.trim() && saveKey()}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowKey((current) => !current)}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                >
                  {showKey ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              <Button onClick={saveKey} disabled={saving || !agentmailKey.trim()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          {/* Status message */}
          {message && (
            <div className={`flex items-center gap-2 text-sm ${message.type === "success" ? "text-primary" : "text-destructive"}`}>
              {message.type === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {message.text}
            </div>
          )}

          {/* Pricing info */}
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-sm font-medium">AgentMail Plans</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Free</span>
                  <span className="text-sm font-bold">$0</span>
                </div>
                <p className="text-xs text-muted-foreground">3 inboxes, 3K emails/mo</p>
              </div>
              <div className="flex flex-col gap-1 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Developer</span>
                  <span className="text-sm font-bold">$20<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
                </div>
                <p className="text-xs text-muted-foreground">10 inboxes, 10K emails/mo</p>
              </div>
              <div className="flex flex-col gap-1 rounded-md border border-primary/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Startup</span>
                  <span className="text-sm font-bold">$200<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
                </div>
                <p className="text-xs text-muted-foreground">150 inboxes, 150K emails/mo</p>
              </div>
            </div>
            <a
              href="https://agentmail.to"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Learn more at agentmail.to <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Test Inboxes */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Inbox className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Test Inboxes
                {inboxes.length > 0 && <Badge variant="secondary" className="text-xs">{inboxes.length}</Badge>}
              </CardTitle>
              <CardDescription>Disposable email accounts created by your AI assistant</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">
              Your AI assistant saves reusable inbox credentials here. The first inbox is treated as your primary auth identity,
              and agents should start website auth work with <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">auth_test_assist</code>
              so they reuse this inbox plus the remembered sign-in or sign-up history for each site.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Use <strong>Copy prompt for agent</strong> to copy a ready-to-paste prompt into chat when you want your AI to log into a website using this reusable test account.
              Agents should report reusable auth-system findings first and site-specific evidence second.
            </p>
          </div>

          {inboxes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No test inboxes yet</p>
              <p className="text-xs mt-1">Your AI assistant will create them when testing sign-up flows</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {inboxes.map((inbox, index) => {
                const isPrimary = index === 0;
                const passwordVisible = isPrimary ? true : !!showPasswords[inbox.id];
                const agentPrompt = buildAgentPrompt(inbox);

                return (
                <div key={inbox.id} className={`flex flex-col gap-3 rounded-lg border p-4 ${isPrimary ? "border-primary/40 bg-primary/5" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {isPrimary && <Badge className="text-xs">Primary reusable inbox</Badge>}
                        {inbox.displayName && <Badge variant="secondary" className="text-xs">{inbox.displayName}</Badge>}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <p className="text-sm font-mono font-medium truncate">{inbox.email}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => copyWithFeedback(inbox.email, inbox.id + "-email")}
                          className="shrink-0"
                          aria-label="Copy email"
                        >
                          {copiedId === inbox.id + "-email" ? <Check /> : <Copy />}
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Password:</span>
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded break-all">
                          {passwordVisible ? inbox.password : "••••••••••••"}
                        </code>
                        {!isPrimary && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setShowPasswords((p) => ({ ...p, [inbox.id]: !p[inbox.id] }))}
                            aria-label={passwordVisible ? "Hide password" : "Show password"}
                          >
                            {passwordVisible ? <EyeOff /> : <Eye />}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => copyWithFeedback(inbox.password, inbox.id + "-pw")}
                          aria-label="Copy password"
                        >
                          {copiedId === inbox.id + "-pw" ? <Check /> : <Copy />}
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => copyWithFeedback(agentPrompt, inbox.id + "-agent")}
                        >
                          {copiedId === inbox.id + "-agent" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                          Copy prompt for agent
                        </Button>
                      </div>
                      {isPrimary && (
                        <p className="text-xs text-muted-foreground">
                          This copies a prompt containing the email, password, sign-in-first guidance, and verification instructions so you can paste it directly into your AI chat.
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="destructive"
                      onClick={async () => {
                        await apiFetch(`/api/test-inboxes?id=${inbox.id}`, { method: "DELETE" });
                        setInboxes((prev) => prev.filter((i) => i.id !== inbox.id));
                      }}
                      className="shrink-0"
                      aria-label="Delete inbox"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Created {new Date(inbox.createdAt).toLocaleDateString()}
                    </span>
                    {inbox.lastUsedAt && (
                      <span>Last used {new Date(inbox.lastUsedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
