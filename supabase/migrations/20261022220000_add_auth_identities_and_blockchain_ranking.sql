BEGIN;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS wallet TEXT;

CREATE TABLE IF NOT EXISTS public.auth_identities (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('email', 'google', 'x', 'metamask')),
  provider_user_id TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT auth_identities_method_subject_unique UNIQUE (method, provider_user_id)
);

CREATE INDEX IF NOT EXISTS auth_identities_user_method_idx
  ON public.auth_identities (user_id, method);

CREATE TABLE IF NOT EXISTS public.wallet_auth_tickets (
  token_hash TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at)
SELECT u.id, 'email', LOWER(BTRIM(u.email)), NULL
FROM public.usuarios u
WHERE NULLIF(BTRIM(u.email), '') IS NOT NULL
ON CONFLICT (method, provider_user_id) DO NOTHING;

INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at)
SELECT oa.user_id, oa.provider, oa.provider_user_id, NOW()
FROM public.oauth_accounts oa
WHERE oa.provider IN ('google', 'x')
  AND NULLIF(BTRIM(oa.provider_user_id), '') IS NOT NULL
ON CONFLICT (method, provider_user_id) DO NOTHING;

INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at)
SELECT DISTINCT ON (LOWER(wallet_identity.wallet))
  wallet_identity.user_id, 'metamask', LOWER(wallet_identity.wallet), NOW()
FROM (
  SELECT u.id AS user_id, u.wallet AS wallet
  FROM public.usuarios u
  WHERE u.wallet ~* '^0x[a-f0-9]{40}$'
  UNION
  SELECT u.id AS user_id, u.wallet_address AS wallet
  FROM public.usuarios u
  WHERE u.wallet_address ~* '^0x[a-f0-9]{40}$'
  UNION
  SELECT u.id AS user_id, u.login AS wallet
  FROM public.usuarios u
  WHERE u.login ~* '^0x[a-f0-9]{40}$'
) AS wallet_identity
ORDER BY LOWER(wallet_identity.wallet), wallet_identity.user_id
ON CONFLICT (method, provider_user_id) DO NOTHING;

ALTER TABLE public.ranking_leitores
  ADD COLUMN IF NOT EXISTS pontos_onchain BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.ranking_leitores
  ADD COLUMN IF NOT EXISTS onchain_synced_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.blockchain_ranking_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  wallet_address TEXT,
  chain_id BIGINT NOT NULL,
  contract_address TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index BIGINT NOT NULL,
  block_number BIGINT,
  event_type TEXT NOT NULL,
  points_delta BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'observed'
    CHECK (status IN ('observed', 'confirmed', 'reverted', 'ignored')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  CONSTRAINT blockchain_ranking_events_chain_tx_log_unique
    UNIQUE (chain_id, transaction_hash, log_index)
);

CREATE INDEX IF NOT EXISTS blockchain_ranking_events_user_block_idx
  ON public.blockchain_ranking_events (user_id, block_number DESC);

CREATE INDEX IF NOT EXISTS blockchain_ranking_events_status_observed_idx
  ON public.blockchain_ranking_events (status, observed_at);

COMMIT;
