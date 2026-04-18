CREATE TABLE "try_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "try_rate_limits_ip_created_at_idx" ON "try_rate_limits" USING btree ("ip_hash","created_at");
