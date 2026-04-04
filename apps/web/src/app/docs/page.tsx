import Link from "next/link";
import { Camera } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const endpoints = [
  {
    method: "POST",
    path: "/v1/screenshot",
    description: "Enqueue a screenshot job",
    body: `{
  "url": "https://example.com",       // required
  "width": 1280,                       // optional, default 1280
  "height": 800,                       // optional, default 800
  "fullPage": false,                   // optional, default false
  "format": "png",                     // png | jpeg | webp
  "delay": 0                           // ms to wait after load
}`,
    response: `{
  "id": "abc123",
  "status": "pending"
}`,
  },
  {
    method: "GET",
    path: "/v1/screenshot/:id",
    description: "Poll screenshot status and get the signed URL",
    body: null,
    response: `{
  "id": "abc123",
  "status": "done",        // pending | processing | done | failed
  "url": "https://...",    // public URL when done
  "error": null,
  "createdAt": "2025-01-01T00:00:00.000Z"
}`,
  },
];

export default function DocsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://api.screenshotsmcp.com";

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <span className="font-semibold text-lg">ScreenshotsMCP</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/pricing">
              <Button variant="ghost">Pricing</Button>
            </Link>
            <Link href="/sign-in">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/sign-up">
              <Button>Get started</Button>
            </Link>
          </div>
        </div>
      </nav>

    <div className="mx-auto max-w-4xl px-6 py-12 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">API Reference</h1>
        <p className="text-muted-foreground mt-1">
          Authenticate with your API key via the <code className="bg-muted px-1 rounded text-sm">Authorization</code> header.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>Pass your key on every request</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-md p-4 text-sm overflow-x-auto">
            <code>{`Authorization: Bearer sk_live_...`}</code>
          </pre>
        </CardContent>
      </Card>

      <Separator />

      <div className="space-y-6">
        {endpoints.map((ep) => (
          <Card key={ep.path}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge variant={ep.method === "POST" ? "default" : "secondary"}>
                  {ep.method}
                </Badge>
                <code className="font-mono text-sm">{apiUrl}{ep.path}</code>
              </div>
              <CardDescription>{ep.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {ep.body && (
                <div>
                  <p className="text-sm font-medium mb-2">Request body</p>
                  <pre className="bg-muted rounded-md p-4 text-sm overflow-x-auto">
                    <code>{ep.body}</code>
                  </pre>
                </div>
              )}
              <div>
                <p className="text-sm font-medium mb-2">Response</p>
                <pre className="bg-muted rounded-md p-4 text-sm overflow-x-auto">
                  <code>{ep.response}</code>
                </pre>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>MCP Tool: take_screenshot</CardTitle>
          <CardDescription>
            Use with Claude Desktop, Cursor, Windsurf, or any MCP-compatible host
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Config (claude_desktop_config.json)</p>
            <pre className="bg-muted rounded-md p-4 text-sm overflow-x-auto">
              <code>{`{
  "mcpServers": {
    "screenshotsmcp": {
      "url": "${apiUrl}/mcp",
      "headers": {
        "x-api-key": "sk_live_..."
      }
    }
  }
}`}</code>
            </pre>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Tool parameters</p>
            <pre className="bg-muted rounded-md p-4 text-sm overflow-x-auto">
              <code>{`url       string   required  URL to screenshot
width     number   optional  Viewport width (default 1280)
height    number   optional  Viewport height (default 800)
fullPage  boolean  optional  Full scrollable page (default false)
format    string   optional  png | jpeg | webp (default png)
delay     number   optional  Wait ms after load (default 0)`}</code>
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rate limits & quotas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-medium">Free</p>
              <p className="text-muted-foreground">100 screenshots/mo</p>
              <p className="text-muted-foreground">$0</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Starter</p>
              <p className="text-muted-foreground">2,000 screenshots/mo</p>
              <p className="text-muted-foreground">$9/mo</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Pro</p>
              <p className="text-muted-foreground">10,000 screenshots/mo</p>
              <p className="text-muted-foreground">$29/mo</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
