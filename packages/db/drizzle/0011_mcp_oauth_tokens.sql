CREATE TABLE IF NOT EXISTS "mcp_oauth_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "client_id" text NOT NULL DEFAULT 'mcp-client',
  "scope" text NOT NULL DEFAULT 'mcp:tools',
  "expires_at" timestamp NOT NULL,
  "last_used" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_oauth_tokens_token_hash_idx"
  ON "mcp_oauth_tokens" ("token_hash");

CREATE INDEX IF NOT EXISTS "mcp_oauth_tokens_user_idx"
  ON "mcp_oauth_tokens" ("user_id");
