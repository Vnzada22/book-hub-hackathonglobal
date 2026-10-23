require('dotenv').config();

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/:6643\//, ':6543/');
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { verifyMessage } = require('ethers');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const projectRoot = __dirname;

app.use(cors());
app.use(express.json());

const db = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
}) : null;

if (db) {
  db.on('error', (err) => {
    console.error('❌ ERRO INESPERADO NO POOL DO BANCO:', err.message);
  });

  // Teste imediato de conexão ao iniciar o servidor
  db.query('SELECT now()')
    .then(res => console.log('✅ CONEXÃO ESTABELECIDA COM SUPABASE! Hora do servidor:', res.rows[0].now))
    .catch(err => console.error('❌ FALHA NA CONEXÃO INICIAL COM SUPABASE:', err.message));
} else {
  console.error('⚠️ DATABASE_URL não encontrada no .env!');
}

async function garantirEstruturaBanco() {
  if (!db) return;

  try {
    const { rows } = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    const tabelas = new Set(rows.map((row) => row.table_name));

    const sqls = [
      `CREATE TABLE IF NOT EXISTS public.autores (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL UNIQUE,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS public.editoras (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL UNIQUE,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS public.livros (
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
      )`,
      `CREATE TABLE IF NOT EXISTS public.usuarios (
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
      )`,
      `CREATE TABLE IF NOT EXISTS public.email_verification_codes (
        email TEXT PRIMARY KEY,
        code_hash TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        verified_at TIMESTAMPTZ,
        verification_ticket_hash TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS public.wallet_login_challenges (
        wallet TEXT PRIMARY KEY,
        message TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS public.wallet_auth_tickets (
        token_hash TEXT PRIMARY KEY,
        wallet TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ
      )`,
      `CREATE TABLE IF NOT EXISTS public.auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS auth_sessions_user_expiry_idx
        ON public.auth_sessions (user_id, expires_at)`,
      `CREATE TABLE IF NOT EXISTS public.oauth_states (
        state TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        code_verifier TEXT,
        expires_at TIMESTAMPTZ NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS public.oauth_accounts (
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        PRIMARY KEY (provider, provider_user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS public.oauth_handoffs (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS public.oauth_email_tickets (
        token_hash TEXT PRIMARY KEY,
        provider_user_id TEXT NOT NULL,
        display_name TEXT,
        username TEXT,
        expires_at TIMESTAMPTZ NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS public.auth_identities (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        method TEXT NOT NULL CHECK (method IN ('email', 'google', 'x', 'metamask')),
        provider_user_id TEXT NOT NULL,
        verified_at TIMESTAMPTZ,
        last_login_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT auth_identities_method_subject_unique UNIQUE (method, provider_user_id)
      )`,
      `CREATE INDEX IF NOT EXISTS auth_identities_user_method_idx
        ON public.auth_identities (user_id, method)`,
      `CREATE TABLE IF NOT EXISTS public.ranking_leitores (
        usuario_id INTEGER PRIMARY KEY REFERENCES public.usuarios(id),
        livros_lidos INTEGER DEFAULT 0,
        pontos INTEGER DEFAULT 0,
        pontos_onchain BIGINT NOT NULL DEFAULT 0,
        onchain_synced_at TIMESTAMPTZ,
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS public.blockchain_ranking_events (
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
      )`,
      `CREATE INDEX IF NOT EXISTS blockchain_ranking_events_user_block_idx
        ON public.blockchain_ranking_events (user_id, block_number DESC)`,
      `CREATE INDEX IF NOT EXISTS blockchain_ranking_events_status_observed_idx
        ON public.blockchain_ranking_events (status, observed_at)`,
      `CREATE TABLE IF NOT EXISTS public.ranking_seasons (
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
      )`,
      `CREATE TABLE IF NOT EXISTS public.ranking_season_results (
        season_id BIGINT NOT NULL REFERENCES public.ranking_seasons(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        position INTEGER NOT NULL CHECK (position > 0),
        points INTEGER NOT NULL CHECK (points >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (season_id, user_id),
        UNIQUE (season_id, position)
      )`,
      `CREATE TABLE IF NOT EXISTS public.ranking_point_events (
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
      )`,
      `CREATE INDEX IF NOT EXISTS ranking_point_events_season_score_idx
        ON public.ranking_point_events (season_id, user_id)`,
      `CREATE TABLE IF NOT EXISTS public.bookhub_reservations (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
        book_id INTEGER REFERENCES public.livros(id) ON DELETE SET NULL,
        book_title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pendente'
          CHECK (status IN ('Pendente', 'Aprovado', 'Rejeitado')),
        motivo TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS bookhub_reservations_user_created_idx
        ON public.bookhub_reservations (user_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS bookhub_reservations_status_created_idx
        ON public.bookhub_reservations (status, created_at DESC)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS bookhub_reservations_one_pending_idx
        ON public.bookhub_reservations (user_id, book_id) WHERE status = 'Pendente'`
    ];

    for (const sql of sqls) {
      await db.query(sql);
    }

    await db.query('ALTER TABLE public.livros ADD COLUMN IF NOT EXISTS resumo TEXT');
    await db.query('ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS wallet TEXT');
    await db.query('ALTER TABLE public.ranking_leitores ADD COLUMN IF NOT EXISTS pontos_onchain BIGINT NOT NULL DEFAULT 0');
    await db.query('ALTER TABLE public.ranking_leitores ADD COLUMN IF NOT EXISTS onchain_synced_at TIMESTAMPTZ');
    await db.query(`
      INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at)
      SELECT u.id, 'email', LOWER(BTRIM(u.email)), NULL
      FROM public.usuarios u
      WHERE NULLIF(BTRIM(u.email), '') IS NOT NULL
      ON CONFLICT (method, provider_user_id) DO NOTHING
    `);
    await db.query(`
      INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at)
      SELECT oa.user_id, oa.provider, oa.provider_user_id, NOW()
      FROM public.oauth_accounts oa
      WHERE oa.provider IN ('google', 'x')
        AND NULLIF(BTRIM(oa.provider_user_id), '') IS NOT NULL
      ON CONFLICT (method, provider_user_id) DO NOTHING
    `);
    await db.query(`
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
      ON CONFLICT (method, provider_user_id) DO NOTHING
    `);

    if (!tabelas.has('usuarios')) {
      console.log('✅ Tabela usuarios criada automaticamente.');
    }
    if (!tabelas.has('livros')) {
      console.log('✅ Tabela livros criada automaticamente.');
    }
  } catch (error) {
    console.error('❌ ERRO AO GARANTIR ESTRUTURA DO BANCO:', error.message);
  }
}

const livrosFallback = [];
const livrosBase = [];

const usuarios = []; // Agora será apenas para fallback se necessário, mas usaremos o DB


let nextLivroId = livrosBase.length + 1;
let nextUsuarioId = usuarios.length + 1;

function normalizarWallet(wallet) {
  return String(wallet || '').trim().toLowerCase();
}

const AUTH_SESSION_COOKIE = 'bookhub_session';
const AUTH_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

async function criarSessaoAutenticada(res, userId) {
  const token = criarTokenSeguro();
  await db.query(
    `INSERT INTO public.auth_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
    [hashAuthValue(token), userId]
  );
  res.cookie(AUTH_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: AUTH_SESSION_MAX_AGE_MS,
    path: '/'
  });
}

function limparSessaoAutenticada(res) {
  res.clearCookie(AUTH_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
}

function obterTokenSessao(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  const cookie = cookies.map(parte => parte.trim()).find(parte => parte.startsWith(`${AUTH_SESSION_COOKIE}=`));
  return cookie ? cookie.slice(AUTH_SESSION_COOKIE.length + 1) : '';
}

async function buscarUsuarioDaSessao(queryable, req) {
  const token = obterTokenSessao(req);
  if (!token) return null;
  const { rows } = await queryable.query(
    `SELECT u.*
     FROM public.auth_sessions s
     JOIN public.usuarios u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [hashAuthValue(token)]
  );
  if (rows[0]) {
    await queryable.query(
      'UPDATE public.auth_sessions SET last_used_at = NOW() WHERE token_hash = $1',
      [hashAuthValue(token)]
    );
  }
  return rows[0] || null;
}

function obterPeriodoTemporada(data = new Date()) {
  const inicio = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 1));
  const chave = `${inicio.getUTCFullYear()}-${String(inicio.getUTCMonth() + 1).padStart(2, '0')}`;
  return { chave, inicio, fim };
}

async function garantirTemporadaAtual(queryable = db) {
  const periodo = obterPeriodoTemporada();
  const { rows } = await queryable.query(
    `INSERT INTO public.ranking_seasons (season_key, starts_at, ends_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (season_key) DO UPDATE SET season_key = EXCLUDED.season_key
     RETURNING *`,
    [periodo.chave, periodo.inicio, periodo.fim]
  );
  return rows[0];
}

function calcularHashResultadosTemporada(seasonKey, resultados) {
  let nivel = resultados.map((resultado) => crypto.createHash('sha256')
    .update(`${seasonKey}|${resultado.user_id}|${resultado.position}|${resultado.points}`)
    .digest());
  if (!nivel.length) return crypto.createHash('sha256').update(`${seasonKey}|empty`).digest('hex');

  while (nivel.length > 1) {
    const proximoNivel = [];
    for (let indice = 0; indice < nivel.length; indice += 2) {
      const esquerda = nivel[indice];
      const direita = nivel[indice + 1] || esquerda;
      proximoNivel.push(crypto.createHash('sha256').update(Buffer.concat([esquerda, direita])).digest());
    }
    nivel = proximoNivel;
  }
  return nivel[0].toString('hex');
}

