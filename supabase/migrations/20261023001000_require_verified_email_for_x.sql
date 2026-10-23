BEGIN;

CREATE TABLE IF NOT EXISTS public.oauth_email_tickets (
  token_hash TEXT PRIMARY KEY,
  provider_user_id TEXT NOT NULL,
  display_name TEXT,
  username TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

COMMIT;
