DO $$ BEGIN
  CREATE TYPE "plan" AS ENUM('free', 'starter', 'pro');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "screenshot_status" AS ENUM('pending', 'processing', 'done', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "screenshot_format" AS ENUM('png', 'jpeg', 'webp');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY NOT NULL,
  "clerk_id" text NOT NULL UNIQUE,
  "email" text NOT NULL UNIQUE,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "plan" "plan" NOT NULL DEFAULT 'free',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "key_hash" text NOT NULL UNIQUE,
  "key_preview" text NOT NULL,
  "last_used" timestamp,
  "revoked" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "screenshots" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "status" "screenshot_status" NOT NULL DEFAULT 'pending',
  "r2_key" text,
  "public_url" text,
  "width" integer NOT NULL DEFAULT 1280,
  "height" integer DEFAULT 800,
  "full_page" boolean NOT NULL DEFAULT false,
  "format" "screenshot_format" NOT NULL DEFAULT 'png',
  "delay" integer NOT NULL DEFAULT 0,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp
);

CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "screenshot_id" text REFERENCES "screenshots"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "api_keys_user_id_idx" ON "api_keys" ("user_id");
CREATE INDEX IF NOT EXISTS "api_keys_key_hash_idx" ON "api_keys" ("key_hash");
CREATE INDEX IF NOT EXISTS "screenshots_user_id_idx" ON "screenshots" ("user_id");
CREATE INDEX IF NOT EXISTS "screenshots_status_idx" ON "screenshots" ("status");
CREATE INDEX IF NOT EXISTS "usage_events_user_id_created_at_idx" ON "usage_events" ("user_id", "created_at");