async function finalizarTemporadasVencidas() {
  if (!db) return;
  const { rows: temporadas } = await db.query(
    `SELECT id FROM public.ranking_seasons
     WHERE status = 'active' AND ends_at <= NOW()
     ORDER BY starts_at`
  );

  for (const temporada of temporadas) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT * FROM public.ranking_seasons WHERE id = $1 FOR UPDATE',
        [temporada.id]
      );
      if (!rows.length || rows[0].status !== 'active') {
        await client.query('COMMIT');
        continue;
      }

      const season = rows[0];
      await client.query(
        'DELETE FROM public.ranking_season_results WHERE season_id = $1',
        [season.id]
      );
      const { rows: resultados } = await client.query(
        `WITH pontuacoes AS (
           SELECT user_id, SUM(points)::INTEGER AS points
           FROM public.ranking_point_events
           WHERE season_id = $1
           GROUP BY user_id
         ),
         classificados AS (
           SELECT
             u.id AS user_id,
             COALESCE(p.points, 0) AS points,
             ROW_NUMBER() OVER (
               ORDER BY COALESCE(p.points, 0) DESC, COALESCE(u.username, u.nome, u.login, '') ASC, u.id ASC
             )::INTEGER AS position
           FROM public.usuarios u
           LEFT JOIN pontuacoes p ON p.user_id = u.id
         )
         INSERT INTO public.ranking_season_results (season_id, user_id, position, points)
         SELECT $1, user_id, position, points
         FROM classificados
         RETURNING user_id, position, points`,
        [season.id]
      );
      const resultsHash = calcularHashResultadosTemporada(
        season.season_key,
        resultados.sort((a, b) => a.position - b.position)
      );

      await client.query(
        `UPDATE public.ranking_seasons
         SET status = 'closed', results_hash = $2, hash_algorithm = 'sha256-merkle-v1',
             closed_at = NOW()
         WHERE id = $1`,
        [season.id, resultsHash]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Erro ao fechar temporada ${temporada.id}:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function registrarEventoDePontuacao(client, {
  seasonId,
  userId,
  eventType,
  sourceType,
  sourceId,
  points,
  metadata = {}
}) {
  const { rows } = await client.query(
    `INSERT INTO public.ranking_point_events
       (season_id, user_id, event_type, source_type, source_id, points, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT ON CONSTRAINT ranking_point_events_source_unique DO NOTHING
     RETURNING id`,
    [seasonId, userId, eventType, sourceType, String(sourceId), points, JSON.stringify(metadata)]
  );
  return rows.length > 0;
}

function hashAuthValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashEmailCode(email, code) {
  return crypto.createHmac('sha256', process.env.AUTH_TOKEN_SECRET)
    .update(`${email}:${code}`)
    .digest('hex');
}

function criarTokenSeguro(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function montarUsuarioPublico(usuario) {
  if (!usuario) return null;
  const { senha, ...dados } = usuario;
  return montarUsuarioSeguranca(dados);
}

function montarUsuarioSeguranca(usuario) {
  if (!usuario) return null;
  const wallet = usuario.walletAddress || usuario.wallet_address || usuario.wallet;
  return { ...usuario, walletAddress: wallet, wallet_address: wallet, wallet };
}

async function registrarIdentidadeAutenticacao(client, { userId, method, providerUserId, verified = true }) {
  const subject = String(providerUserId || '').trim();
  if (!userId || !subject) throw new Error('Identidade de autenticação incompleta.');

  const { rows } = await client.query(
    `INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at, last_login_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (method, provider_user_id) DO UPDATE SET
       verified_at = COALESCE(auth_identities.verified_at, EXCLUDED.verified_at),
       last_login_at = NOW()
     WHERE auth_identities.user_id = EXCLUDED.user_id
     RETURNING id`,
    [userId, method, subject, verified ? new Date() : null]
  );

  if (!rows.length) {
    throw new Error(`A identidade ${method} já está associada a outra conta.`);
  }
}

function normalizarLivro(dados = {}) {
  const titulo = [dados.titulo, dados.titulo_original, dados.original_title, dados.titulo_catalogo, dados.title]
    .map((valor) => String(valor || '').trim())
    .find((valor) => valor && !/^(?:t[ií]tulo desconhecido|unknown title|livro sem t[ií]tulo)$/i.test(valor))
    || 'Obra sem título';
  return {
    id: Number(dados.id) || 0,
    titulo,
    autor: String(dados.autor || 'Autor desconhecido').trim(),
    editora: String(dados.editora || 'Editora não informada').trim(),
    genero: String(dados.genero || 'Geral').trim(),
    url_capa: String(dados.url_capa || '').trim(),
    ano_publicacao: dados.ano_publicacao ? Number(dados.ano_publicacao) : null,
    numero_paginas: dados.numero_paginas ? Number(dados.numero_paginas) : null,
    idioma: String(dados.idioma || 'Português').trim(),
    resumo: String(dados.resumo ?? dados.descricao ?? '').trim(),
    disponivel: dados.disponivel !== false
  };
}

function normalizarLivroDoBanco(row = {}) {
  const titulo = [row.titulo, row.titulo_original, row.original_title, row.titulo_catalogo, row.title]
    .map((valor) => String(valor || '').trim())
    .find((valor) => valor && !/^(?:t[ií]tulo desconhecido|unknown title|livro sem t[ií]tulo)$/i.test(valor))
    || 'Obra sem título';
  return {
    id: Number(row.id ?? 0),
    titulo,
    autor: String(row.autor ?? row.author ?? 'Autor desconhecido').trim(),
    editora: String(row.editora ?? row.publisher ?? 'Editora não informada').trim(),
    genero: String(row.genero ?? row.genre ?? 'Geral').trim(),
    url_capa: String(row.url_capa ?? row.capa ?? '').trim(),
    ano_publicacao: row.ano_publicacao ?? row.ano ?? null,
    numero_paginas: row.numero_paginas ?? row.paginas ?? null,
    idioma: String(row.idioma ?? row.language ?? 'Português').trim(),
    resumo: String(row.resumo ?? row.descricao ?? '').trim(),
    disponivel: row.disponivel !== false && row.disponivel !== 0
  };
}

async function buscarLivrosDoBanco() {
  if (!db) return [];

  try {
    const query = `
      SELECT
        l.id,
        l.titulo,
        COALESCE(a.nome, 'Autor desconhecido') AS autor,
        COALESCE(e.nome, 'Editora não informada') AS editora,
        l.genero,
        l.url_capa,
        l.ano_publicacao,
        l.numero_paginas,
        l.idioma,
        l.resumo,
        l.disponivel
      FROM public.livros l
      LEFT JOIN public.autores a ON a.id = l.id_autor
      LEFT JOIN public.editoras e ON e.id = l.id_editora
      ORDER BY l.titulo ASC
    `;

    const { rows } = await db.query(query);
    return (rows || []).map(normalizarLivroDoBanco);
  } catch (error) {
    console.error('❌ ERRO AO BUSCAR LIVROS:', error.message);
    return [];
  }
}

async function listarLivros() {
  const livros = await buscarLivrosDoBanco();
  return livros.sort((a, b) => a.titulo.localeCompare(b.titulo));
}

async function encontrarLivroPorId(id) {
  const numero = Number(id);

  if (db) {
    try {
      const { rows } = await db.query(`
        SELECT
          l.id,
          l.titulo,
          a.nome AS autor,
          e.nome AS editora,
          l.genero,
          l.url_capa,
          l.ano_publicacao,
          l.numero_paginas,
          l.idioma,
          l.resumo,
          l.disponivel
        FROM public.livros l
        LEFT JOIN public.autores a ON a.id = l.id_autor
        LEFT JOIN public.editoras e ON e.id = l.id_editora
        WHERE l.id = $1
        LIMIT 1
      `, [numero]);
      if (rows && rows.length > 0) {
        return normalizarLivroDoBanco(rows[0]);
      }
    } catch (error) {
      console.warn('Erro ao buscar livro por ID no banco.', error.message);
    }
  }

  return livrosBase.find((livro) => livro.id === numero) || null;
}

async function resolverOuCriarAutor(nome) {
  const valor = String(nome || '').trim();
  if (!valor) return null;
  if (!db) return valor;

  try {
    const { rows } = await db.query('SELECT id FROM public.autores WHERE LOWER(nome) = LOWER($1) LIMIT 1', [valor]);
    if (rows && rows.length > 0) return rows[0].id;

    const insert = await db.query(
      'INSERT INTO public.autores (nome) VALUES ($1) RETURNING id',
      [valor]
    );

    if (insert.rows && insert.rows.length > 0) {
      return insert.rows[0].id;
    }

    const fallback = await db.query('SELECT id FROM public.autores WHERE LOWER(nome) = LOWER($1) LIMIT 1', [valor]);
    return fallback.rows[0]?.id ?? null;
  } catch (error) {
    console.warn('Erro ao resolver autor do banco.', error.message);
    throw error;
  }
}

async function resolverOuCriarEditora(nome) {
  const valor = String(nome || '').trim();
  if (!valor) return null;
  if (!db) return valor;

  try {
    const { rows } = await db.query('SELECT id FROM public.editoras WHERE LOWER(nome) = LOWER($1) LIMIT 1', [valor]);
    if (rows && rows.length > 0) return rows[0].id;

    const insert = await db.query(
      'INSERT INTO public.editoras (nome) VALUES ($1) RETURNING id',
      [valor]
    );

    if (insert.rows && insert.rows.length > 0) {
      return insert.rows[0].id;
    }

    const fallback = await db.query('SELECT id FROM public.editoras WHERE LOWER(nome) = LOWER($1) LIMIT 1', [valor]);
    return fallback.rows[0]?.id ?? null;
  } catch (error) {
    console.warn('Erro ao resolver editora do banco.', error.message);
    throw error;
  }
}

async function salvarLivroNoBanco(dados) {
  if (!db) {
    return null;
  }

  try {
    const idAutor = await resolverOuCriarAutor(dados.autor);
    const idEditora = await resolverOuCriarEditora(dados.editora);

    const { rows } = await db.query(`
      INSERT INTO public.livros (titulo, id_autor, id_editora, genero, url_capa, ano_publicacao, numero_paginas, idioma, resumo, disponivel)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      dados.titulo,
      idAutor,
      idEditora,
      dados.genero,
      dados.url_capa,
      dados.ano_publicacao,
      dados.numero_paginas,
      dados.idioma,
      dados.resumo,
      dados.disponivel !== false
    ]);

    if (!rows || rows.length === 0) return null;

    return normalizarLivroDoBanco({ ...dados, id: rows[0].id });
  } catch (error) {
    console.warn('Erro ao gravar livro no banco.', error.message);
    throw error;
  }
}

function salvarLivro(livro) {
  const idx = livrosBase.findIndex((item) => item.id === livro.id);
  if (idx >= 0) {
    livrosBase[idx] = { ...livrosBase[idx], ...livro };
    return livrosBase[idx];
  }
  livrosBase.push(livro);
  return livro;
}

async function persistirLivroComDados(dados) {
  const payload = normalizarLivro(dados);
  if (!payload.titulo || !payload.autor) return null;
  if (!db) throw new Error('Supabase indispon\u00edvel; livro n\u00e3o foi salvo.');

  const livroNoBanco = await salvarLivroNoBanco(payload);
  if (!livroNoBanco) throw new Error('O Supabase n\u00e3o confirmou a grava\u00e7\u00e3o do livro.');
  return livroNoBanco;
}

function normalizarTituloBusca(titulo) {
  const normalizado = String(titulo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const artigoFinal = normalizado.match(/^(.+)\s+(a|as|o|os|um|uma)$/);
  return artigoFinal ? `${artigoFinal[2]} ${artigoFinal[1]}` : normalizado;
}

function limparAutorCatalogo(valor) {
  const autor = limparDescricaoLivro(valor);
  if (!autor || /[^\p{Script=Latin}\s.,'’\-()]/u.test(autor)) return '';
  if (/\b(?:translated by|translator|translation|tradutor(?:a)?|tradu[cç][aã]o|traducteur|übersetzer)\b/i.test(autor)) return '';
  return autor;
}

function limparEditoraCatalogo(valor) {
  const editora = limparDescricaoLivro(valor);
  if (!editora || editora.length > 120 || /[^\p{Script=Latin}\p{N}\s.,&'’\-()]/u.test(editora)) return '';
  if (/\b(?:translations? into|translated by|translation of|traduzido por|tradu[cç][aã]o para|translated from|translator)\b/i.test(editora)) return '';
  return editora;
}

function pontuarCorrespondenciaTitulo(consulta, tituloLivro) {
  const busca = normalizarTituloBusca(consulta);
  const titulo = normalizarTituloBusca(tituloLivro);
  if (!busca || !titulo) return 0;
  if (busca === titulo) return 1;

  const palavrasBusca = busca.split(' ').filter(Boolean);
  const palavrasTitulo = titulo.split(' ').filter(Boolean);
  if (palavrasBusca.length >= 2 && titulo.startsWith(`${busca} `)) return 0.96;
  if (palavrasTitulo.length >= 2 && busca.startsWith(`${titulo} `) && titulo.length / busca.length >= 0.65) return 0.9;

  const ignorar = new Set(['a', 'an', 'as', 'da', 'das', 'de', 'do', 'dos', 'e', 'o', 'os', 'the', 'um', 'uma']);
  const tokensBusca = [...new Set(palavrasBusca.filter((palavra) => !ignorar.has(palavra)))];
  const tokensTitulo = palavrasTitulo.filter((palavra) => !ignorar.has(palavra));
  if (tokensBusca.length < 2) return 0;

  let indiceAtual = -1;
  for (const palavra of tokensBusca) {
    indiceAtual = tokensTitulo.findIndex((token, indice) => indice > indiceAtual && token === palavra);
    if (indiceAtual === -1) return 0;
  }

  const extras = Math.max(0, tokensTitulo.length - tokensBusca.length);
  return extras <= 3 ? 0.86 - extras * 0.02 : 0;
}

function converterIdiomaLivro(codigo) {
  const idiomas = {
    de: 'Alemão', en: 'Inglês', es: 'Espanhol', fr: 'Francês', it: 'Italiano', ja: 'Japonês',
    ko: 'Coreano', pt: 'Português', ru: 'Russo', zh: 'Chinês',
    deu: 'Alemão', eng: 'Inglês', spa: 'Espanhol', fre: 'Francês', fra: 'Francês',
    ita: 'Italiano', jpn: 'Japonês', kor: 'Coreano', por: 'Português', rus: 'Russo', zho: 'Chinês'
  };
  const codigoNormalizado = String(codigo || '').trim().toLowerCase();
  return idiomas[codigoNormalizado] || codigoNormalizado;
}

function limparDescricaoLivro(descricao) {
  const texto = Array.isArray(descricao)
    ? descricao.join(' ')
    : typeof descricao === 'string'
      ? descricao
      : descricao?.value || '';
  return String(texto)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const MODELOS_GEMINI = [...new Set([
  String(process.env.GEMINI_MODEL || '').trim(),
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
].filter(Boolean))];

async function gerarTextoGemini(prompt, options = {}) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return '';

  for (const modelo of MODELOS_GEMINI) {
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: 'minimal' },
            maxOutputTokens: options.maxOutputTokens || 220,
            ...(options.json ? { responseMimeType: 'application/json' } : {})
          }
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        console.warn(`Gemini ${modelo} indisponível ao preencher dados do livro (HTTP ${response.status}).`);
        continue;
      }

      const data = await response.json();
      const texto = (data.candidates?.[0]?.content?.parts || [])
        .map((part) => part.text || '')
        .join(' ')
        .trim();
      if (texto) return texto;
      console.warn(`Gemini ${modelo} retornou uma resposta vazia ao preencher dados do livro.`);
    } catch (error) {
      console.warn(`Gemini ${modelo} indisponível ao preencher dados do livro:`, error.message);
    }
  }
  return '';
}

async function buscarTitulosAlternativosIA(titulo) {
  const normalizado = normalizarTituloBusca(titulo);
  const titulosConhecidos = new Map([
    ['dom quixote', ['Don Quixote', 'Don Quijote']],
    ['o senhor dos aneis', ['The Lord of the Rings']],
    ['orgulho e preconceito', ['Pride and Prejudice']],
    ['o pequeno principe', ['The Little Prince', 'Le Petit Prince']],
    ['cem anos de solidao', ['One Hundred Years of Solitude', 'Cien años de soledad']],
    ['o apanhador no campo de centeio', ['The Catcher in the Rye']],
    ['harry potter e a pedra filosofal', ["Harry Potter and the Philosopher's Stone", "Harry Potter and the Sorcerer's Stone"]],
    ['o alquimista', ['The Alchemist (novel)', 'The Alchemist', 'O Alquimista (romance)']],
    ['crime e castigo', ['Crime and Punishment', 'Crime et Châtiment']]
  ]);
  const alternativasConhecidas = titulosConhecidos.get(normalizado) || [];
  if (/^diario de um banana(?: (?:1|volume 1|primeiro))?$/.test(normalizado)) {
    return ['Diary of a Wimpy Kid', ...alternativasConhecidas];
  }
  if (alternativasConhecidas.length) return alternativasConhecidas;

  if (!process.env.GEMINI_API_KEY) return alternativasConhecidas;

  const prompt = 'Converta o t\u00edtulo de livro informado para o t\u00edtulo original mais prov\u00e1vel usado em cat\u00e1logos internacionais. N\u00e3o invente autor, editora, ano ou outros dados. Preserve o volume quando fizer parte do t\u00edtulo. Responda somente JSON no formato {"titulos":["t\u00edtulo original", "outra variante conhecida"]}. Se n\u00e3o houver tradu\u00e7\u00e3o segura, retorne {"titulos":[]}. T\u00edtulo informado: ' + JSON.stringify(titulo);
  const resposta = await gerarTextoGemini(prompt, { json: true, maxOutputTokens: 120 });

  try {
    const json = JSON.parse(resposta);
    const titulos = Array.isArray(json.titulos) ? json.titulos : [];
    return [...new Set([...alternativasConhecidas, ...titulos])]
      .map((item) => String(item || '').trim())
      .filter((item) => item && item.length <= 160 && normalizarTituloBusca(item) !== normalizado)
      .slice(0, 5);
  } catch {
    return alternativasConhecidas;
  }
}

function obterAutorConhecidoDoLivro(titulo) {
  const autores = new Map([
    ['harry potter e a pedra filosofal', 'J K Rowling'],
    ['harry potter and the philosophers stone', 'J K Rowling'],
    ['harry potter and the sorcerers stone', 'J K Rowling'],
    ['o alquimista', 'Paulo Coelho'],
    ['the alchemist', 'Paulo Coelho'],
    ['the alchemist novel', 'Paulo Coelho'],
    ['o alquimista romance', 'Paulo Coelho'],
    ['orgulho e preconceito', 'Jane Austen'],
    ['pride and prejudice', 'Jane Austen'],
    ['crime e castigo', 'Fiódor Dostoiévski'],
    ['crime and punishment', 'Fiódor Dostoiévski']
  ]);
  return autores.get(normalizarTituloBusca(titulo)) || '';
}

async function traduzirResumoCatalogo(titulo, autor, descricao, idiomaOrigem = '') {
  const descricoes = (Array.isArray(descricao) ? descricao : [{ texto: descricao, idioma: idiomaOrigem }])
    .map((item) => ({
      texto: limparDescricaoLivro(item.texto ?? item.resumo ?? ''),
      idioma: String(item.idioma || ''),
      fonte: String(item.fonte || 'catálogo')
    }))
    .filter((item) => item.texto && normalizarTituloBusca(item.texto) !== normalizarTituloBusca(titulo))
    .filter((item, indice, lista) => lista.findIndex((outro) => normalizarTituloBusca(outro.texto) === normalizarTituloBusca(item.texto)) === indice)
    .sort((a, b) => {
      const aPortugues = /^(pt|portugu)/i.test(a.idioma);
      const bPortugues = /^(pt|portugu)/i.test(b.idioma);
      if (aPortugues !== bPortugues) return aPortugues ? -1 : 1;
      return b.texto.length - a.texto.length;
    })
    .slice(0, 4);
  if (!descricoes.length) return '';

  const descricaoPortugues = descricoes.find((item) => /^(pt|portugu)/i.test(item.idioma) && item.texto.length >= 50);
  if (descricaoPortugues && descricaoPortugues.texto.length <= 900) return descricaoPortugues.texto;

  const texto = descricoes[0].texto;
  const materialFontes = descricoes
    .map((item, indice) => `Fonte ${indice + 1} (${item.fonte}): ${item.texto.slice(0, 3000)}`)
    .join('\n\n');
  const prompt = 'Escreva uma sinopse curta, em português do Brasil, para o livro identificado abaixo. Compare as descrições das fontes fornecidas. Use somente fatos que estejam explícitos em pelo menos uma delas; não invente personagens, acontecimentos ou detalhes. Se houver divergência, prefira a informação corroborada por mais fontes. Produza 2 ou 3 frases completas, não repita apenas o título e retorne somente a sinopse.\nTítulo: ' + titulo + '\nAutor: ' + (autor || 'não informado') + '\nDescrições consultadas:\n' + materialFontes;
  const resposta = await gerarTextoGemini(prompt, { maxOutputTokens: 180 });
  const resumo = limparDescricaoLivro(resposta);
  if (
    resumo.length >= 50 &&
    normalizarTituloBusca(resumo) !== normalizarTituloBusca(titulo) &&
    pareceTextoPortugues(resumo)
  ) {
    return resumo;
  }
  return descricaoPortugues
    ? encurtarResumoCatalogo(descricaoPortugues.texto)
    : '';
}

function encurtarResumoCatalogo(texto) {
  const frases = String(texto || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const resumo = frases.slice(0, 3).join(' ').trim();
  if (resumo.length >= 50) return resumo;
  return `${String(texto || '').slice(0, 900).replace(/\s+\S*$/, '').trim()}…`;
}

function pareceTextoPortugues(texto) {
  const palavrasPortuguesas = String(texto || '').toLocaleLowerCase('pt-BR')
    .match(/\b(?:ao|aos|com|como|da|das|de|do|dos|entre|mas|nas|nos|para|pela|pelo|pelas|pelos|que|seus|suas|uma|umas|também|não|livro|história|personagem|romance|narrativa)\b/g) || [];
  return palavrasPortuguesas.length >= 3;
}

let googleBooksIndisponivelAte = 0;
let avisoLimiteGoogleBooksAtivo = false;

async function buscarDadosLivroGoogleBooks(titulo) {
  const texto = String(titulo || '').trim();
  if (!texto) {
    return null;
  }
  if (Date.now() < googleBooksIndisponivelAte) {
    throw new Error('Google Books temporariamente limitado; usando catálogo alternativo.');
  }

  try {
    const parametros = new URLSearchParams({
      q: texto,
      maxResults: '20',
      orderBy: 'relevance',
      printType: 'books',
      projection: 'full'
    });
    const url = `https://www.googleapis.com/books/v1/volumes?${parametros}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        googleBooksIndisponivelAte = Date.now() + (retryAfter > 0 ? retryAfter * 1000 : 60 * 1000);
      }
      throw new Error(`Google Books retornou HTTP ${response.status}.`);
    }
    avisoLimiteGoogleBooksAtivo = false;

    const data = await response.json();
    const item = (data.items || [])
      .map((volume) => {
        const info = volume.volumeInfo || {};
        const tituloCompleto = [info.title, info.subtitle].filter(Boolean).join(': ');
        return {
          volume,
          tituloCompleto,
          pontuacao: Math.max(
            pontuarCorrespondenciaTitulo(texto, info.title),
            pontuarCorrespondenciaTitulo(texto, tituloCompleto)
          )
        };
      })
      .filter((resultado) => resultado.pontuacao >= 0.84)
      .sort((a, b) => b.pontuacao - a.pontuacao)[0]?.volume;
    if (!item) return null;

    const volumeInfo = item.volumeInfo || {};
    const dataPublicacao = String(volumeInfo.publishedDate || '').match(/\b\d{4}\b/)?.[0];
    const imagens = volumeInfo.imageLinks || {};
    const urlCapa = imagens.extraLarge || imagens.large || imagens.medium || imagens.thumbnail || imagens.smallThumbnail || '';

    return {
      titulo: [volumeInfo.title, volumeInfo.subtitle].filter(Boolean).join(': ') || texto,
      autor: Array.isArray(volumeInfo.authors) ? volumeInfo.authors.join(', ') : '',
      editora: volumeInfo.publisher || '',
      genero: Array.isArray(volumeInfo.categories) ? volumeInfo.categories[0] || '' : '',
      ano_publicacao: dataPublicacao ? Number(dataPublicacao) : null,
      numero_paginas: Number.isInteger(Number(volumeInfo.pageCount)) && Number(volumeInfo.pageCount) > 0 ? Number(volumeInfo.pageCount) : null,
      idioma: converterIdiomaLivro(volumeInfo.language),
      idioma_resumo: converterIdiomaLivro(volumeInfo.language),
      resumo: limparDescricaoLivro(volumeInfo.description),
      url_capa: urlCapa.replace(/^http:/i, 'https:'),
      fonte_dados: 'Google Books',
      url_fonte: volumeInfo.infoLink || ''
    };
  } catch (error) {
    if (Date.now() < googleBooksIndisponivelAte) {
      if (!avisoLimiteGoogleBooksAtivo) {
        console.warn('Google Books atingiu o limite de consultas; novas buscas serão direcionadas ao Open Library temporariamente.');
        avisoLimiteGoogleBooksAtivo = true;
      }
    } else {
      console.warn('Erro ao consultar o catálogo Google Books:', error.message);
    }
    throw new Error('Não foi possível consultar o catálogo de livros agora. Tente novamente ou preencha os dados manualmente.');
  }
}

let ultimaBuscaOpenLibrary = 0;
const cacheBuscaLivros = new Map();
const VERSAO_CACHE_CATALOGO = 'v7';

function obterLivroEmCache(chave) {
  const item = cacheBuscaLivros.get(chave);
  if (!item) return { encontrado: false };
  if (Date.now() >= item.expiraEm) {
    cacheBuscaLivros.delete(chave);
    return { encontrado: false };
  }
  return { encontrado: true, dados: item.dados };
}

function guardarLivroEmCache(chave, dados) {
  const duracao = dados ? 6 * 60 * 60 * 1000 : 2 * 60 * 1000;
  cacheBuscaLivros.set(chave, { dados, expiraEm: Date.now() + duracao });
  if (cacheBuscaLivros.size > 1000) {
    const primeiraChave = cacheBuscaLivros.keys().next().value;
    if (primeiraChave) cacheBuscaLivros.delete(primeiraChave);
  }
}

async function buscarDadosWikipedia(titulo, idiomaWiki, titulosComparaveis = [titulo]) {
  try {
    const tituloDireto = String(titulo || '').trim().replace(/ /g, '_');
    const respostaDireta = await fetch(
      `https://${idiomaWiki}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(tituloDireto)}`,
      {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'BookHub/1.0 (book catalog lookup)' }
      }
    );
    if (respostaDireta.ok) {
      const paginaDireta = await respostaDireta.json();
      const score = Math.max(...titulosComparaveis.map((comparavel) =>
        pontuarCorrespondenciaTitulo(comparavel, paginaDireta.title)
      ));
      if (score >= 0.84 && paginaDireta.extract) {
        return {
          titulo,
          resumo: limparDescricaoLivro(paginaDireta.extract),
          idioma_resumo: idiomaWiki === 'pt' ? 'Português' : 'Inglês',
          genero: '',
          autor: '',
          editora: '',
          ano_publicacao: null,
          numero_paginas: null,
          idioma: '',
          url_capa: paginaDireta.thumbnail?.source || '',
          fonte_dados: `Wikipedia (${idiomaWiki.toUpperCase()})`,
          url_fonte: paginaDireta.content_urls?.desktop?.page || ''
        };
      }
    }
  } catch (error) {
    console.warn(`Consulta direta à Wikipedia ${idiomaWiki} indisponível para "${titulo}":`, error.message);
  }

  const parametros = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: titulo,
    gsrnamespace: '0',
    gsrlimit: '5',
    prop: 'extracts|pageimages|pageprops',
    exintro: '1',
    explaintext: '1',
    piprop: 'thumbnail',
    pithumbsize: '600',
    format: 'json',
    origin: '*'
  });
  const response = await fetch(`https://${idiomaWiki}.wikipedia.org/w/api.php?${parametros}`, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'BookHub/1.0 (book catalog lookup)' }
  });
  if (!response.ok) throw new Error(`Wikipedia ${idiomaWiki} retornou HTTP ${response.status}.`);

  const data = await response.json();
  const pagina = Object.values(data.query?.pages || {})
    .map(item => ({
      item,
      score: Math.max(...titulosComparaveis.map((comparavel) => pontuarCorrespondenciaTitulo(comparavel, item.title)))
    }))
    .filter(item => item.score >= 0.84)
    .sort((a, b) => b.score - a.score)[0]?.item;
  if (!pagina) return null;

  const dados = {
    titulo,
    resumo: limparDescricaoLivro(pagina.extract),
    idioma_resumo: idiomaWiki === 'pt' ? 'Português' : 'Inglês',
    genero: '',
    autor: '',
    editora: '',
    ano_publicacao: null,
    numero_paginas: null,
    idioma: '',
    url_capa: pagina.thumbnail?.source || '',
    fonte_dados: `Wikipedia (${idiomaWiki.toUpperCase()})`,
    url_fonte: `https://${idiomaWiki}.wikipedia.org/wiki/${encodeURIComponent(pagina.title.replace(/ /g, '_'))}`
  };

  const itemWikidata = pagina.pageprops?.wikibase_item;
  if (!itemWikidata) return dados;
  dados.fonte_dados = `${dados.fonte_dados} + Wikidata`;

  try {
    const wikidataParams = new URLSearchParams({
      action: 'wbgetentities',
      ids: itemWikidata,
      props: 'claims',
      format: 'json'
    });
    const wikidataResponse = await fetch(`https://www.wikidata.org/w/api.php?${wikidataParams}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'BookHub/1.0 (book catalog lookup)' }
    });
    if (!wikidataResponse.ok) return dados;

    const wikidata = await wikidataResponse.json();
    const claims = wikidata.entities?.[itemWikidata]?.claims || {};
    const propertyIds = [...new Set(['P50', 'P136', 'P123']
      .flatMap(property => (claims[property] || [])
        .map(claim => claim.mainsnak?.datavalue?.value?.id)
        .filter(Boolean)))];
    if (claims.P18?.[0]?.mainsnak?.datavalue?.value && !dados.url_capa) {
      dados.url_capa = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(claims.P18[0].mainsnak.datavalue.value)}`;
    }
    if (!propertyIds.length) return dados;

    const labelsParams = new URLSearchParams({
      action: 'wbgetentities',
      ids: propertyIds.join('|'),
      props: 'labels',
      languages: 'pt|en',
      format: 'json'
    });
    const labelsResponse = await fetch(`https://www.wikidata.org/w/api.php?${labelsParams}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'BookHub/1.0 (book catalog lookup)' }
    });
    if (!labelsResponse.ok) return dados;
    const labelsData = await labelsResponse.json();
    const labels = id => labelsData.entities?.[id]?.labels?.pt?.value
      || labelsData.entities?.[id]?.labels?.en?.value || '';
    dados.autor = (claims.P50 || [])
      .map(claim => limparAutorCatalogo(labels(claim.mainsnak?.datavalue?.value?.id)))
      .filter(Boolean)
      .join(', ');
    dados.genero = (claims.P136 || [])
      .map(claim => labels(claim.mainsnak?.datavalue?.value?.id))
      .filter(Boolean)
      .join(', ');
    dados.editora = (claims.P123 || [])
      .map(claim => limparEditoraCatalogo(labels(claim.mainsnak?.datavalue?.value?.id)))
      .filter(Boolean)
      .join(', ');
  } catch (error) {
    console.warn(`Wikidata indisponível para "${titulo}":`, error.message);
  }
  return dados;
}

async function buscarDadosInternetArchive(titulo) {
  const parametros = new URLSearchParams({
    q: `title:("${titulo}") AND mediatype:texts`,
    'fl[]': 'identifier,title,creator,publisher,year,subject,description,language',
    rows: '10',
    output: 'json'
  });
  const response = await fetch(`https://archive.org/advancedsearch.php?${parametros}`, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'BookHub/1.0 (book catalog; contact: support@bookhub.com)' }
  });
  if (!response.ok) throw new Error(`Internet Archive retornou HTTP ${response.status}.`);

  const data = await response.json();
  const registro = (data.response?.docs || [])
    .map(item => ({
      item,
      score: pontuarCorrespondenciaTitulo(titulo, item.title)
    }))
    .filter(item => item.score >= 0.84)
    .sort((a, b) => b.score - a.score)[0]?.item;
  if (!registro) return null;

  const assuntos = Array.isArray(registro.subject) ? registro.subject : [registro.subject].filter(Boolean);
  const description = Array.isArray(registro.description) ? registro.description[0] : registro.description;
  const idiomaFonte = Array.isArray(registro.language) ? registro.language[0] || '' : String(registro.language || '');
  return {
    titulo,
    autor: limparAutorCatalogo(Array.isArray(registro.creator) ? registro.creator.join(', ') : String(registro.creator || '')),
    editora: limparEditoraCatalogo(Array.isArray(registro.publisher) ? registro.publisher[0] || '' : String(registro.publisher || '')),
    genero: assuntos.slice(0, 5).join(', '),
    ano_publicacao: Number(String(registro.year || '').match(/\b\d{4}\b/)?.[0]) || null,
    numero_paginas: null,
    idioma: converterIdiomaLivro(idiomaFonte),
    idioma_resumo: converterIdiomaLivro(idiomaFonte),
    resumo: limparDescricaoLivro(description),
    url_capa: `https://archive.org/services/img/${encodeURIComponent(registro.identifier)}`,
    fonte_dados: 'Internet Archive',
    url_fonte: `https://archive.org/details/${encodeURIComponent(registro.identifier)}`
  };
}

