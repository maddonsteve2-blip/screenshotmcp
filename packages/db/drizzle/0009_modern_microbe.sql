CREATE TABLE "activation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"event_name" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activation_events_user_name_idx" ON "activation_events" USING btree ("user_id","event_name");--> statement-breakpoint
CREATE INDEX "activation_events_name_created_idx" ON "activation_events" USING btree ("event_name","created_at");