import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { runOutcomes } from "@screenshotsmcp/db";
import { emitDashboardEvent } from "./dashboard-events.js";

export type WorkflowAuthScope = "in" | "out" | "mixed" | "unknown";
export type WorkflowToolPath = "mcp" | "cli" | "unknown";
export type RunVerdict = "passed" | "failed" | "needs_review" | "inconclusive";

export interface RunOutcomeContext {
  taskType?: string | null;
  userGoal?: string | null;
  workflowUsed?: string | null;
  workflowRequired?: boolean;
  authScope?: WorkflowAuthScope;
  toolPath?: WorkflowToolPath;
  pageSet?: string[];
  requiredEvidence?: string[];
}

export interface PersistedConsoleEntry {
  level: string;
  text: string;
  ts: number;
}

export interface PersistedNetworkEntry {
  url: string;
  method?: string;
  status: number;
  statusText: string;
  resourceType?: string;
  duration?: number;
  size?: number;
  ts: number;
}

export interface RunFinding {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  evidenceRefs: string[];
  recommendation?: string;
}

export interface RunOutcomeRecord {
  taskType: string | null;
  userGoal: string | null;
  workflowUsed: string | null;
  contract: {
    workflowRequired: boolean;
    authScope: WorkflowAuthScope;
    toolPath: WorkflowToolPath;
    pageSet: string[];
    requiredEvidence: string[];
  };
  verdict: RunVerdict;
  summary: string;
  findings: RunFinding[];
  proofCoverage: {
    screenshots: number;
    recordings: number;
    console: boolean;
    network: boolean;
    primaryEvidence: "recording" | "screenshot" | "none";
    recordingEnabled: boolean;
  };
  validity: {
    workflowRequired: boolean;
    workflowUsedCorrectly: boolean;
    partial: boolean;
    missingEvidence: string[];
  };
  nextActions: string[];
}

export interface OutcomeSnapshotInput {
  runId: string;
  userId: string;
  status: "active" | "completed" | "failed";
  recordingEnabled: boolean;
  outcomeContext?: RunOutcomeContext | null;
  consoleLogs: PersistedConsoleEntry[];
  networkErrors: PersistedNetworkEntry[];
  networkRequests: PersistedNetworkEntry[];
  screenshotCount: number;
  recordingCount: number;
  finalizationError?: string;
}

export function normalizeOutcomeContext(input?: RunOutcomeContext | null): RunOutcomeContext | null {
  if (!input) return null;
  const pageSet = Array.isArray(input.pageSet)
    ? input.pageSet.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const requiredEvidence = Array.isArray(input.requiredEvidence)
    ? input.requiredEvidence.map((value) => String(value).trim()).filter(Boolean)
    : [];
  return {
    taskType: input.taskType?.trim() || null,
    userGoal: input.userGoal?.trim() || null,
    workflowUsed: input.workflowUsed?.trim() || null,
    workflowRequired: Boolean(input.workflowRequired || input.workflowUsed || input.taskType?.includes("audit") || input.taskType?.includes("review")),
    authScope: input.authScope ?? "unknown",
    toolPath: input.toolPath ?? "unknown",
    pageSet,
    requiredEvidence,
  };
}

function isWorkflowDrivenTask(context?: RunOutcomeContext | null): boolean {
  return Boolean(context?.workflowRequired || context?.workflowUsed || context?.taskType?.includes("audit") || context?.taskType?.includes("review"));
}