function combinarFontesCatalogo(fontes, tituloSolicitado) {
  const prioridadeFonte = {
    'Google Books': 1,
    'Open Library': 2,
    'Wikipedia (PT)': 3,
    'Wikipedia (EN)': 4,
    'Internet Archive': 5
  };
  const fontesOrdenadas = [...fontes].sort((a, b) =>
    (prioridadeFonte[a.fonte_dados] || 99) - (prioridadeFonte[b.fonte_dados] || 99)
  );
  const dados = fontesOrdenadas.reduce((acumulado, fonte) => ({
    ...acumulado,
    ...Object.fromEntries(
      ['autor', 'editora', 'genero', 'ano_publicacao', 'numero_paginas', 'idioma', 'url_capa']
        .map((campo) => {
          const valor = campo === 'autor'
            ? limparAutorCatalogo(fonte[campo])
            : campo === 'editora'
              ? limparEditoraCatalogo(fonte[campo])
              : fonte[campo];
          return [campo, valor];
        })
        .filter(([campo, valor]) => !acumulado[campo] && valor)
    )
  }), {});
  const descricoes = fontesOrdenadas
    .filter(fonte => fonte.resumo && normalizarTituloBusca(fonte.resumo) !== normalizarTituloBusca(tituloSolicitado))
    .sort((a, b) => {
      const idiomaAPortugues = /^(pt|portugu)/i.test(a.idioma_resumo || '');
      const idiomaBPortugues = /^(pt|portugu)/i.test(b.idioma_resumo || '');
      if (idiomaAPortugues !== idiomaBPortugues) return idiomaAPortugues ? -1 : 1;
      return String(b.resumo).length - String(a.resumo).length;
    });
  const descricaoPreferida = descricoes[0];
  const fontesUsadas = [...new Set(fontesOrdenadas.map(fonte => fonte.fonte_dados).filter(Boolean))];
  return {
    titulo: tituloSolicitado,
    titulo_catalogo: fontesOrdenadas.find(fonte => fonte.titulo_catalogo)?.titulo_catalogo || tituloSolicitado,
    autor: dados.autor || '',
    editora: dados.editora || '',
    genero: dados.genero || '',
    ano_publicacao: dados.ano_publicacao || null,
    numero_paginas: dados.numero_paginas || null,
    idioma: dados.idioma || '',
    resumo: descricaoPreferida?.resumo || '',
    idioma_resumo: descricaoPreferida?.idioma_resumo || '',
    url_capa: dados.url_capa || '',
    fonte_dados: fontesUsadas.join(' + '),
    fontes: fontesOrdenadas.map(({ fonte_dados, url_fonte }) => ({ nome: fonte_dados, url: url_fonte || '' }))
  };
}

