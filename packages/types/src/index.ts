export type Plan = "free" | "starter" | "pro";

export const ONBOARDING_CLIENTS = ["cursor", "vscode", "windsurf", "claude", "claude-code"] as const;

export type OnboardingClient = (typeof ONBOARDING_CLIENTS)[number];

export const DEFAULT_ONBOARDING_CLIENT: OnboardingClient = "cursor";

export const CORE_SKILL_INSTALL_PATH = "~/.agents/skills/screenshotsmcp";

export const CORE_SITEWIDE_PERFORMANCE_WORKFLOW_PATH = "workflows/sitewide-performance-audit/WORKFLOW.md";

export const TWO_STEP_ONBOARDING_NUANCE = "For most clients, login + install reaches the same result as setup --client <client>. The main nuances are that install vscode writes a workspace-local .vscode/mcp.json, while install claude-code prints the claude mcp add ... command for you to run manually.";

export function getSetupCommand(client: OnboardingClient = DEFAULT_ONBOARDING_CLIENT): string {
  return `screenshotsmcp setup --client ${client}`;
}

export function getNpxSetupCommand(client: OnboardingClient = DEFAULT_ONBOARDING_CLIENT): string {
  return `npx ${getSetupCommand(client)}`;
}

export function getInstallCommand(client: OnboardingClient = DEFAULT_ONBOARDING_CLIENT): string {
  return `screenshotsmcp install ${client}`;
}

export function getNpxInstallCommand(client: OnboardingClient = DEFAULT_ONBOARDING_CLIENT): string {
  return `npx ${getInstallCommand(client)}`;
}

export function getTwoStepOnboardingCommand(client: OnboardingClient = DEFAULT_ONBOARDING_CLIENT): string {
  return `npx screenshotsmcp login\n${getNpxInstallCommand(client)}`;
}

export type ScreenshotStatus = "pending" | "processing" | "done" | "failed";

export type ScreenshotFormat = "png" | "jpeg" | "webp";

export interface ScreenshotOptions {
  url: string;
  width?: number;
  height?: number;
  fullPage?: boolean;
  format?: ScreenshotFormat;
  delay?: number;
  darkMode?: boolean;
  selector?: string;
  pdf?: boolean;
  maxHeight?: number;
}

export interface ScreenshotJob {
  id: string;
  userId: string;
  options: ScreenshotOptions;
}

export interface ScreenshotResult {
  id: string;
  status: ScreenshotStatus;
  url?: string;
  error?: string;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPreview: string;
  lastUsed: string | null;
  createdAt: string;
  revoked: boolean;
}

export interface UsageStat {
  date: string;
  count: number;
}

export interface PlanLimits {
  screenshotsPerMonth: number;
  price: number;
}

export type BrowserExecutionMode = "remote" | "local-managed-browser" | "local-current-tab";

export type BrowserPermissionLevel = "none" | "launch-local-browser" | "control-local-browser" | "control-current-tab";

export type BrowserCapturePolicy = "none" | "before-after" | "every-step";

export type BrowserEvidenceArtifact = "screenshot" | "video" | "console" | "network" | "accessibility" | "seo";

export type LocalBrowserName = "auto" | "chrome" | "edge" | "chromium";

export interface BrowserEvidencePolicy {
  capturePolicy: BrowserCapturePolicy;
  artifacts: BrowserEvidenceArtifact[];
}

export interface LocalBrowserPermissionPrompt {
  title: string;
  reason: string;
  permissionLevel: Extract<BrowserPermissionLevel, "launch-local-browser" | "control-local-browser" | "control-current-tab">;
  details: string[];
}

export interface LocalBrowserLaunchRequest {
  browser: LocalBrowserName;
  url?: string;
  headless?: boolean;
  recordVideo?: boolean;
  reason: string;
  permissionLevel: Extract<BrowserPermissionLevel, "launch-local-browser" | "control-local-browser">;
}

export interface LocalBrowserLaunchResult {
  browser: Exclude<LocalBrowserName, "auto">;
  executablePath: string;
  userDataDir: string;
  debugPort: number;
  pid: number | null;
  url?: string;
  recordVideo?: boolean;
  recordingDir?: string;
  launchMode?: "spawn" | "daemon";
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { screenshotsPerMonth: 100, price: 0 },
  starter: { screenshotsPerMonth: 2000, price: 9 },
  pro: { screenshotsPerMonth: 10000, price: 29 },
};

/**
 * Monthly quota for free users whose accounts were created before the
 * canonical-quota cutover. Keeps early adopters on their historical
 * effectively-unlimited allowance while new signups get the 100/mo cap.
 * Resolved at request time via `FREE_QUOTA_CUTOVER_DATE` (ISO 8601).
 */
export const LEGACY_FREE_QUOTA_PER_MONTH = 999_999;
