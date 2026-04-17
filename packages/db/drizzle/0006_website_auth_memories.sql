CREATE TABLE "website_auth_memories" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "origin" text NOT NULL,
  "inbox_id" text REFERENCES "test_inboxes"("id") ON DELETE set null,
  "inbox_email" text,
  "login_url" text,
  "preferred_auth_action" text DEFAULT 'unknown' NOT NULL,
  "signup_status" text DEFAULT 'unknown' NOT NULL,
  "login_status" text DEFAULT 'unknown' NOT NULL,
  "verification_required" boolean DEFAULT false NOT NULL,
  "last_successful_auth_path" text,
  "last_error" text,
  "notes" text,
  "last_used_at" timestamp,
  "last_success_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "website_auth_memories_user_origin_idx" ON "website_auth_memories" USING btree ("user_id", "origin");
