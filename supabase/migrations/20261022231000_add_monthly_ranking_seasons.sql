BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_expiry_idx
  ON public.auth_sessions (user_id, expires_at);

CREATE TABLE IF NOT EXISTS public.ranking_seasons (
  id BIGSERIAL PRIMARY KEY,
  season_key TEXT NOT NULL UNIQUE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  results_hash TEXT,
  hash_algorithm TEXT,
  chain_id BIGINT,
  onchain_tx_hash TEXT,
  anchored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  CONSTRAINT ranking_seasons_valid_period CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.ranking_season_results (
  season_id BIGINT NOT NULL REFERENCES public.ranking_seasons(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  points INTEGER NOT NULL CHECK (points >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (season_id, user_id),
  UNIQUE (season_id, position)
);

CREATE TABLE IF NOT EXISTS public.ranking_point_events (
  id BIGSERIAL PRIMARY KEY,
  season_id BIGINT NOT NULL REFERENCES public.ranking_seasons(id),
  user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ranking_point_events_source_unique
    UNIQUE (season_id, user_id, event_type, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS ranking_point_events_season_score_idx
  ON public.ranking_point_events (season_id, user_id);

CREATE TABLE IF NOT EXISTS public.bookhub_reservations (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  book_id INTEGER REFERENCES public.livros(id) ON DELETE SET NULL,
  book_title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pendente'
    CHECK (status IN ('Pendente', 'Aprovado', 'Rejeitado')),
  motivo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookhub_reservations_user_created_idx
  ON public.bookhub_reservations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bookhub_reservations_status_created_idx
  ON public.bookhub_reservations (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS bookhub_reservations_one_pending_idx
  ON public.bookhub_reservations (user_id, book_id) WHERE status = 'Pendente';

COMMIT;