async function aguardarLimiteOpenLibrary() {
  const intervaloRestante = 1000 - (Date.now() - ultimaBuscaOpenLibrary);
  if (intervaloRestante > 0) {
    await new Promise((resolve) => setTimeout(resolve, intervaloRestante));
  }
  ultimaBuscaOpenLibrary = Date.now();
}

async function buscarDadosLivroOpenLibrary(titulo, tituloOriginal = titulo) {
  const texto = String(titulo || '').trim();

  const parametros = new URLSearchParams({
    q: texto,
    limit: '20',
    fields: 'key,title,subtitle,author_name,publisher,first_publish_year,number_of_pages_median,language,cover_i,subject,editions,editions.title,editions.publisher,editions.number_of_pages,editions.language,editions.cover_i'
  });
  let response;
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    await aguardarLimiteOpenLibrary();
    response = await fetch(`https://openlibrary.org/search.json?${parametros}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'BookHub/1.0 (catalog title lookup)' }
    });
    if (response.ok || (response.status !== 429 && response.status < 500) || tentativa === 2) break;
    const retryAfter = Number(response.headers.get('retry-after'));
    await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 1500 * (tentativa + 1)));
  }
  if (!response.ok) throw new Error(`Open Library retornou HTTP ${response.status}.`);

  const data = await response.json();
  const resultado = (data.docs || [])
    .map((registro) => {
      const tituloCompleto = [registro.title, registro.subtitle].filter(Boolean).join(': ');
      return {
        registro,
        pontuacao: Math.max(
          pontuarCorrespondenciaTitulo(texto, registro.title),
          pontuarCorrespondenciaTitulo(texto, tituloCompleto)
        )
      };
    })
    .filter((item) => item.pontuacao >= 0.84)
    .sort((a, b) => b.pontuacao - a.pontuacao)[0]?.registro;
  if (!resultado) return null;

  let edicoesDaObra = [];
  if (/^\/works\/OL\d+W$/.test(resultado.key || '')) {
    try {
      await aguardarLimiteOpenLibrary();
      const respostaEdicoes = await fetch(`https://openlibrary.org${resultado.key}/editions.json?limit=100`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'BookHub/1.0 (catalog title lookup)' }
      });
      if (respostaEdicoes.ok) {
        const dadosEdicoes = await respostaEdicoes.json();
        edicoesDaObra = Array.isArray(dadosEdicoes.entries) ? dadosEdicoes.entries : [];
      }
    } catch (error) {
      console.warn('EdiÃ§Ãµes do Open Library indisponÃ­veis:', error.message);
    }
  }

  const edicoesPortugues = edicoesDaObra.filter((item) =>
    (item.languages || []).some((idioma) => String(idioma.key || idioma).split('/').pop() === 'por')
  );
  const edicaoPortugues = edicoesPortugues
    .map((item) => ({
      item,
      pontuacao: Math.max(
        pontuarCorrespondenciaTitulo(tituloOriginal, item.title),
        pontuarCorrespondenciaTitulo(tituloOriginal, item.subtitle),
        ...((item.series || []).map((serie) => pontuarCorrespondenciaTitulo(tituloOriginal, serie)))
      )
    }))
    .sort((a, b) => b.pontuacao - a.pontuacao)[0]?.item;
  const edicaoCatalogo = resultado.editions?.docs?.find((item) =>
    pontuarCorrespondenciaTitulo(texto, [item.title, item.subtitle].filter(Boolean).join(': ')) >= 0.84
  ) || resultado.editions?.docs?.[0] || {};
  const edicao = edicaoPortugues || edicaoCatalogo;
  const coverId = edicao.covers?.[0] || edicao.cover_i || resultado.cover_i;
  const idiomaEdicao = edicao.languages?.[0];
  const idioma = typeof idiomaEdicao === 'string'
    ? idiomaEdicao
    : idiomaEdicao?.key?.split('/').pop() || edicao.language?.[0] || resultado.language?.[0] || '';
  let resumo = '';
  const numeroPaginas = Number(edicao.number_of_pages || resultado.number_of_pages_median);
  const editoras = edicao.publishers || edicao.publisher || resultado.publisher || [];

  if (!resumo && /^\/works\/OL\d+W$/.test(resultado.key || '')) {
    try {
      await aguardarLimiteOpenLibrary();
      const respostaObra = await fetch(`https://openlibrary.org${resultado.key}.json`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'BookHub/1.0 (catalog title lookup)' }
      });
      if (respostaObra.ok) {
        const obra = await respostaObra.json();
        resumo = limparDescricaoLivro(obra.description);
      }
    } catch (error) {
      console.warn('Descrição adicional do Open Library indisponível:', error.message);
    }
  }

  return {
    titulo: tituloOriginal,
    titulo_catalogo: edicao.full_title || edicao.title || [resultado.title, resultado.subtitle].filter(Boolean).join(': ') || texto,
    autor: limparAutorCatalogo(Array.isArray(resultado.author_name) ? resultado.author_name.join(', ') : ''),
    editora: limparEditoraCatalogo(Array.isArray(editoras) ? editoras[0] || '' : String(editoras || '')),
    genero: Array.isArray(resultado.subject) ? resultado.subject[0] || '' : '',
    ano_publicacao: Number(String(edicao.publish_date || '').match(/\b\d{4}\b/)?.[0]) || Number(resultado.first_publish_year) || null,
    numero_paginas: Number.isInteger(numeroPaginas) && numeroPaginas > 0 ? numeroPaginas : null,
    idioma: converterIdiomaLivro(idioma),
    idioma_resumo: '',
    resumo,
    url_capa: coverId ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(coverId)}-L.jpg?default=false` : '',
    fonte_dados: 'Open Library',
    url_fonte: resultado.key ? `https://openlibrary.org${resultado.key}` : ''
  };
}

