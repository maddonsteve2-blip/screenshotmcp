"use client";
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Zap } from "lucide-react";
import { PLAN_LIMITS } from "@deepsyte/types";
import { PageContainer } from "@/components/page-container";

const plans = [
  { key: "free" as const, label: "Free", features: ["100 screenshots/mo", "REST API", "MCP server", "Community support"] },
  { key: "starter" as const, label: "Starter", features: ["2,000 screenshots/mo", "REST API", "MCP server", "Email support"] },
  { key: "pro" as const, label: "Pro", features: ["10,000 screenshots/mo", "REST API", "MCP server", "Priority support", "Custom domains"] },
];

export default function BillingPage() {
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data.error ?? "Billing portal unavailable");
    } catch (err) {
      toast.error("Could not open billing portal", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer width="data" className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-muted-foreground">Manage your subscription and payment details</p>
        </div>
        <Button onClick={openPortal} disabled={loading} variant="outline">
          <ExternalLink className="h-4 w-4 mr-2" />
          {loading ? "Opening..." : "Manage billing"}
        </Button>
        <span className="text-xs text-muted-foreground">Billing coming soon</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card key={plan.key} className="relative">
            {plan.key === "starter" && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground">Popular</Badge>
              </div>
            )}
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  {plan.label}
                </CardTitle>
                <span className="text-2xl font-bold">${PLAN_LIMITS[plan.key].price}</span>
              </div>
              <CardDescription>/month</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-primary">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {plan.key !== "free" && (
                <Button className="w-full mt-4" disabled variant="outline">
                  Coming soon
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
