import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
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
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
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
