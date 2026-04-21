import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "starter", "pro"]);
export const runStatusEnum = pgEnum("run_status", ["active", "completed", "failed"]);
export const screenshotStatusEnum = pgEnum("screenshot_status", [
  "pending",
  "processing",
  "done",
  "failed",
]);
export const screenshotFormatEnum = pgEnum("screenshot_format", [
  "png",
  "jpeg",
  "webp",
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: planEnum("plan").notNull().default("free"),
  agentmailApiKey: text("agentmail_api_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPreview: text("key_preview").notNull(),
  encryptedKey: text("encrypted_key"),
  lastUsed: timestamp("last_used"),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: runStatusEnum("status").notNull().default("active"),
  executionMode: text("execution_mode").notNull().default("remote"),
  startUrl: text("start_url"),
  finalUrl: text("final_url"),
  pageTitle: text("page_title"),
  recordingEnabled: boolean("recording_enabled").notNull().default(false),
  viewportWidth: integer("viewport_width"),
  viewportHeight: integer("viewport_height"),
  consoleLogs: text("console_logs").notNull().default("[]"),
  networkErrors: text("network_errors").notNull().default("[]"),
  networkRequests: text("network_requests").notNull().default("[]"),
  consoleLogCount: integer("console_log_count").notNull().default(0),
  consoleErrorCount: integer("console_error_count").notNull().default(0),
  consoleWarningCount: integer("console_warning_count").notNull().default(0),
  networkRequestCount: integer("network_request_count").notNull().default(0),
  networkErrorCount: integer("network_error_count").notNull().default(0),
  shareToken: text("share_token"),
  sharedAt: timestamp("shared_at"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const runOutcomes = pgTable(
  "run_outcomes",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    taskType: text("task_type"),
    userGoal: text("user_goal"),
    workflowUsed: text("workflow_used"),
    contract: text("contract").notNull().default("{}"),
    verdict: text("verdict").notNull().default("inconclusive"),
    problem: text("problem"),
    summary: text("summary"),
    findings: text("findings").notNull().default("[]"),
    proofCoverage: text("proof_coverage").notNull().default("{}"),
    validity: text("validity").notNull().default("{}"),
    nextActions: text("next_actions").notNull().default("[]"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    runIdIdx: uniqueIndex("run_outcomes_run_id_idx").on(table.runId),
  }),
);

export const screenshots = pgTable("screenshots", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => runs.id, { onDelete: "set null" }),
  url: text("url").notNull(),
  status: screenshotStatusEnum("status").notNull().default("pending"),
  r2Key: text("r2_key"),
  publicUrl: text("public_url"),
  width: integer("width").notNull().default(1280),
  height: integer("height").default(800),
  fullPage: boolean("full_page").notNull().default(false),
  format: screenshotFormatEnum("format").notNull().default("png"),
  delay: integer("delay").notNull().default(0),
  errorMessage: text("error_message"),
  // Narrated run timeline metadata (v1.2 — populated for session-linked shots)
  stepIndex: integer("step_index"),
  actionLabel: text("action_label"),
  outcome: text("outcome"),
  toolName: text("tool_name"),
  captionSource: text("caption_source").notNull().default("auto"),
  agentNote: text("agent_note"),
  prevUrl: text("prev_url"),
  pageTitle: text("page_title"),
  heading: text("heading"),
  // Per-screenshot public share (v1.3 — mirrors runs.shareToken pattern)
  shareToken: text("share_token").unique(),
  sharedAt: timestamp("shared_at"),
  // Annotation payload (v1.3 — Konva JSON serialization)
  annotations: jsonb("annotations"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const testInboxes = pgTable("test_inboxes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const websiteAuthMemories = pgTable(
  "website_auth_memories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    origin: text("origin").notNull(),
    inboxId: text("inbox_id").references(() => testInboxes.id, { onDelete: "set null" }),
    inboxEmail: text("inbox_email"),
    loginUrl: text("login_url"),
    preferredAuthAction: text("preferred_auth_action").notNull().default("unknown"),
    signupStatus: text("signup_status").notNull().default("unknown"),
    loginStatus: text("login_status").notNull().default("unknown"),
    verificationRequired: boolean("verification_required").notNull().default(false),
    lastSuccessfulAuthPath: text("last_successful_auth_path"),
    lastError: text("last_error"),
    notes: text("notes"),
    lastUsedAt: timestamp("last_used_at"),
    lastSuccessAt: timestamp("last_success_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userOriginIdx: uniqueIndex("website_auth_memories_user_origin_idx").on(table.userId, table.origin),
  }),
);

export const recordings = pgTable("recordings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  r2Key: text("r2_key").notNull(),
  pageUrl: text("page_url"),
  fileSize: integer("file_size"),
  durationMs: integer("duration_ms"),
  viewportWidth: integer("viewport_width"),
  viewportHeight: integer("viewport_height"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usageEvents = pgTable("usage_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  screenshotId: text("screenshot_id").references(() => screenshots.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    // Event selectors. `*` matches all events.
    events: text("events")
      .array()
      .notNull()
      .default(sql`ARRAY['*']::text[]`),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    lastDeliveredAt: timestamp("last_delivered_at"),
    lastFailureAt: timestamp("last_failure_at"),
  },
  (table) => ({
    byUser: index("webhook_endpoints_user_idx").on(table.userId),
  }),
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    // JSON-encoded payload; stored as text to keep the schema dependency-free.
    payload: text("payload").notNull(),
    attempt: integer("attempt").notNull().default(0),
    // pending | success | failed | exhausted
    status: text("status").notNull().default("pending"),
    responseCode: integer("response_code"),
    responseBody: text("response_body"),
    errorMessage: text("error_message"),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    byEndpointCreated: index("webhook_deliveries_endpoint_created_idx").on(
      table.endpointId,
      table.createdAt,
    ),
    byUserCreated: index("webhook_deliveries_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

/**
 * Lightweight activation funnel events. Drop-in replacement target for PostHog
 * once that's wired up — schema deliberately mirrors PostHog's event shape so
 * a future backfill is straightforward. Events fire from API route handlers,
 * webhook routes, and Stripe billing webhooks (when enabled).
 *
 * Canonical event names:
 *   - signup            (user_id present, plan='free')
 *   - api_key_created
 *   - first_screenshot
 *   - first_diff
 *   - first_session
 *   - first_webhook
 *   - upgraded          (props: { fromPlan, toPlan })
 *   - downgraded
 *   - quota_warning_80
 *   - quota_warning_95
 *   - quota_exceeded
 */
export const activationEvents = pgTable(
  "activation_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    eventName: text("event_name").notNull(),
    properties: jsonb("properties").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    byUserName: index("activation_events_user_name_idx").on(table.userId, table.eventName),
    byNameCreated: index("activation_events_name_created_idx").on(table.eventName, table.createdAt),
  }),
);

export const tryRateLimits = pgTable(
  "try_rate_limits",
  {
    id: text("id").primaryKey(),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    ipHashCreatedAtIdx: index("try_rate_limits_ip_created_at_idx").on(
      table.ipHash,
      table.createdAt,
    ),
  }),
);