function buildOutcomeContract(context?: RunOutcomeContext | null) {
  return {
    workflowRequired: isWorkflowDrivenTask(context),
    authScope: context?.authScope ?? "unknown",
    toolPath: context?.toolPath ?? "unknown",
    pageSet: context?.pageSet ?? [],
    requiredEvidence: context?.requiredEvidence ?? [],
  };
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function createSummary(
  verdict: RunVerdict,
  context: RunOutcomeContext | null,
  proofCoverage: RunOutcomeRecord["proofCoverage"],
  consoleErrorCount: number,
  networkErrorCount: number,
): string {
  const goal = context?.userGoal || "Review this browser run";
  if (verdict === "failed") {
    return `${goal}. The run failed before completing successfully and should not be treated as a passing proof run.`;
  }
  if (verdict === "inconclusive") {
    return `${goal}. The run finished, but the recorded workflow context or proof coverage is incomplete, so the result should be treated as inconclusive.`;
  }
  if (verdict === "needs_review") {
    return `${goal}. The run completed with ${consoleErrorCount + networkErrorCount} high-priority diagnostic issue${consoleErrorCount + networkErrorCount === 1 ? "" : "s"} and needs review before it can be trusted.`;
  }
  return `${goal}. The run completed with ${proofCoverage.screenshots} persisted capture${proofCoverage.screenshots === 1 ? "" : "s"}${proofCoverage.recordings > 0 ? ` and ${proofCoverage.recordings} replay${proofCoverage.recordings === 1 ? "" : "s"}` : ""}, and no blocking workflow or diagnostic failures were found.`;
}

export function buildRunOutcomeRecord(input: OutcomeSnapshotInput): RunOutcomeRecord {
  const context = normalizeOutcomeContext(input.outcomeContext);
  const contract = buildOutcomeContract(context);
  const consoleErrorCount = input.consoleLogs.filter((entry) => entry.level === "error" || entry.level === "exception").length;
  const missingEvidence: string[] = [];
  const proofCoverage = {
    screenshots: input.screenshotCount,
    recordings: input.recordingCount,
    console: input.consoleLogs.length > 0,
    network: input.networkRequests.length > 0,
    primaryEvidence: input.recordingCount > 0 ? "recording" as const : input.screenshotCount > 0 ? "screenshot" as const : "none" as const,
    recordingEnabled: input.recordingEnabled,
  };

  if (contract.workflowRequired) {
    if (!context?.workflowUsed) missingEvidence.push("workflow_used");
    if (contract.pageSet.length === 0) missingEvidence.push("page_set");
    if (contract.authScope === "unknown") missingEvidence.push("auth_scope");
    if (contract.toolPath === "unknown") missingEvidence.push("tool_path");
    if (contract.requiredEvidence.length === 0) missingEvidence.push("required_evidence");
  }
  if (proofCoverage.primaryEvidence === "none") missingEvidence.push("visual_evidence");
  if (!proofCoverage.console) missingEvidence.push("console_diagnostics");
  if (!proofCoverage.network) missingEvidence.push("network_diagnostics");

  const workflowUsedCorrectly = contract.workflowRequired
    ? Boolean(context?.workflowUsed && contract.pageSet.length > 0 && contract.authScope !== "unknown" && contract.toolPath !== "unknown" && contract.requiredEvidence.length > 0)
    : true;
  const partial = missingEvidence.length > 0 || Boolean(input.finalizationError);

  const findings: RunFinding[] = [];
  if (input.status === "failed") {
    findings.push({
      id: "run_failed",
      severity: "high",
      title: "Run failed before completion",
      detail: "The browser session ended in a failed state, so the result should not be treated as a passing proof run.",
      evidenceRefs: ["run.status"],
      recommendation: "Retry the run after reviewing the final error state and session diagnostics.",
    });
  }
  if (contract.workflowRequired && !workflowUsedCorrectly) {
    findings.push({
      id: "workflow_context_incomplete",
      severity: "high",
      title: "Workflow context is incomplete",
      detail: "This workflow-driven run is missing part of its preflight contract, so the result is less trustworthy than a fully documented run.",
      evidenceRefs: ["outcome.validity", "outcome.contract"],
      recommendation: "Rerun with workflow name, page set, auth scope, tool path, and required evidence recorded before browser work begins.",
    });
  }
  if (input.networkErrors.length > 0) {
    findings.push({
      id: "network_failures",
      severity: "high",
      title: "Network failures were captured",
      detail: `${input.networkErrors.length} failed request${input.networkErrors.length === 1 ? " was" : "s were"} persisted for this run.`,
      evidenceRefs: ["network", "run.networkErrorCount"],
      recommendation: "Review failed requests before trusting the result.",
    });
  }
  if (consoleErrorCount > 0) {
    findings.push({
      id: "console_errors",
      severity: input.networkErrors.length > 0 ? "medium" : "high",
      title: "Console errors were captured",
      detail: `${consoleErrorCount} console error${consoleErrorCount === 1 ? " was" : "s were"} recorded during the run.`,
      evidenceRefs: ["console", "run.consoleErrorCount"],
      recommendation: "Inspect the console output before treating this run as a pass.",
    });
  }
  if (proofCoverage.primaryEvidence === "none") {
    findings.push({
      id: "missing_visual_proof",
      severity: contract.workflowRequired ? "high" : "medium",
      title: "No persisted visual proof was saved",
      detail: "The run finished without persisted screenshots or replay output, which makes the result harder to review or share.",
      evidenceRefs: ["captures", "replay"],
      recommendation: "Rerun with screenshots or recording enabled if proof needs to be reviewed later.",
    });
  }
  if (input.finalizationError) {
    findings.push({
      id: "recording_finalization_issue",
      severity: "medium",
      title: "Recording finalization had an issue",
      detail: input.finalizationError,
      evidenceRefs: ["recording.finalization"],
      recommendation: "Check the recording pipeline before relying on replay output for proof.",
    });
  }

  const verdict: RunVerdict = input.status === "failed"
    ? "failed"
    : contract.workflowRequired && !workflowUsedCorrectly
      ? "inconclusive"
      : proofCoverage.primaryEvidence === "none" && contract.workflowRequired
        ? "inconclusive"
        : consoleErrorCount + input.networkErrors.length > 0
          ? "needs_review"
          : "passed";

  return {
    taskType: context?.taskType ?? null,
    userGoal: context?.userGoal ?? null,
    workflowUsed: context?.workflowUsed ?? null,
    contract,
    verdict,
    summary: createSummary(verdict, context, proofCoverage, consoleErrorCount, input.networkErrors.length),
    findings,
    proofCoverage,
    validity: {
      workflowRequired: contract.workflowRequired,
      workflowUsedCorrectly,
      partial,
      missingEvidence: uniqueList(missingEvidence),
    },
    nextActions: uniqueList([
      verdict === "failed" ? "Retry the run after inspecting the failed step and final diagnostics." : "",
      contract.workflowRequired && !workflowUsedCorrectly ? "Record workflow context before browser work starts so the run is procedurally trustworthy." : "",
      input.networkErrors.length > 0 ? "Open the Network tab and investigate failed requests before trusting the result." : "",
      consoleErrorCount > 0 ? "Review console errors and page exceptions before treating the run as passed." : "",
      proofCoverage.primaryEvidence === "none" ? "Rerun with persisted screenshots or replay enabled if this result needs to be reviewed or shared." : "",
      verdict === "passed" ? "Share the run link or archive the run as a passing proof artifact." : "",
    ]),
  };
}

async function getDb() {
  const { db } = await import("./db.js");
  return db;
}

async function upsertRunOutcome(runId: string, userId: string, outcome: RunOutcomeRecord): Promise<void> {
  const database = await getDb();
  const [existing] = await database
    .select({ id: runOutcomes.id })
    .from(runOutcomes)
    .where(eq(runOutcomes.runId, runId));

  const values = {
    userId,
    version: 1,
    taskType: outcome.taskType,
    userGoal: outcome.userGoal,
    workflowUsed: outcome.workflowUsed,
    contract: JSON.stringify(outcome.contract),
    verdict: outcome.verdict,
    summary: outcome.summary,
    findings: JSON.stringify(outcome.findings),
    proofCoverage: JSON.stringify(outcome.proofCoverage),
    validity: JSON.stringify(outcome.validity),
    nextActions: JSON.stringify(outcome.nextActions),
    updatedAt: new Date(),
  };

  if (existing) {
    await database.update(runOutcomes).set(values).where(eq(runOutcomes.id, existing.id));
    return;
  }

  await database.insert(runOutcomes).values({
    id: nanoid(),
    runId,
    createdAt: new Date(),
    ...values,
  });
}

function emitOutcomeEvent(runId: string, userId: string, outcome: RunOutcomeRecord): void {
  emitDashboardEvent({
    type: "outcome.updated",
    userId,
    runId,
    payload: {
      runId,
      verdict: outcome.verdict,
      summary: outcome.summary,
      taskType: outcome.taskType,
      userGoal: outcome.userGoal,
      workflowUsed: outcome.workflowUsed,
      nextActions: outcome.nextActions,
      findings: outcome.findings,
    },
  });
}

export async function persistInitialRunOutcome(runId: string, userId: string, outcomeContext?: RunOutcomeContext | null): Promise<void> {
  const context = normalizeOutcomeContext(outcomeContext);
  const contract = buildOutcomeContract(context);
  if (!contract.workflowRequired && !context?.userGoal && !context?.taskType) return;
  const record: RunOutcomeRecord = {
    taskType: context?.taskType ?? null,
    userGoal: context?.userGoal ?? null,
    workflowUsed: context?.workflowUsed ?? null,
    contract,
    verdict: "inconclusive",
    summary: `${context?.userGoal || "Review this browser run"}. The run is in progress and the final outcome will be generated when the session ends.`,
    findings: [],
    proofCoverage: {
      screenshots: 0,
      recordings: 0,
      console: false,
      network: false,
      primaryEvidence: "none",
      recordingEnabled: false,
    },
    validity: {
      workflowRequired: contract.workflowRequired,
      workflowUsedCorrectly: !contract.workflowRequired,
      partial: true,
      missingEvidence: uniqueList([
        contract.workflowRequired && !context?.workflowUsed ? "workflow_used" : "",
        contract.pageSet.length === 0 && contract.workflowRequired ? "page_set" : "",
        contract.authScope === "unknown" && contract.workflowRequired ? "auth_scope" : "",
        contract.toolPath === "unknown" && contract.workflowRequired ? "tool_path" : "",
      ]),
    },
    nextActions: ["Complete the run so the final verdict and supporting findings can be generated."],
  };
  await upsertRunOutcome(runId, userId, record);
  emitOutcomeEvent(runId, userId, record);
}

export async function persistRunOutcomeSnapshot(input: OutcomeSnapshotInput): Promise<void> {
  const record = buildRunOutcomeRecord(input);
  await upsertRunOutcome(input.runId, input.userId, record);
  emitOutcomeEvent(input.runId, input.userId, record);
}
