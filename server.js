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

// Configuração de CORS restrita e segurança para cookies
const corsOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : (process.env.NODE_ENV === 'production' 
      ? [process.env.AUTH_BASE_URL].filter(Boolean)
      : ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500']);

app.use(cors({
    origin: corsOrigins,
    credentials: true, 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(require('./seguranca/protecaoOrigem').protegerOrigem);

const { verificarPermissaoAdmin } = require('./seguranca/autorizacao');
const { db, garantirEstruturaBanco } = require('./configuracao/db');
const {
  normalizarTituloBusca, limparDescricaoLivro, limparAutorCatalogo,
  limparEditoraCatalogo, pontuarCorrespondenciaTitulo, converterIdiomaLivro,
  gerarTextoGemini, buscarTitulosAlternativosIA, obterAutorConhecidoDoLivro,
  pareceTextoPortugues, encurtarResumoCatalogo, traduzirResumoCatalogo,
  combinarFontesCatalogo
} = require('./utilitarios/iaUtils');

const livrosFallback = [];
const livrosBase = [];
const usuarios = [];

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

async function persistirLivroComDados(dados) {
  const payload = normalizarLivro(dados);
  if (!payload.titulo || !payload.autor) return null;
  if (!db) throw new Error('Supabase indisponível; livro não foi salvo.');

  const livroNoBanco = await salvarLivroNoBanco(payload);
  if (!livroNoBanco) throw new Error('O Supabase não confirmou a gravação do livro.');
  return livroNoBanco;
}

let googleBooksIndisponivelAte = 0;
let avisoLimiteGoogleBooksAtivo = false;

async function buscarDadosLivroGoogleBooks(titulo) {
  const texto = String(titulo || '').trim();
  if (!texto) return null;
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
    throw new Error('Não foi possível consultar o catálogo de livros agora.');
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
}

async function buscarDadosWikipedia(titulo, idiomaWiki, titulosComparaveis = [titulo]) {
  try {
    const tituloDireto = String(titulo || '').trim().replace(/ /g, '_');
    const respostaDireta = await fetch(
      `https://${idiomaWiki}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(tituloDireto)}`,
      { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'BookHub/1.0' } }
    );
    if (respostaDireta.ok) {
      const paginaDireta = await respostaDireta.json();
      const score = Math.max(...titulosComparaveis.map((c) => pontuarCorrespondenciaTitulo(c, paginaDireta.title)));
      if (score >= 0.84 && paginaDireta.extract) {
        return {
          titulo,
          resumo: limparDescricaoLivro(paginaDireta.extract),
          idioma_resumo: idiomaWiki === 'pt' ? 'Português' : 'Inglês',
          url_capa: paginaDireta.thumbnail?.source || '',
          fonte_dados: `Wikipedia (${idiomaWiki.toUpperCase()})`,
          url_fonte: paginaDireta.content_urls?.desktop?.page || ''
        };
      }
    }
  } catch (e) {}
  return null;
}

async function buscarDadosInternetArchive(titulo) {
  return null;
}

async function aguardarLimiteOpenLibrary() {
  const intervaloRestante = 1000 - (Date.now() - ultimaBuscaOpenLibrary);
  if (intervaloRestante > 0) {
    await new Promise((resolve) => setTimeout(resolve, intervaloRestante));
  }
  ultimaBuscaOpenLibrary = Date.now();
}

async function buscarDadosLivroOpenLibrary(titulo, tituloOriginal = titulo) {
  return null;
}

async function gerarDadosLivroIA(titulo) {
  const texto = String(titulo || '').trim();
  if (!texto) throw new Error('Título obrigatório.');
  const chaveCache = `${VERSAO_CACHE_CATALOGO}:${normalizarTituloBusca(texto)}`;
  const cache = obterLivroEmCache(chaveCache);
  if (cache.encontrado) return cache.dados;

  const dadosGB = await buscarDadosLivroGoogleBooks(texto).catch(() => null);
  if (dadosGB) {
    guardarLivroEmCache(chaveCache, dadosGB);
    return dadosGB;
  }
  return null;
}

// Arquivos Estáticos e Servidor
app.use(express.static(path.join(projectRoot, 'pagina_inicial/html')));
app.use('/css', express.static(path.join(projectRoot, 'pagina_inicial/css')));
app.use('/java', express.static(path.join(projectRoot, 'pagina_inicial/java')));
app.use('/img', express.static(path.join(projectRoot, 'img')));

app.use('/login', express.static(path.join(projectRoot, 'pagina_login/html')));
app.use('/login/css', express.static(path.join(projectRoot, 'pagina_login/css')));
app.use('/login/js', express.static(path.join(projectRoot, 'pagina_login/js')));

// Entrada canônica do perfil: express.static não serve perfil.html como índice da pasta.
// As duas variantes evitam página 404 após callbacks OAuth e links antigos.
app.get(['/perfil', '/perfil/'], (req, res) => res.redirect(302, '/perfil/perfil.html'));
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

app.get('/health', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ ok: false, error: 'Database not configured' });
    }
    await db.query('SELECT 1');
    res.json({ ok: true, timestamp: new Date().toISOString(), database: 'connected' });
  } catch (error) {
    res.status(503).json({ ok: false, error: 'Database unavailable', details: error.message });
  }
});
app.get('/ranking', (req, res) => res.redirect('/ranking/html/ranking.html'));
app.get('/ranking/html/ranking.html', (req, res) => res.sendFile(path.join(projectRoot, 'pagina_ranking', 'html', 'ranking.html')));
app.get('/ranking/css/ranking.css', (req, res) => res.sendFile(path.join(projectRoot, 'pagina_ranking', 'css', 'ranking.css')));
app.get('/ranking/js/ranking.js', (req, res) => res.sendFile(path.join(projectRoot, 'pagina_ranking', 'js', 'ranking.js')));

// 🚀 REGISTRO DAS ROTAS DA API ORGANIZADAS NA PASTA ROTAS
const apiRotas = require('./rotas/api');
app.use('/api', apiRotas);

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

if (require.main === module) {
  iniciarServidor();
}

module.exports = app;