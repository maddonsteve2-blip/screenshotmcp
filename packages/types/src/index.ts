export type Plan = "free" | "starter" | "pro";

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

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { screenshotsPerMonth: 999999, price: 0 },
  starter: { screenshotsPerMonth: 2000, price: 9 },
  pro: { screenshotsPerMonth: 10000, price: 29 },
};