async function gerarDadosLivroIA(titulo) {
  const texto = String(titulo || '').trim();
  if (!texto) throw new Error('Título obrigatório.');

  const chaveCache = `${VERSAO_CACHE_CATALOGO}:${normalizarTituloBusca(texto)}`;
  const cache = obterLivroEmCache(chaveCache);
  if (cache.encontrado) return cache.dados;

  const errosFonte = [];
  let fontesConsultadas = 0;
  const titulosAlternativos = await buscarTitulosAlternativosIA(texto);
  const variantes = [...new Set([texto, ...titulosAlternativos])];
  const tituloCatalogoAlternativo = titulosAlternativos[0] || texto;
  const autorConhecido = variantes.map(obterAutorConhecidoDoLivro).find(Boolean) || '';
  const fontes = [];

  const consultarGoogleBooks = async () => {
    if (Date.now() < googleBooksIndisponivelAte) return;
    for (const variante of variantes.slice(0, 3)) {
      try {
        const dados = await buscarDadosLivroGoogleBooks(variante);
        fontesConsultadas += 1;
        if (dados) {
          fontes.push({ ...dados, fonte_dados: 'Google Books' });
          if (dados.autor && dados.resumo && dados.genero && dados.url_capa) return;
        }
      } catch (error) {
        errosFonte.push(error);
        if (Date.now() < googleBooksIndisponivelAte) return;
      }
    }
  };

  const consultarOpenLibrary = async () => {
    for (const variante of variantes.slice(0, 3)) {
      try {
        const dados = await buscarDadosLivroOpenLibrary(variante, texto);
        fontesConsultadas += 1;
        if (dados) {
          fontes.push(dados);
          if (dados.autor && dados.editora && dados.resumo && dados.genero && dados.url_capa) return;
        }
      } catch (error) {
        errosFonte.push(error);
        console.warn(`Open Library indisponível para "${variante}":`, error.message);
      }
    }
  };

  const consultarWikipedia = async (idioma, variante) => {
    try {
      const dados = await buscarDadosWikipedia(variante, idioma, variantes);
      fontesConsultadas += 1;
      if (dados && autorConhecido &&
        !normalizarTituloBusca(dados.resumo).includes(normalizarTituloBusca(autorConhecido))) {
        return;
      }
      if (dados && !fontes.some((fonte) => fonte.url_fonte === dados.url_fonte)) fontes.push(dados);
    } catch (error) {
      errosFonte.push(error);
      console.warn(`Wikipedia ${idioma} indisponível para "${variante}":`, error.message);
    }
  };

  const consultarInternetArchive = async () => {
    for (const variante of variantes.slice(0, 2)) {
      try {
        const dados = await buscarDadosInternetArchive(variante);
        fontesConsultadas += 1;
        if (dados) {
          fontes.push(dados);
          if (dados.autor && dados.editora && dados.resumo && dados.genero) return;
        }
      } catch (error) {
        errosFonte.push(error);
        console.warn(`Internet Archive indisponível para "${variante}":`, error.message);
      }
    }
  };

  await Promise.allSettled([
    consultarGoogleBooks(),
    consultarOpenLibrary(),
    consultarWikipedia('pt', texto),
    consultarWikipedia('en', tituloCatalogoAlternativo),
    consultarInternetArchive()
  ]);

  if (fontes.length) {
    let dadosCombinados = combinarFontesCatalogo(fontes, texto);
    if (autorConhecido) dadosCombinados.autor = autorConhecido;
    const descricoesEncontradas = fontes
      .filter((fonte) => fonte.resumo)
      .map((fonte) => ({
        texto: fonte.resumo,
        idioma: fonte.idioma_resumo,
        fonte: fonte.fonte_dados
      }));
    dadosCombinados.resumo = await traduzirResumoCatalogo(
      texto,
      dadosCombinados.autor,
      descricoesEncontradas
    );
    dadosCombinados.idioma_resumo = dadosCombinados.resumo ? 'Português' : '';
    dadosCombinados.campos_ausentes = [
      !dadosCombinados.autor && 'autor',
      !dadosCombinados.editora && 'editora',
      !dadosCombinados.genero && 'gênero',
      !dadosCombinados.idioma && 'idioma',
      !dadosCombinados.ano_publicacao && 'ano',
      !dadosCombinados.numero_paginas && 'páginas',
      !dadosCombinados.resumo && 'resumo',
      !dadosCombinados.url_capa && 'capa'
    ].filter(Boolean);
    guardarLivroEmCache(chaveCache, dadosCombinados);
    return dadosCombinados;
  }

  if (fontesConsultadas === 0 && errosFonte.length) {
    throw new Error('Não foi possível confirmar o livro nas fontes de catálogo agora. Tente novamente ou preencha os dados manualmente.');
  }

  guardarLivroEmCache(chaveCache, null);
  return null;
}

app.use(express.static(path.join(projectRoot, 'pagina_inicial/html')));
app.use('/css', express.static(path.join(projectRoot, 'pagina_inicial/css')));
app.use('/java', express.static(path.join(projectRoot, 'pagina_inicial/java')));
app.use('/img', express.static(path.join(projectRoot, 'img')));

app.use('/login', express.static(path.join(projectRoot, 'pagina_login/html')));
app.use('/login/css', express.static(path.join(projectRoot, 'pagina_login/css')));
app.use('/login/js', express.static(path.join(projectRoot, 'pagina_login/js')));

app.use('/perfil', express.static(path.join(projectRoot, 'pagina_perfil/html')));
app.use('/perfil/css', express.static(path.join(projectRoot, 'pagina_perfil/css')));
app.use('/perfil/js', express.static(path.join(projectRoot, 'pagina_perfil/js')));

app.use('/admin', express.static(path.join(projectRoot, 'pagina_administrativa/html')));
app.use('/admin/css', express.static(path.join(projectRoot, 'pagina_administrativa/css')));
app.use('/admin/java', express.static(path.join(projectRoot, 'pagina_administrativa/java')));

app.get('/admin', (req, res) => res.redirect('/admin/livros.html'));
app.get('/admin/', (req, res) => res.redirect('/admin/livros.html'));

app.use('/ranking', express.static(path.join(projectRoot, 'pagina_ranking')));
app.use('/ranking/css', express.static(path.join(projectRoot, 'pagina_ranking/css')));
app.use('/ranking/js', express.static(path.join(projectRoot, 'pagina_ranking/js')));

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/ranking', (req, res) => res.redirect('/ranking/html/ranking.html'));
app.get('/ranking/html/ranking.html', (req, res) => res.sendFile(path.join(projectRoot, 'pagina_ranking', 'html', 'ranking.html')));
app.get('/ranking/css/ranking.css', (req, res) => res.sendFile(path.join(projectRoot, 'pagina_ranking', 'css', 'ranking.css')));
app.get('/ranking/js/ranking.js', (req, res) => res.sendFile(path.join(projectRoot, 'pagina_ranking', 'js', 'ranking.js')));

app.get('/api/livros', async (req, res) => {
  const livros = await listarLivros();
  res.json(livros);
});

app.get('/api/livros/:id', async (req, res) => {
  const livro = await encontrarLivroPorId(req.params.id);
  if (!livro) return res.status(404).json({ erro: 'Livro não encontrado.' });
  res.json(livro);
});

app.post('/api/livros', async (req, res) => {
  const corpo = req.body || {};
  if (!String(corpo.titulo || '').trim() || !String(corpo.autor || '').trim()) {
    return res.status(400).json({ erro: 'Titulo e autor sao obrigatorios.' });
  }
  if (!db) {
    return res.status(503).json({ erro: 'Supabase indisponivel; o livro nao foi salvo.' });
  }

  try {
    const dados = normalizarLivro(corpo);
    const livroCriado = await persistirLivroComDados(dados);
    if (!livroCriado) {
      return res.status(500).json({ erro: 'O Supabase nao confirmou a gravacao do livro.' });
    }
    return res.status(201).json(livroCriado);
  } catch (error) {
    console.error('Erro ao salvar livro no Supabase:', error.message);
    return res.status(500).json({ erro: error.message || 'Nao foi possivel salvar o livro no Supabase.' });
  }
});

app.post('/api/livros/lote', async (req, res) => {
  const livros = req.body?.livros;
  if (!Array.isArray(livros) || livros.length === 0) {
    return res.status(400).json({ erro: 'Informe os livros revisados para salvar.' });
  }
  if (livros.length > 30) {
    return res.status(400).json({ erro: 'Salve até 30 livros por vez.' });
  }
  if (!db) return res.status(503).json({ erro: 'Supabase indisponível; os livros não foram salvos.' });

  const resultados = new Array(livros.length);
  let proximoIndice = 0;
  const salvarProximo = async () => {
    while (proximoIndice < livros.length) {
      const indice = proximoIndice++;
      try {
        const livro = livros[indice] || {};
        if (!String(livro.titulo || '').trim() || !String(livro.autor || '').trim() ||
          !String(livro.editora || '').trim() || !String(livro.resumo || '').trim()) {
          throw new Error('Título, autor, editora e resumo são obrigatórios.');
        }
        const dados = normalizarLivro(livro);
        const salvo = await persistirLivroComDados(dados);
        if (!salvo) throw new Error('O banco não confirmou a gravação deste livro.');
        resultados[indice] = { ok: true, indice, livro: salvo };
      } catch (error) {
        resultados[indice] = {
          ok: false,
          indice,
          titulo: String(livros[indice]?.titulo || 'Livro sem título'),
          erro: error.message || 'Falha ao salvar este livro.'
        };
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(4, livros.length) }, salvarProximo));
    return res.json({
      ok: resultados.every((resultado) => resultado.ok),
      salvos: resultados.filter((resultado) => resultado.ok)
        .map((resultado) => ({ ...resultado.livro, indice: resultado.indice })),
      falhas: resultados.filter((resultado) => !resultado.ok)
    });
  } catch (error) {
    console.error('Erro inesperado ao salvar livros em lote:', error.message);
    return res.status(500).json({ erro: 'Não foi possível concluir o salvamento em lote.' });
  }
});

app.put('/api/livros/:id', async (req, res) => {
  if (!db) {
    return res.status(503).json({ erro: 'Supabase indisponivel; a alteracao nao foi salva.' });
  }

  try {
    const livroAtual = await encontrarLivroPorId(req.params.id);
    if (!livroAtual) {
      return res.status(404).json({ erro: 'Livro nao encontrado.' });
    }

    const dados = normalizarLivro({ ...livroAtual, ...req.body, id: livroAtual.id });
    const idAutor = await resolverOuCriarAutor(dados.autor);
    const idEditora = await resolverOuCriarEditora(dados.editora);
    const { rows } = await db.query('UPDATE public.livros SET titulo = $1, id_autor = $2, id_editora = $3, genero = $4, url_capa = $5, ano_publicacao = $6, numero_paginas = $7, idioma = $8, resumo = $9, disponivel = $10 WHERE id = $11 RETURNING *', [dados.titulo, idAutor, idEditora, dados.genero, dados.url_capa, dados.ano_publicacao, dados.numero_paginas, dados.idioma, dados.resumo, dados.disponivel !== false, livroAtual.id]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ erro: 'Livro nao encontrado para atualizar.' });
    }

    return res.json(normalizarLivroDoBanco({ ...dados, id: rows[0].id }));
  } catch (error) {
    console.error('Erro ao atualizar livro no Supabase:', error.message);
    return res.status(500).json({ erro: error.message || 'Nao foi possivel atualizar o livro no Supabase.' });
  }
});

app.delete('/api/livros/:id', async (req, res) => {
  if (db) {
    try {
      const { rows } = await db.query('DELETE FROM public.livros WHERE id = $1 RETURNING id', [Number(req.params.id)]);
      if (!rows?.length) return res.status(404).json({ erro: 'Livro não encontrado.' });
      return res.json({ ok: true, id: rows[0].id });
    } catch (error) {
      console.error('Erro ao deletar livro no banco:', error.message);
      return res.status(500).json({ erro: 'Não foi possível excluir o livro do banco de dados.' });
    }
  }

  const index = livrosBase.findIndex((livro) => livro.id === Number(req.params.id));
  if (index === -1) {
    return res.status(404).json({ erro: 'Livro não encontrado.' });
  }

  const removido = livrosBase.splice(index, 1)[0];
  return res.json({ ok: true, removido });
});

app.post('/api/auth/email/send-code', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  }
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });
  if (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM || !process.env.AUTH_TOKEN_SECRET) {
    return res.status(503).json({ erro: 'O envio de e-mail ainda não foi configurado pelo administrador.' });
  }

  try {
    const { rows: recentCodes } = await db.query(
      'SELECT created_at FROM public.email_verification_codes WHERE email = $1 AND created_at > NOW() - INTERVAL \'60 seconds\'',
      [email]
    );
    if (recentCodes.length) {
      return res.status(429).json({ erro: 'Aguarde 60 segundos antes de solicitar outro código.' });
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM,
        to: [email],
        subject: 'Seu código de acesso ao BookHub',
        text: `Seu código de verificação BookHub é ${code}. Ele expira em 10 minutos.`,
        html: `<p>Use este código para entrar no BookHub:</p><p style="font-size:28px;font-weight:bold;letter-spacing:8px">${code}</p><p>O código expira em 10 minutos. Se você não solicitou, ignore este e-mail.</p>`
      })
    });
    if (!response.ok) {
      const providerError = await response.text();
      console.error('Falha ao enviar código de autenticação:', response.status, providerError);
      return res.status(502).json({ erro: 'Não foi possível enviar o e-mail. Tente novamente mais tarde.' });
    }

    await db.query(
      `INSERT INTO public.email_verification_codes (email, code_hash, expires_at, attempts, created_at, verified_at, verification_ticket_hash)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 0, NOW(), NULL, NULL)
       ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at,
         attempts = 0, created_at = NOW(), verified_at = NULL, verification_ticket_hash = NULL`,
      [email, hashEmailCode(email, code)]
    );
    return res.json({ ok: true, mensagem: 'Código enviado. Verifique sua caixa de entrada.' });
  } catch (error) {
    console.error('Erro ao solicitar código de e-mail:', error);
    return res.status(500).json({ erro: 'Erro interno ao enviar o código.' });
  }
});

