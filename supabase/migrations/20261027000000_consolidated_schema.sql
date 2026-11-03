-- Migration consolidada: Schema completo do BookHub
-- Este arquivo contém toda a estrutura do banco de dados necessária

BEGIN;

-- 1. Tabelas de catálogo (livros, autores, editoras)
CREATE TABLE IF NOT EXISTS public.autores (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.editoras (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.livros (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  id_autor INTEGER REFERENCES public.autores(id),
  id_editora INTEGER REFERENCES public.editoras(id),
  genero TEXT,
  url_capa TEXT,
  ano_publicacao INTEGER,
  numero_paginas INTEGER,
  idioma TEXT DEFAULT 'Português',
  resumo TEXT,
  disponivel BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabelas de usuários e autenticação
CREATE TABLE IF NOT EXISTS public.usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT,
  username TEXT,
  email TEXT,
  senha TEXT,
  login TEXT UNIQUE,
  wallet TEXT,
  wallet_address TEXT,
  avatar TEXT DEFAULT '/img/avatar1.png',
  tipo TEXT DEFAULT 'aluno',
  data_cadastro TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Códigos de verificação de e-mail
CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  verification_ticket_hash TEXT
);

-- 4. Desafios de login por carteira
CREATE TABLE IF NOT EXISTS public.wallet_login_challenges (
  wallet TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- 5. Tickets de autenticação de carteira
CREATE TABLE IF NOT EXISTS public.wallet_auth_tickets (
  token_hash TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

-- 6. Sessões de autenticação
CREATE TABLE IF NOT EXISTS public.auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_expiry_idx
  ON public.auth_sessions (user_id, expires_at);

-- 7. Estados OAuth (com PKCE para X)
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code_verifier TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

-- 8. Contas OAuth vinculadas
CREATE TABLE IF NOT EXISTS public.oauth_accounts (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (provider, provider_user_id)
);

-- 9. Handoffs OAuth
CREATE TABLE IF NOT EXISTS public.oauth_handoffs (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- 10. Tickets de e-mail OAuth
CREATE TABLE IF NOT EXISTS public.oauth_email_tickets (
  token_hash TEXT PRIMARY KEY,
  provider_user_id TEXT NOT NULL,
  display_name TEXT,
  username TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

-- 11. Identidades de autenticação unificadas
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

-- 12. Ranking de leitores
CREATE TABLE IF NOT EXISTS public.ranking_leitores (
  usuario_id INTEGER PRIMARY KEY REFERENCES public.usuarios(id),
  livros_lidos INTEGER DEFAULT 0,
  pontos INTEGER DEFAULT 0,
  pontos_onchain BIGINT NOT NULL DEFAULT 0,
  onchain_synced_at TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Eventos de blockchain para ranking
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

-- 14. Temporadas do ranking
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

-- 15. Resultados por temporada
CREATE TABLE IF NOT EXISTS public.ranking_season_results (
  season_id BIGINT NOT NULL REFERENCES public.ranking_seasons(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  points INTEGER NOT NULL CHECK (points >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (season_id, user_id),
  UNIQUE (season_id, position)
);

-- 16. Eventos de pontuação
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

-- 18. Exemplares de livros (controle de cópias físicas)
CREATE TABLE IF NOT EXISTS public.exemplares (
  id BIGSERIAL PRIMARY KEY,
  livro_id INTEGER NOT NULL REFERENCES public.livros(id) ON DELETE CASCADE,
  codigo_exemplar TEXT, -- ex: código de barras, RFID
  estado TEXT NOT NULL DEFAULT 'disponivel'
    CHECK (estado IN ('disponivel', 'reservado', 'emprestado', 'manutencao', 'extraviado')),
  localizacao TEXT, -- ex: estante, sala
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exemplares_livro_estado_idx
  ON public.exemplares (livro_id, estado);

-- 17. Reservas de livros
CREATE TABLE IF NOT EXISTS public.bookhub_reservations (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  book_id INTEGER REFERENCES public.livros(id) ON DELETE SET NULL,
  exemplar_id BIGINT REFERENCES public.exemplares(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS bookhub_reservations_exemplar_idx
  ON public.bookhub_reservations (exemplar_id);

CREATE UNIQUE INDEX IF NOT EXISTS bookhub_reservations_one_pending_idx
  ON public.bookhub_reservations (user_id, book_id) WHERE status = 'Pendente';


CREATE UNIQUE INDEX IF NOT EXISTS bookhub_reservations_one_active_exemplar_idx
  ON public.bookhub_reservations (exemplar_id) WHERE exemplar_id IS NOT NULL AND status IN ('Pendente', 'Aprovado');

-- 19. Log de envio de códigos de e-mail (para rate limiting por IP)
CREATE TABLE IF NOT EXISTS public.email_code_logs (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_code_logs_email_created_idx
  ON public.email_code_logs (email, created_at DESC);

CREATE INDEX IF NOT EXISTS email_code_logs_ip_created_idx
  ON public.email_code_logs (ip, created_at DESC);

-- 20. Popular identidades de autenticação existentes
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
  SELECT u.id AS user_id, u.wallet AS wallet FROM public.usuarios u WHERE u.wallet ~* '^0x[a-f0-9]{40}$'
  UNION
  SELECT u.id AS user_id, u.wallet_address AS wallet FROM public.usuarios u WHERE u.wallet_address ~* '^0x[a-f0-9]{40}$'
  UNION
  SELECT u.id AS user_id, u.login AS wallet FROM public.usuarios u WHERE u.login ~* '^0x[a-f0-9]{40}$'
) AS wallet_identity
ORDER BY LOWER(wallet_identity.wallet), wallet_identity.user_id
ON CONFLICT (method, provider_user_id) DO NOTHING;

COMMIT;