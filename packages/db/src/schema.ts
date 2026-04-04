import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "starter", "pro"]);
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
  lastUsed: timestamp("last_used"),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const screenshots = pgTable("screenshots", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
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