app.post('/api/auth/email/verify-code', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ erro: 'Informe o e-mail e o código de 6 dígitos.' });
  }
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });
  if (!process.env.AUTH_TOKEN_SECRET) {
    return res.status(503).json({ erro: 'A autenticação por e-mail ainda não foi configurada pelo administrador.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT * FROM public.email_verification_codes WHERE email = $1 FOR UPDATE',
      [email]
    );
    const verification = rows[0];
    if (!verification || !verification.code_hash || new Date(verification.expires_at) <= new Date()) {
      await client.query('DELETE FROM public.email_verification_codes WHERE email = $1', [email]);
      await client.query('COMMIT');
      return res.status(400).json({ erro: 'Código expirado ou inexistente. Solicite um novo código.' });
    }
    if (verification.attempts >= 5) {
      await client.query('COMMIT');
      return res.status(429).json({ erro: 'Limite de tentativas atingido. Solicite um novo código.' });
    }
    if (hashEmailCode(email, code) !== verification.code_hash) {
      await client.query(
        'UPDATE public.email_verification_codes SET attempts = attempts + 1 WHERE email = $1',
        [email]
      );
      await client.query('COMMIT');
      return res.status(400).json({ erro: 'Código incorreto.' });
    }

    const oauthTicket = String(req.body?.oauthTicket || '');
    if (oauthTicket) {
      const { rows: pendingOAuth } = await client.query(
        `SELECT provider_user_id FROM public.oauth_email_tickets
         WHERE token_hash = $1 AND expires_at > NOW() FOR UPDATE`,
        [hashAuthValue(oauthTicket)]
      );
      if (!pendingOAuth.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'A autenticação pelo X expirou. Entre novamente pelo X.' });
      }

      const providerUserId = pendingOAuth[0].provider_user_id;
      const { rows: linkedUsers } = await client.query(
        `SELECT u.* FROM public.oauth_accounts oa
         JOIN public.usuarios u ON u.id = oa.user_id
         WHERE oa.provider = 'x' AND oa.provider_user_id = $1 LIMIT 1`,
        [providerUserId]
      );
      const { rows: matchingUsers } = await client.query(
        'SELECT * FROM public.usuarios WHERE LOWER(email) = $1 LIMIT 1',
        [email]
      );
      const linkedUser = linkedUsers[0];
      const emailUser = matchingUsers[0];

      if (linkedUser && linkedUser.email && linkedUser.email.toLowerCase() !== email) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Este perfil do X já está vinculado a outro e-mail.' });
      }
      if (linkedUser && emailUser && linkedUser.id !== emailUser.id) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Este e-mail pertence a outra conta BookHub.' });
      }

      const usuario = linkedUser || emailUser;
      if (usuario) {
        if (!usuario.email) {
          const { rows: updatedUsers } = await client.query(
            'UPDATE public.usuarios SET email = $1 WHERE id = $2 RETURNING *',
            [email, usuario.id]
          );
          usuario.email = updatedUsers[0].email;
        }
        await client.query(
          `INSERT INTO public.oauth_accounts (provider, provider_user_id, user_id)
           VALUES ('x', $1, $2) ON CONFLICT (provider, provider_user_id) DO NOTHING`,
          [providerUserId, usuario.id]
        );
        await registrarIdentidadeAutenticacao(client, {
          userId: usuario.id,
          method: 'x',
          providerUserId
        });
        await registrarIdentidadeAutenticacao(client, {
          userId: usuario.id,
          method: 'email',
          providerUserId: email
        });
        await client.query('DELETE FROM public.email_verification_codes WHERE email = $1', [email]);
        await client.query('DELETE FROM public.oauth_email_tickets WHERE token_hash = $1', [hashAuthValue(oauthTicket)]);
        await client.query('COMMIT');
        await criarSessaoAutenticada(res, usuario.id);
        return res.json({ ok: true, usuario: montarUsuarioPublico(usuario) });
      }

      const verificationTicket = criarTokenSeguro();
      await client.query(
        `UPDATE public.email_verification_codes SET code_hash = NULL, verified_at = NOW(),
         verification_ticket_hash = $2, expires_at = NOW() + INTERVAL '10 minutes' WHERE email = $1`,
        [email, hashAuthValue(verificationTicket)]
      );
      await client.query('COMMIT');
      return res.json({ ok: true, novoUsuario: true, verificationTicket, oauthTicket });
    }

    const { rows: users } = await client.query(
      'SELECT * FROM public.usuarios WHERE LOWER(email) = $1 LIMIT 1',
      [email]
    );
    if (users.length) {
      await registrarIdentidadeAutenticacao(client, {
        userId: users[0].id,
        method: 'email',
        providerUserId: email
      });
      await client.query('DELETE FROM public.email_verification_codes WHERE email = $1', [email]);
      await client.query('COMMIT');
      await criarSessaoAutenticada(res, users[0].id);
      return res.json({ ok: true, usuario: montarUsuarioPublico(users[0]) });
    }

    const verificationTicket = criarTokenSeguro();
    await client.query(
      `UPDATE public.email_verification_codes SET code_hash = NULL, verified_at = NOW(),
       verification_ticket_hash = $2, expires_at = NOW() + INTERVAL '10 minutes' WHERE email = $1`,
      [email, hashAuthValue(verificationTicket)]
    );
    await client.query('COMMIT');
    return res.json({ ok: true, novoUsuario: true, verificationTicket });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao validar código de e-mail:', error);
    return res.status(500).json({ erro: 'Erro interno ao verificar o código.' });
  } finally {
    client.release();
  }
});

app.post('/api/auth/wallet/challenge', async (req, res) => {
  const wallet = normalizarWallet(req.body?.wallet);
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ erro: 'Endereço de carteira inválido.' });
  }
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });

  const nonce = criarTokenSeguro(24);
  const issuedAt = new Date().toISOString();
  const message = `BookHub - Autenticação de carteira\n\nCarteira: ${wallet}\nNonce: ${nonce}\nEmitido em: ${issuedAt}\nEsta assinatura não realiza uma transação.`;
  try {
    await db.query(
      `INSERT INTO public.wallet_login_challenges (wallet, message, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
       ON CONFLICT (wallet) DO UPDATE SET message = EXCLUDED.message, expires_at = EXCLUDED.expires_at`,
      [wallet, message]
    );
    return res.json({ ok: true, message });
  } catch (error) {
    console.error('Erro ao criar desafio MetaMask:', error);
    return res.status(500).json({ erro: 'Não foi possível iniciar o acesso pela carteira.' });
  }
});

app.post('/api/auth/wallet/verify', async (req, res) => {
  const wallet = normalizarWallet(req.body?.wallet);
  const message = String(req.body?.message || '');
  const signature = String(req.body?.signature || '');
  if (!/^0x[a-f0-9]{40}$/.test(wallet) || !message || !/^0x[a-fA-F0-9]{130}$/.test(signature)) {
    return res.status(400).json({ erro: 'Assinatura ou endereço de carteira inválido.' });
  }
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: challenges } = await client.query(
      'SELECT message FROM public.wallet_login_challenges WHERE wallet = $1 AND expires_at > NOW() FOR UPDATE',
      [wallet]
    );
    if (!challenges.length || challenges[0].message !== message) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Desafio expirado ou inválido. Tente novamente.' });
    }

    let recoveredWallet;
    try {
      recoveredWallet = verifyMessage(message, signature).toLowerCase();
    } catch {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'A assinatura da carteira não é válida.' });
    }
    if (recoveredWallet !== wallet) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'A carteira assinada não corresponde à carteira conectada.' });
    }

    const { rows: users } = await client.query(
      `SELECT u.* FROM public.usuarios u
       LEFT JOIN public.auth_identities ai
         ON ai.user_id = u.id AND ai.method = 'metamask' AND ai.provider_user_id = $1
       WHERE ai.id IS NOT NULL OR LOWER(u.login) = $1 OR LOWER(u.wallet) = $1 OR LOWER(u.wallet_address) = $1
       LIMIT 1`,
      [wallet]
    );
    await client.query('DELETE FROM public.wallet_login_challenges WHERE wallet = $1', [wallet]);
    if (users.length) {
      await registrarIdentidadeAutenticacao(client, {
        userId: users[0].id,
        method: 'metamask',
        providerUserId: wallet
      });
    }
    const walletTicket = users.length ? null : criarTokenSeguro();
    if (walletTicket) {
      await client.query(
        `INSERT INTO public.wallet_auth_tickets (token_hash, wallet, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
        [hashAuthValue(walletTicket), wallet]
      );
    }
    await client.query('COMMIT');
    if (users.length) {
      await criarSessaoAutenticada(res, users[0].id);
      return res.json({ ok: true, usuario: montarUsuarioPublico(users[0]) });
    }
    return res.json({ ok: true, novoUsuario: true, wallet, walletTicket });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao validar assinatura MetaMask:', error);
    return res.status(500).json({ erro: 'Erro interno ao validar a carteira.' });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const wallet = normalizarWallet(req.body?.wallet || req.body?.walletAddress || req.body?.wallet_address);

  if (!wallet) {
    return res.status(400).json({ erro: 'Carteira obrigatória.' });
  }

  try {
    if (db) {
      // Ajustado para usar a coluna 'login' que é a identificadora no seu banco
      const { rows } = await db.query('SELECT * FROM public.usuarios WHERE LOWER(login) = LOWER($1) LIMIT 1', [wallet]);
      if (rows && rows.length > 0) {
        return res.json({ usuario: montarUsuarioPublico(rows[0]), ok: true });
      }
    }
    return res.json({ novoUsuario: true, mensagem: 'Usuário ainda não cadastrado.' });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ erro: 'Erro interno ao processar login.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const payload = req.body || {};
  const wallet = normalizarWallet(payload.wallet || payload.walletAddress || payload.wallet_address);
  const email = String(payload.email || '').trim().toLowerCase();
  const nome = String(payload.nome || '').trim();
  const username = String(payload.username || '').trim();
  const verificationTicket = String(payload.verificationTicket || '');
  const walletTicket = String(payload.walletTicket || '');
  const oauthTicket = String(payload.oauthTicket || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nome || !username || !verificationTicket) {
    return res.status(400).json({ erro: 'Dados incompletos para cadastro.' });
  }
  if (nome.length > 100 || username.length > 40) {
    return res.status(400).json({ erro: 'Nome ou nome de usuário muito longo.' });
  }
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: verified } = await client.query(
      `SELECT email FROM public.email_verification_codes
       WHERE email = $1 AND verification_ticket_hash = $2 AND verified_at IS NOT NULL
         AND expires_at > NOW() FOR UPDATE`,
      [email, hashAuthValue(verificationTicket)]
    );
    if (!verified.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Verifique seu e-mail novamente antes de criar a conta.' });
    }
    if (wallet && !walletTicket) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Reconecte a MetaMask para confirmar a carteira antes de vinculá-la.' });
    }

    const { rows: existingEmail } = await client.query(
      'SELECT id FROM public.usuarios WHERE LOWER(email) = $1 LIMIT 1',
      [email]
    );
    if (existingEmail.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Este e-mail já possui uma conta. Entre usando o código enviado.' });
    }
    if (wallet) {
      const { rows: validWalletTicket } = await client.query(
        `SELECT wallet FROM public.wallet_auth_tickets
         WHERE token_hash = $1 AND wallet = $2 AND expires_at > NOW()
           AND consumed_at IS NULL FOR UPDATE`,
        [hashAuthValue(walletTicket), wallet]
      );
      if (!validWalletTicket.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'A confirmação da carteira expirou. Reconecte a MetaMask e tente novamente.' });
      }

      const { rows: existingWallet } = await client.query(
        `SELECT u.id FROM public.usuarios u
         LEFT JOIN public.auth_identities ai
           ON ai.user_id = u.id AND ai.method = 'metamask' AND ai.provider_user_id = $1
         WHERE ai.id IS NOT NULL OR LOWER(u.login) = LOWER($1)
           OR LOWER(u.wallet) = LOWER($1) OR LOWER(u.wallet_address) = LOWER($1)
         LIMIT 1`,
        [wallet]
      );
      if (existingWallet.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Esta carteira já está vinculada a uma conta.' });
      }
    }

    let pendingOAuthUserId = '';
    if (oauthTicket) {
      const { rows: pendingOAuth } = await client.query(
        `SELECT provider_user_id FROM public.oauth_email_tickets
         WHERE token_hash = $1 AND expires_at > NOW() FOR UPDATE`,
        [hashAuthValue(oauthTicket)]
      );
      if (!pendingOAuth.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'A autenticação pelo X expirou. Entre novamente pelo X.' });
      }
      pendingOAuthUserId = pendingOAuth[0].provider_user_id;
      const { rows: linkedOAuth } = await client.query(
        `SELECT user_id FROM public.oauth_accounts
         WHERE provider = 'x' AND provider_user_id = $1 LIMIT 1`,
        [pendingOAuthUserId]
      );
      if (linkedOAuth.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Esta conta do X já está vinculada. Entre novamente pelo X e confirme o e-mail associado.' });
      }
    }

    const allowedAvatars = new Set(['/img/avatar1.png', '/img/avatar2.png', '/img/avatar3.png', '/img/avatar4.png', '/img/avatar5.png']);
    const avatar = allowedAvatars.has(payload.avatar) ? payload.avatar : '/img/avatar1.png';
    const { rows: created } = await client.query(
      `INSERT INTO public.usuarios (nome, username, email, senha, login, avatar, tipo)
       VALUES ($1, $2, $3, '', $4, $5, $6) RETURNING *`,
      [nome, username, email, wallet || email, avatar, 'aluno']
    );
    await registrarIdentidadeAutenticacao(client, {
      userId: created[0].id,
      method: 'email',
      providerUserId: email
    });
    if (wallet) {
      await registrarIdentidadeAutenticacao(client, {
        userId: created[0].id,
        method: 'metamask',
        providerUserId: wallet
      });
      await client.query(
        'DELETE FROM public.wallet_auth_tickets WHERE token_hash = $1',
        [hashAuthValue(walletTicket)]
      );
    }
    if (pendingOAuthUserId) {
      await client.query(
        `INSERT INTO public.oauth_accounts (provider, provider_user_id, user_id)
         VALUES ('x', $1, $2)`,
        [pendingOAuthUserId, created[0].id]
      );
      await registrarIdentidadeAutenticacao(client, {
        userId: created[0].id,
        method: 'x',
        providerUserId: pendingOAuthUserId
      });
      await client.query(
        'DELETE FROM public.oauth_email_tickets WHERE token_hash = $1',
        [hashAuthValue(oauthTicket)]
      );
    }
    await client.query('DELETE FROM public.email_verification_codes WHERE email = $1', [email]);
    await client.query('COMMIT');
    await criarSessaoAutenticada(res, created[0].id);
    return res.status(201).json({ usuario: montarUsuarioPublico(created[0]), ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro no registro:', error);
    return res.status(500).json({ erro: 'Erro interno ao cadastrar usuário.' });
  } finally {
    client.release();
  }
});

function oauthProviderConfig(provider) {
  const baseUrl = String(process.env.AUTH_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
  if (provider === 'google') {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`
    };
  }
  return {
    clientId: process.env.X_CLIENT_ID,
    clientSecret: process.env.X_CLIENT_SECRET,
    callbackUrl: process.env.X_REDIRECT_URI || `${baseUrl}/api/auth/x/callback`
  };
}

