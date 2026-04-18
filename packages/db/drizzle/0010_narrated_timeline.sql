-- Narrated run timeline (v1.2)
-- Adds per-screenshot narrative metadata + run problem field.
-- Also creates run_outcomes (schema was declared but never migrated).
-- All additions nullable or defaulted; zero-downtime.

CREATE TABLE IF NOT EXISTS "run_outcomes" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "task_type" text,
  "user_goal" text,
  "workflow_used" text,
  "contract" text NOT NULL DEFAULT '{}',
  "verdict" text NOT NULL DEFAULT 'inconclusive',
  "problem" text,
  "summary" text,
  "findings" text NOT NULL DEFAULT '[]',
  "proof_coverage" text NOT NULL DEFAULT '{}',
  "validity" text NOT NULL DEFAULT '{}',
  "next_actions" text NOT NULL DEFAULT '[]',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "run_outcomes_run_id_idx" ON "run_outcomes" ("run_id");

ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "step_index" integer;
ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "action_label" text;
ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "outcome" text;
ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "tool_name" text;
ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "caption_source" text NOT NULL DEFAULT 'auto';
ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "agent_note" text;
ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "prev_url" text;
ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "page_title" text;
ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "heading" text;

CREATE INDEX IF NOT EXISTS "screenshots_session_step_idx"
  ON "screenshots" ("session_id", "step_index");

-- If run_outcomes was already created by a previous migration without `problem`,
-- this keeps the column addition idempotent.
ALTER TABLE "run_outcomes" ADD COLUMN IF NOT EXISTS "problem" text;
