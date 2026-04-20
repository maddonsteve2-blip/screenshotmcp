export type ScreenshotItem = {
  id: string;
  url: string;
  status: string;
  publicUrl: string | null;
  width: number;
  height: number | null;
  format: string;
  fullPage: boolean;
  createdAt: string;
  stepIndex: number | null;
  actionLabel: string | null;
  outcome: string | null;
  toolName: string | null;
  captionSource: string | null;
  agentNote: string | null;
  pageTitle: string | null;
  heading: string | null;
};

export type RecordingItem = {
  id: string;
  sessionId: string;
  pageUrl: string | null;
  fileSize: number | null;
  durationMs: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  createdAt: string;
  videoUrl: string;
};

export type ConsoleEntry = {
  level: string;
  text: string;
  ts: number;
};

export type NetworkErrorEntry = {
  url: string;
  status: number;
  statusText: string;
  ts: number;
};

export type NetworkRequestEntry = {
  url: string;
  method: string;
  status: number;
  statusText: string;
  resourceType: string;
  duration: number;
  size: number;
  ts: number;
};

export type RunDetails = {
  id: string;
  status: string;
  executionMode: string;
  startUrl: string | null;
  finalUrl: string | null;
  pageTitle: string | null;
  recordingEnabled: boolean;
  shareToken: string | null;
  sharedAt: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string | null;
  consoleLogCount: number;
  consoleErrorCount: number;
  consoleWarningCount: number;
  networkRequestCount: number;
  networkErrorCount: number;
};

export type RunOutcome = {
  taskType: string | null;
  userGoal: string | null;
  workflowUsed: string | null;
  verdict: string;
  problem: string | null;
  summary: string | null;
  contract: Record<string, unknown>;
  findings: Array<{ id?: string; severity?: string; title?: string; detail?: string; recommendation?: string }>;
  proofCoverage: Record<string, unknown>;
  validity: Record<string, unknown>;
  nextActions: string[];
};

export type LiveSnapshotResponse = {
  runId: string;
  status: string;
  live: boolean;
  snapshotAt: string;
  startedAt: string | null;
  lastUsedAt: string | null;
  recordingEnabled: boolean;
  currentUrl: string | null;
  pageTitle: string | null;
  viewport: { width: number; height: number } | null;
  consoleLogs: ConsoleEntry[];
  networkErrors: NetworkErrorEntry[];
  networkRequests: NetworkRequestEntry[];
  consoleLogCount: number;
  consoleErrorCount: number;
  consoleWarningCount: number;
  networkRequestCount: number;
  networkErrorCount: number;
};

export type TabValue = "summary" | "captures" | "replay" | "console" | "network" | "session";