function limparCookieOAuth(res, provider) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `bookhub_oauth_state_${provider}=; HttpOnly; SameSite=Lax; Path=/api/auth/${provider}/callback; Max-Age=0${secure}`
  );
}

function oauthFailure(res, provider) {
  limparCookieOAuth(res, provider);
  return res.redirect('/login/login.html?oauth_error=1&message=Não%20foi%20possível%20entrar%20com%20esse%20provedor.');
}

async function iniciarOAuth(provider, res) {
  const config = oauthProviderConfig(provider);
  if (!config.clientId || (provider === 'google' && !config.clientSecret)) {
    return res.status(503).send('Este provedor ainda não foi configurado pelo administrador.');
  }
  if (!db) return res.status(503).send('Banco de dados indisponível.');

  try {
    const state = criarTokenSeguro();
    const codeVerifier = provider === 'x' ? criarTokenSeguro(48) : null;
    await db.query(
      `INSERT INTO public.oauth_states (state, provider, code_verifier, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
      [state, provider, codeVerifier]
    );

    const authorizationUrl = new URL(
      provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : 'https://twitter.com/i/oauth2/authorize'
    );
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', config.clientId);
    authorizationUrl.searchParams.set('redirect_uri', config.callbackUrl);
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('scope', provider === 'google' ? 'openid email profile' : 'users.read tweet.read');
    if (provider === 'google') {
      authorizationUrl.searchParams.set('include_granted_scopes', 'true');
      authorizationUrl.searchParams.set('prompt', 'select_account');
    } else {
      const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      authorizationUrl.searchParams.set('code_challenge', challenge);
      authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    }
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `bookhub_oauth_state_${provider}=${state}; HttpOnly; SameSite=Lax; Path=/api/auth/${provider}/callback; Max-Age=600${secure}`
    );
    return res.redirect(authorizationUrl.toString());
  } catch (error) {
    console.error(`Erro ao iniciar login com ${provider}:`, error);
    return res.status(500).send('Não foi possível iniciar a autenticação.');
  }
}

async function finalizarOAuth(provider, req, res) {
  const cookieName = `bookhub_oauth_state_${provider}=`;
  const cookie = String(req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(cookieName));
  const cookieState = cookie ? cookie.slice(cookieName.length) : '';
  limparCookieOAuth(res, provider);
  if (req.query.error || !req.query.code || !req.query.state || !db ||
      !cookieState || cookieState !== String(req.query.state)) {
    return oauthFailure(res, provider);
  }

  const config = oauthProviderConfig(provider);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: states } = await client.query(
      `DELETE FROM public.oauth_states WHERE state = $1 AND provider = $2 AND expires_at > NOW()
       RETURNING code_verifier`,
      [String(req.query.state), provider]
    );
    if (!states.length) {
      await client.query('ROLLBACK');
      return oauthFailure(res, provider);
    }
    await client.query('COMMIT');

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(req.query.code),
      redirect_uri: config.callbackUrl,
      client_id: config.clientId
    });
    if (provider === 'x') tokenBody.set('code_verifier', states[0].code_verifier);
    const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (config.clientSecret) {
      tokenHeaders.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
    }
    const tokenResponse = await fetch(
      provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://api.twitter.com/2/oauth2/token',
      { method: 'POST', headers: tokenHeaders, body: tokenBody }
    );
    if (!tokenResponse.ok) {
      console.error(`Falha na troca do código OAuth de ${provider}:`, tokenResponse.status, await tokenResponse.text());
      return oauthFailure(res, provider);
    }
    const tokens = await tokenResponse.json();
    const profileResponse = await fetch(
      provider === 'google'
        ? 'https://openidconnect.googleapis.com/v1/userinfo'
        : 'https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (!profileResponse.ok) {
      console.error(`Falha ao obter perfil OAuth de ${provider}:`, profileResponse.status);
      return oauthFailure(res, provider);
    }
    const profilePayload = await profileResponse.json();
    const profile = provider === 'google' ? profilePayload : profilePayload.data;
    const providerUserId = String(profile?.sub || profile?.id || '');
    const email = provider === 'google' && profile?.email_verified ? String(profile.email || '').trim().toLowerCase() : '';
    if (!providerUserId || (provider === 'google' && (!email || profile.email_verified !== true))) {
      return oauthFailure(res, provider);
    }

    if (provider === 'x') {
      const oauthTicket = criarTokenSeguro();
      await db.query('DELETE FROM public.oauth_email_tickets WHERE expires_at <= NOW()');
      await db.query(
        `INSERT INTO public.oauth_email_tickets
          (token_hash, provider_user_id, display_name, username, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
        [
          hashAuthValue(oauthTicket),
          providerUserId,
          String(profile.name || profile.username || 'Leitor BookHub').slice(0, 100),
          String(profile.username || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40)
        ]
      );
      return res.redirect(`/login/login.html?oauth_code=${encodeURIComponent(oauthTicket)}`);
    }

    const userClient = await db.connect();
    let usuario;
    try {
      await userClient.query('BEGIN');
      const { rows: linked } = await userClient.query(
        `SELECT u.* FROM public.oauth_accounts oa
         JOIN public.usuarios u ON u.id = oa.user_id
         WHERE oa.provider = $1 AND oa.provider_user_id = $2 LIMIT 1`,
        [provider, providerUserId]
      );
      if (linked.length) {
        usuario = linked[0];
      } else {
        const { rows: matchingEmail } = email
          ? await userClient.query('SELECT * FROM public.usuarios WHERE LOWER(email) = $1 LIMIT 1', [email])
          : { rows: [] };
        if (matchingEmail.length) {
          usuario = matchingEmail[0];
        } else {
          const fallbackName = String(profile.name || profile.username || `${provider} user`).slice(0, 100);
          const username = String(profile.username || profile.given_name || fallbackName)
            .replace(/[^a-zA-Z0-9_.-]/g, '')
            .slice(0, 40) || `${provider}_${providerUserId.slice(0, 12)}`;
          const login = `${provider}:${providerUserId}`;
          const { rows: created } = await userClient.query(
            `INSERT INTO public.usuarios (nome, username, email, senha, login, avatar, tipo)
             VALUES ($1, $2, $3, '', $4, '/img/avatar1.png', 'aluno') RETURNING *`,
            [fallbackName, username, email || null, login]
          );
          usuario = created[0];
        }
        await userClient.query(
          'INSERT INTO public.oauth_accounts (provider, provider_user_id, user_id) VALUES ($1, $2, $3)',
          [provider, providerUserId, usuario.id]
        );
      }

      await registrarIdentidadeAutenticacao(userClient, {
        userId: usuario.id,
        method: provider,
        providerUserId,
        verified: true
      });
      if (email) {
        await registrarIdentidadeAutenticacao(userClient, {
          userId: usuario.id,
          method: 'email',
          providerUserId: email,
          verified: true
        });
      }

      const handoffCode = criarTokenSeguro();
      await userClient.query(
        `INSERT INTO public.oauth_handoffs (token_hash, user_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '2 minutes')`,
        [hashAuthValue(handoffCode), usuario.id]
      );
      await userClient.query('COMMIT');
      return res.redirect(`/login/login.html?oauth_code=${encodeURIComponent(handoffCode)}`);
    } catch (error) {
      await userClient.query('ROLLBACK');
      throw error;
    } finally {
      userClient.release();
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`Erro no callback OAuth de ${provider}:`, error);
    return oauthFailure(res, provider);
  } finally {
    client.release();
  }
}

app.get('/api/auth/google', (req, res) => iniciarOAuth('google', res));
app.get('/api/auth/x', (req, res) => iniciarOAuth('x', res));
app.get('/api/auth/google/callback', (req, res) => finalizarOAuth('google', req, res));
app.get('/api/auth/x/callback', (req, res) => finalizarOAuth('x', req, res));

app.post('/api/auth/oauth/consume', async (req, res) => {
  const code = String(req.body?.code || '');
  if (!code) return res.status(400).json({ erro: 'Código de autenticação ausente.' });
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });

  try {
    const { rows: handoffs } = await db.query(
      'DELETE FROM public.oauth_handoffs WHERE token_hash = $1 AND expires_at > NOW() RETURNING user_id',
      [hashAuthValue(code)]
    );
    if (!handoffs.length) {
      const { rows: pendingOAuth } = await db.query(
        `SELECT display_name, username FROM public.oauth_email_tickets
         WHERE token_hash = $1 AND expires_at > NOW()`,
        [hashAuthValue(code)]
      );
      if (!pendingOAuth.length) return res.status(400).json({ erro: 'Este acesso expirou. Tente entrar novamente.' });
      return res.json({
        ok: true,
        requiresEmailVerification: true,
        provider: 'x',
        oauthTicket: code,
        profile: pendingOAuth[0]
      });
    }
    const { rows: users } = await db.query('SELECT * FROM public.usuarios WHERE id = $1 LIMIT 1', [handoffs[0].user_id]);
    if (!users.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    await criarSessaoAutenticada(res, users[0].id);
    return res.json({ ok: true, usuario: montarUsuarioPublico(users[0]) });
  } catch (error) {
    console.error('Erro ao concluir login OAuth:', error);
    return res.status(500).json({ erro: 'Erro interno ao concluir a autenticação.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = obterTokenSessao(req);
    if (token && db) {
      await db.query('DELETE FROM public.auth_sessions WHERE token_hash = $1', [hashAuthValue(token)]);
    }
    limparSessaoAutenticada(res);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao encerrar sessão:', error.message);
    return res.status(500).json({ erro: 'Não foi possível encerrar a sessão no servidor.' });
  }
});

app.put('/api/auth/perfil', async (req, res) => {
  const payload = req.body || {};
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });

  try {
    const usuario = await buscarUsuarioDaSessao(db, req);
    if (!usuario) return res.status(401).json({ erro: 'Faça login novamente para editar o perfil.' });

    const emailAtualizado = String(payload.email || usuario.email || '').trim().toLowerCase();
    if (emailAtualizado !== String(usuario.email || '').trim().toLowerCase()) {
      return res.status(400).json({
        erro: 'A troca de e-mail exige uma nova verificação. Use o e-mail atual até esse fluxo estar disponível.'
      });
    }

    const { rows: updated } = await db.query(
      `UPDATE public.usuarios SET nome = $1, username = $2, email = $3, avatar = $4
       WHERE id = $5 RETURNING *`,
      [
        payload.nome || usuario.nome,
        payload.username || usuario.username,
        emailAtualizado,
        payload.avatar || usuario.avatar,
        usuario.id
      ]
    );
    return res.json({ ok: true, usuario: montarUsuarioPublico(updated[0]) });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    return res.status(500).json({ erro: 'Erro interno ao atualizar perfil.' });
  }
});

app.get('/api/ranking', async (req, res) => {
  if (!db) {
    return res.status(503).json({ erro: 'Banco de dados indisponível.' });
  }

  try {
    await finalizarTemporadasVencidas();
    const temporadaAtual = await garantirTemporadaAtual();
    const seasonKey = String(req.query.temporada || temporadaAtual.season_key);
    if (!/^\d{4}-\d{2}$/.test(seasonKey)) {
      return res.status(400).json({ erro: 'Formato de temporada inválido. Use AAAA-MM.' });
    }

    const { rows: temporadas } = await db.query(
      'SELECT * FROM public.ranking_seasons WHERE season_key = $1 LIMIT 1',
      [seasonKey]
    );
    if (!temporadas.length) return res.status(404).json({ erro: 'Temporada não encontrada.' });

    const temporada = temporadas[0];
    const consulta = temporada.status === 'closed'
      ? `SELECT
           u.id AS usuario_id, u.nome, u.username, u.login, u.avatar,
           r.position, r.points,
           COALESCE(rl.livros_lidos, 0) AS livros_lidos,
           COALESCE(rl.pontos_onchain, 0) AS pontos_onchain
         FROM public.ranking_season_results r
         JOIN public.usuarios u ON u.id = r.user_id
         LEFT JOIN public.ranking_leitores rl ON rl.usuario_id = u.id
         WHERE r.season_id = $1
         ORDER BY r.position`
      : `WITH pontuacoes AS (
           SELECT user_id, SUM(points)::INTEGER AS points
           FROM public.ranking_point_events
           WHERE season_id = $1
           GROUP BY user_id
         )
         SELECT
           u.id AS usuario_id, u.nome, u.username, u.login, u.avatar,
           ROW_NUMBER() OVER (
             ORDER BY COALESCE(p.points, 0) DESC, COALESCE(u.username, u.nome, u.login, '') ASC, u.id ASC
           )::INTEGER AS position,
           COALESCE(p.points, 0) AS points,
           COALESCE(rl.livros_lidos, 0) AS livros_lidos,
           COALESCE(rl.pontos_onchain, 0) AS pontos_onchain
         FROM public.usuarios u
         LEFT JOIN pontuacoes p ON p.user_id = u.id
         LEFT JOIN public.ranking_leitores rl ON rl.usuario_id = u.id
         ORDER BY position`;
    const { rows } = await db.query(consulta, [temporada.id]);

    const ranking = rows.map((usuario) => ({
      usuario_id: usuario.usuario_id,
      nome: usuario.nome || usuario.username || usuario.login || 'Usuário',
      username: usuario.username || usuario.login || 'usuario',
      avatar: usuario.avatar || '/img/avatar1.png',
      livros_lidos: Number(usuario.livros_lidos || 0),
      pontos: Number(usuario.points || 0),
      pontos_onchain: Number(usuario.pontos_onchain || 0),
      posicao: Number(usuario.position),
      temporada: seasonKey,
      temporada_status: temporada.status
    }));

    return res.json(ranking);
  } catch (error) {
    console.error('Erro ao carregar ranking do banco:', error.message);
    return res.status(500).json({ erro: 'Não foi possível carregar o ranking.' });
  }
});

