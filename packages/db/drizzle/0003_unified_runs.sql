CREATE TYPE "run_status" AS ENUM ('active', 'completed', 'failed');

CREATE TABLE "runs" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "status" "run_status" NOT NULL DEFAULT 'active',
  "execution_mode" text NOT NULL DEFAULT 'remote',
  "start_url" text,
  "recording_enabled" boolean NOT NULL DEFAULT false,
  "viewport_width" integer,
  "viewport_height" integer,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "ended_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "screenshots" ADD COLUMN "session_id" text;
ALTER TABLE "screenshots"
  ADD CONSTRAINT "screenshots_session_id_runs_id_fk"
  FOREIGN KEY ("session_id") REFERENCES "runs"("id") ON DELETE set null ON UPDATE no action;

INSERT INTO "runs" (
  "id",
  "user_id",
  "status",
  "execution_mode",
  "start_url",
  "recording_enabled",
  "viewport_width",
  "viewport_height",
  "started_at",
  "ended_at",
  "created_at",
  "updated_at"
)
SELECT DISTINCT
  "session_id",
  "user_id",
  'completed'::"run_status",
  'remote',
  "page_url",
  true,
  "viewport_width",
  "viewport_height",
  "created_at",
  "created_at",
  "created_at",
  "created_at"
FROM "recordings"
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "recordings"
  ADD CONSTRAINT "recordings_session_id_runs_id_fk"
  FOREIGN KEY ("session_id") REFERENCES "runs"("id") ON DELETE cascade ON UPDATE no action;