app.get('/api/ranking/temporadas', async (req, res) => {
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });
  try {
    await finalizarTemporadasVencidas();
    await garantirTemporadaAtual();
    const { rows } = await db.query(
      `SELECT season_key, starts_at, ends_at, status, results_hash, hash_algorithm,
              chain_id, onchain_tx_hash, anchored_at, closed_at
       FROM public.ranking_seasons
       ORDER BY starts_at DESC`
    );
    return res.json(rows);
  } catch (error) {
    console.error('Erro ao carregar temporadas do ranking:', error.message);
    return res.status(500).json({ erro: 'Não foi possível carregar as temporadas.' });
  }
});

app.get('/api/ranking/conquistas/:usuarioId', async (req, res) => {
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });
  const usuarioId = Number(req.params.usuarioId);
  if (!Number.isInteger(usuarioId) || usuarioId < 1) {
    return res.status(400).json({ erro: 'Identificador de usuário inválido.' });
  }

  try {
    await finalizarTemporadasVencidas();
    const temporadaAtual = await garantirTemporadaAtual();
    const { rows: historicas } = await db.query(
      `SELECT s.season_key AS temporada, r.position AS posicao, r.points AS pontos
       FROM public.ranking_season_results r
       JOIN public.ranking_seasons s ON s.id = r.season_id
       WHERE r.user_id = $1 AND r.position <= 3 AND s.status = 'closed'
       ORDER BY s.starts_at DESC`,
      [usuarioId]
    );
    const { rows: atuais } = await db.query(
      `WITH pontuacoes AS (
         SELECT user_id, SUM(points)::INTEGER AS points
         FROM public.ranking_point_events
         WHERE season_id = $1
         GROUP BY user_id
       ),
       classificados AS (
         SELECT u.id AS user_id, COALESCE(p.points, 0) AS points,
           ROW_NUMBER() OVER (
             ORDER BY COALESCE(p.points, 0) DESC, COALESCE(u.username, u.nome, u.login, '') ASC, u.id ASC
           )::INTEGER AS position
         FROM public.usuarios u
         LEFT JOIN pontuacoes p ON p.user_id = u.id
       )
       SELECT position, points FROM classificados
       WHERE user_id = $2 AND position <= 3`,
      [temporadaAtual.id, usuarioId]
    );

    return res.json({
      atuais: atuais.map((resultado) => ({
        temporada: temporadaAtual.season_key,
        posicao: Number(resultado.position),
        pontos: Number(resultado.points),
        em_andamento: true
      })),
      historicas: historicas.map((resultado) => ({
        temporada: resultado.temporada,
        posicao: Number(resultado.posicao),
        pontos: Number(resultado.pontos),
        em_andamento: false
      }))
    });
  } catch (error) {
    console.error('Erro ao carregar conquistas do ranking:', error.message);
    return res.status(500).json({ erro: 'Não foi possível carregar as conquistas.' });
  }
});

app.get('/api/reservas', async (req, res) => {
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });
  try {
    const administrador = await buscarUsuarioDaSessao(db, req);
    if (!administrador) return res.status(401).json({ erro: 'Faça login para consultar as reservas.' });
    if (!['admin', 'professor'].includes(administrador.tipo)) {
      return res.status(403).json({ erro: 'Acesso restrito ao painel administrativo.' });
    }
    const { rows } = await db.query(
      `SELECT r.id, r.book_id AS id_livro, r.user_id AS usuario_id, r.status, r.motivo,
              r.created_at AS data_pedido, COALESCE(l.titulo, r.book_title) AS titulo,
              COALESCE(u.username, u.nome, u.login, 'Usuário') AS usuario_nome
       FROM public.bookhub_reservations r
       LEFT JOIN public.livros l ON l.id = r.book_id
       JOIN public.usuarios u ON u.id = r.user_id
       ORDER BY r.created_at DESC`
    );
    return res.json(rows);
  } catch (error) {
    console.error('Erro ao carregar reservas:', error.message);
    return res.status(500).json({ erro: 'Não foi possível carregar as reservas.' });
  }
});

app.get('/api/reservas/usuario', async (req, res) => {
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });
  try {
    const usuario = await buscarUsuarioDaSessao(db, req);
    if (!usuario) return res.status(401).json({ erro: 'Faça login novamente para consultar seu histórico.' });
    const { rows } = await db.query(
      `SELECT r.id, r.book_id AS id_livro, r.status, r.motivo,
              r.created_at AS data_pedido, COALESCE(l.titulo, r.book_title) AS titulo
       FROM public.bookhub_reservations r
       LEFT JOIN public.livros l ON l.id = r.book_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [usuario.id]
    );
    return res.json(rows);
  } catch (error) {
    console.error('Erro ao carregar histórico de reservas:', error.message);
    return res.status(500).json({ erro: 'Não foi possível carregar o histórico.' });
  }
});

app.post('/api/reservas', async (req, res) => {
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });
  const idLivro = Number(req.body?.id_livro);
  if (!Number.isInteger(idLivro) || idLivro < 1) {
    return res.status(400).json({ erro: 'Dados da reserva incompletos.' });
  }

  let client;
  try {
    await finalizarTemporadasVencidas();
    client = await db.connect();
    await client.query('BEGIN');
    const usuario = await buscarUsuarioDaSessao(client, req);
    if (!usuario) {
      await client.query('ROLLBACK');
      return res.status(401).json({ erro: 'Sua sessão expirou. Entre novamente para reservar.' });
    }

    const { rows: livros } = await client.query(
      'SELECT id, titulo, disponivel FROM public.livros WHERE id = $1 LIMIT 1',
      [idLivro]
    );
    if (!livros.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Livro não encontrado para reservar.' });
    }
    if (livros[0].disponivel === false) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Este livro não está disponível para reserva.' });
    }

    const { rows: duplicadas } = await client.query(
      `SELECT id FROM public.bookhub_reservations
       WHERE user_id = $1 AND book_id = $2 AND status = 'Pendente'
       LIMIT 1`,
      [usuario.id, idLivro]
    );
    if (duplicadas.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Você já possui uma pré-reserva pendente deste livro.' });
    }

    const { rows: reservasCriadas } = await client.query(
      `INSERT INTO public.bookhub_reservations (user_id, book_id, book_title)
       VALUES ($1, $2, $3)
       RETURNING id, book_id AS id_livro, user_id AS usuario_id, status, motivo,
                 created_at AS data_pedido`,
      [usuario.id, idLivro, livros[0].titulo]
    );
    const temporada = await garantirTemporadaAtual(client);
    const ganhouPonto = await registrarEventoDePontuacao(client, {
      seasonId: temporada.id,
      userId: usuario.id,
      eventType: 'reserva',
      sourceType: 'livro',
      sourceId: idLivro,
      points: 1,
      metadata: { reserva_id: reservasCriadas[0].id }
    });
    await client.query('COMMIT');
    return res.status(201).json({
      ...reservasCriadas[0],
      titulo: livros[0].titulo,
      usuario_nome: usuario.username || usuario.nome || usuario.login || 'Usuário',
      pontos_ganhos: ganhouPonto ? 1 : 0,
      temporada: temporada.season_key
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ erro: 'Você já possui uma pré-reserva pendente deste livro.' });
    }
    console.error('Erro ao criar pré-reserva:', error.message);
    return res.status(500).json({ erro: 'Não foi possível registrar a pré-reserva.' });
  } finally {
    client?.release();
  }
});

app.put('/api/reservas/:id', async (req, res) => {
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });
  const id = Number(req.params.id);
  const status = String(req.body?.status || '');
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ erro: 'Reserva inválida.' });
  if (!['Pendente', 'Aprovado', 'Rejeitado'].includes(status)) {
    return res.status(400).json({ erro: 'Status de reserva inválido.' });
  }

  try {
    const administrador = await buscarUsuarioDaSessao(db, req);
    if (!administrador) return res.status(401).json({ erro: 'Faça login para atualizar reservas.' });
    if (!['admin', 'professor'].includes(administrador.tipo)) {
      return res.status(403).json({ erro: 'Acesso restrito ao painel administrativo.' });
    }
    const { rows } = await db.query(
      `UPDATE public.bookhub_reservations
       SET status = $2, motivo = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING id, book_id AS id_livro, user_id AS usuario_id, status, motivo,
                 created_at AS data_pedido`,
      [id, status, String(req.body?.motivo || '')]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Reserva não encontrada.' });
    return res.json(rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar reserva:', error.message);
    return res.status(500).json({ erro: 'Não foi possível atualizar a reserva.' });
  }
});

app.post('/api/ia/preencher', async (req, res) => {
  const titulo = String(req.body?.titulo || '').trim();

  if (!titulo) {
    return res.status(400).json({ erro: 'Título obrigatório.' });
  }

  try {
    const dados = await gerarDadosLivroIA(titulo);
    if (!dados) {
      return res.status(404).json({ erro: 'Não encontrei um livro com título suficientemente parecido nos catálogos. Confira o título ou preencha os dados manualmente.' });
    }
    return res.json(dados);
  } catch (error) {
    return res.status(500).json({ erro: error.message || 'Erro ao buscar dados com IA.' });
  }
});

app.post('/api/ia/preencher-multiplo', async (req, res) => {
  const raw = req.body?.titulos ?? req.body?.titulo ?? req.body?.texto ?? [];
  const listaTitulos = Array.isArray(raw)
    ? raw
    : String(raw).split(/[\n,]/);

  const titulos = listaTitulos
    .map((titulo) => String(titulo).trim())
    .filter(Boolean)
    .filter((titulo, index, array) => array.indexOf(titulo) === index);

  if (!titulos.length) {
    return res.status(400).json({ erro: 'Informe pelo menos um título para gerar livros pela IA.' });
  }
  if (titulos.length > 30) {
    return res.status(400).json({ erro: 'Pesquise até 30 títulos por vez para evitar limites dos catálogos.' });
  }

  try {
    const livros = [];
    const naoEncontrados = [];
    const incompletos = [];
    const falhas = [];

    for (const titulo of titulos) {
      let dados;
      try {
        dados = await gerarDadosLivroIA(titulo);
      } catch (error) {
        console.warn(`Falha ao buscar dados de "${titulo}":`, error.message);
        falhas.push({ titulo, erro: error.message || 'Falha ao consultar os catálogos.' });
        livros.push({
          titulo,
          autor: '',
          editora: '',
          resumo: '',
          fonte_dados: 'Consulta indisponível; revisão manual necessária',
          dados_confirmados: false,
          campos_ausentes: ['autor', 'editora', 'gênero', 'idioma', 'ano', 'páginas', 'resumo', 'capa']
        });
        continue;
      }
      if (!dados) {
        naoEncontrados.push(titulo);
        livros.push({
          titulo,
          autor: '',
          editora: '',
          resumo: '',
          fonte_dados: 'Sem correspondência nos catálogos; revisão manual necessária',
          dados_confirmados: false,
          campos_ausentes: ['autor', 'editora', 'gênero', 'idioma', 'ano', 'páginas', 'resumo', 'capa']
        });
        continue;
      }
      const camposAusentes = [
        !dados.autor && 'autor',
        !dados.editora && 'editora',
        !dados.genero && 'gênero',
        !dados.idioma && 'idioma',
        !dados.ano_publicacao && 'ano',
        !dados.numero_paginas && 'páginas',
        !dados.resumo && 'resumo',
        !dados.url_capa && 'capa'
      ].filter(Boolean);
      livros.push({ ...dados, titulo, dados_confirmados: true, campos_ausentes: camposAusentes });
      if (camposAusentes.length) incompletos.push({ titulo, campos: camposAusentes });
    }

    return res.json({ ok: true, total: livros.length, livros, naoEncontrados, incompletos, falhas });
  } catch (error) {
    console.error('Erro ao gerar livros em lote pela IA:', error);
    return res.status(500).json({ erro: error.message || 'Erro ao gerar livros em lote.' });
  }
});

async function iniciarServidor() {
  if (db) {
    await garantirEstruturaBanco();
    try {
      await finalizarTemporadasVencidas();
      await garantirTemporadaAtual();
    } catch (error) {
      console.error('Erro ao inicializar temporadas do ranking:', error.message);
    }
  }

  app.listen(PORT, () => console.log('BookHub rodando na porta ' + PORT));

  if (db) {
    const timerTemporadas = setInterval(() => {
      finalizarTemporadasVencidas().catch((error) => {
        console.error('Erro ao fechar temporada mensal do ranking:', error.message);
      });
    }, 60 * 1000);
    timerTemporadas.unref();
  }
}

iniciarServidor();
