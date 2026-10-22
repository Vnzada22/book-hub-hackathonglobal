require('dotenv').config();

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/:6643\//, ':6543/');
}

const express = require('express');
const cors = require('cors');
const path = require('path');
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
      `CREATE TABLE IF NOT EXISTS public.ranking_leitores (
        usuario_id INTEGER PRIMARY KEY REFERENCES public.usuarios(id),
        livros_lidos INTEGER DEFAULT 0,
        pontos INTEGER DEFAULT 0,
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      )`
    ];

    for (const sql of sqls) {
      await db.query(sql);
    }

    await db.query('ALTER TABLE public.livros ADD COLUMN IF NOT EXISTS resumo TEXT');

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


const reservas = [];
let nextLivroId = livrosBase.length + 1;
let nextUsuarioId = usuarios.length + 1;
let nextReservaId = 1;

function normalizarWallet(wallet) {
  return String(wallet || '').trim().toLowerCase();
}

function montarUsuarioSeguranca(usuario) {
  if (!usuario) return null;
  const wallet = usuario.walletAddress || usuario.wallet_address || usuario.wallet;
  return { ...usuario, walletAddress: wallet, wallet_address: wallet, wallet };
}

function normalizarLivro(dados = {}) {
  return {
    id: Number(dados.id) || 0,
    titulo: String(dados.titulo || 'Livro sem título').trim(),
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
  return {
    id: Number(row.id ?? 0),
    titulo: String(row.titulo ?? row.title ?? 'Livro sem título').trim(),
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
    await garantirEstruturaBanco();

    const tables = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    console.log('📊 Tabelas encontradas no banco:', tables.rows.map(r => r.table_name));

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
    console.log(`📚 Linhas retornadas da tabela livros: ${rows ? rows.length : 0}`);

    if (rows && rows.length > 0) {
      return rows.map(normalizarLivroDoBanco);
    }

    const fallbackSimples = await db.query('SELECT * FROM public.livros ORDER BY titulo ASC');
    return (fallbackSimples.rows || []).map((row) => ({
      id: Number(row.id ?? 0),
      titulo: String(row.titulo ?? 'Livro sem título').trim(),
      autor: String(row.autor ?? row.author ?? 'Autor desconhecido').trim(),
      editora: String(row.editora ?? row.publisher ?? 'Editora não informada').trim(),
      genero: String(row.genero ?? row.genre ?? 'Geral').trim(),
      url_capa: String(row.url_capa ?? row.capa ?? '').trim(),
      ano_publicacao: row.ano_publicacao ?? row.ano ?? null,
      numero_paginas: row.numero_paginas ?? row.paginas ?? null,
      idioma: String(row.idioma ?? row.language ?? 'Português').trim(),
      resumo: String(row.resumo ?? row.descricao ?? '').trim(),
      disponivel: row.disponivel !== false && row.disponivel !== 0
    }));
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

    const livroSalvo = await db.query(`
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
    `, [rows[0].id]);

    return normalizarLivroDoBanco(livroSalvo.rows[0]);
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

const MODELO_GEMINI = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

async function gerarTextoGemini(prompt, options = {}) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return '';

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODELO_GEMINI + ':generateContent', {
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
      })
    });

    if (!response.ok) {
      console.warn('Gemini request failed while filling book data (HTTP ' + response.status + ').');
      return '';
    }

    const data = await response.json();
    return (data.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || '')
      .join(' ')
      .trim();
  } catch (error) {
    console.warn('Gemini unavailable while filling book data:', error.message);
    return '';
  }
}

async function buscarTitulosAlternativosIA(titulo) {
  const normalizado = normalizarTituloBusca(titulo);
  if (/^diario de um banana(?: (?:1|volume 1|primeiro))?$/.test(normalizado)) {
    return ['Diary of a Wimpy Kid'];
  }

  const prompt = 'Converta o t\u00edtulo de livro informado para o t\u00edtulo original mais prov\u00e1vel usado em cat\u00e1logos internacionais. N\u00e3o invente autor, editora, ano ou outros dados. Preserve o volume quando fizer parte do t\u00edtulo. Responda somente JSON no formato {"titulos":["t\u00edtulo original", "outra variante conhecida"]}. Se n\u00e3o houver tradu\u00e7\u00e3o segura, retorne {"titulos":[]}. T\u00edtulo informado: ' + JSON.stringify(titulo);
  const resposta = await gerarTextoGemini(prompt, { json: true, maxOutputTokens: 120 });

  try {
    const json = JSON.parse(resposta);
    const titulos = Array.isArray(json.titulos) ? json.titulos : [];
    return titulos
      .map((item) => String(item || '').trim())
      .filter((item) => item && item.length <= 160 && normalizarTituloBusca(item) !== normalizado)
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function traduzirResumoCatalogo(titulo, autor, descricao) {
  const texto = limparDescricaoLivro(descricao);
  if (!texto) return '';

  const prompt = 'Escreva um resumo breve em portugu\u00eas do Brasil para o cadastro de um livro. Use exclusivamente os fatos presentes na descri\u00e7\u00e3o de cat\u00e1logo abaixo; apenas traduza e sintetize o que ela diz. N\u00e3o acrescente personagens, acontecimentos, g\u00eaneros ou detalhes ausentes e n\u00e3o invente continua\u00e7\u00e3o. Retorne somente o resumo em 2 ou 3 frases.\nT\u00edtulo: ' + titulo + '\nAutor: ' + (autor || 'n\u00e3o informado') + '\nDescri\u00e7\u00e3o do cat\u00e1logo: ' + texto;
  const resposta = await gerarTextoGemini(prompt, { maxOutputTokens: 180 });
  return limparDescricaoLivro(resposta) || texto;
}

async function traduzirResumoSeNecessario(dados) {
  if (!dados.resumo || /^(pt|portugu)/i.test(String(dados.idioma || '').trim())) {
    return dados;
  }
  const resumoTraduzido = await traduzirResumoCatalogo(dados.titulo, dados.autor, dados.resumo);
  return { ...dados, resumo: resumoTraduzido || dados.resumo };
}

async function buscarDadosLivroGoogleBooks(titulo) {
  const texto = String(titulo || '').trim();
  if (!texto) {
    return null;
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
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google Books retornou HTTP ${response.status}.`);
    }

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

    return traduzirResumoSeNecessario({
      titulo: [volumeInfo.title, volumeInfo.subtitle].filter(Boolean).join(': ') || texto,
      autor: Array.isArray(volumeInfo.authors) ? volumeInfo.authors.join(', ') : '',
      editora: volumeInfo.publisher || '',
      genero: Array.isArray(volumeInfo.categories) ? volumeInfo.categories[0] || '' : '',
      ano_publicacao: dataPublicacao ? Number(dataPublicacao) : null,
      numero_paginas: Number.isInteger(Number(volumeInfo.pageCount)) && Number(volumeInfo.pageCount) > 0 ? Number(volumeInfo.pageCount) : null,
      idioma: converterIdiomaLivro(volumeInfo.language),
      resumo: limparDescricaoLivro(volumeInfo.description),
      url_capa: urlCapa.replace(/^http:/i, 'https:'),
      fonte_dados: 'Google Books'
    });
  } catch (error) {
    console.warn('Erro ao consultar o catálogo Google Books:', error.message);
    throw new Error('Não foi possível consultar o catálogo de livros agora. Tente novamente ou preencha os dados manualmente.');
  }
}

let ultimaBuscaOpenLibrary = 0;
const cacheBuscaLivros = new Map();

async function aguardarLimiteOpenLibrary() {
  const intervaloRestante = 1000 - (Date.now() - ultimaBuscaOpenLibrary);
  if (intervaloRestante > 0) {
    await new Promise((resolve) => setTimeout(resolve, intervaloRestante));
  }
  ultimaBuscaOpenLibrary = Date.now();
}

async function buscarDadosLivroOpenLibrary(titulo, tituloOriginal = titulo) {
  const texto = String(titulo || '').trim();
  await aguardarLimiteOpenLibrary();

  const parametros = new URLSearchParams({
    title: texto,
    limit: '10',
    fields: 'key,title,subtitle,author_name,publisher,first_publish_year,number_of_pages_median,language,cover_i,subject,editions,editions.title,editions.publisher,editions.number_of_pages,editions.language,editions.cover_i'
  });
  const response = await fetch(`https://openlibrary.org/search.json?${parametros}`, {
    headers: { 'User-Agent': 'BookHub/1.0 (catalog title lookup)' }
  });
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
        headers: { 'User-Agent': 'BookHub/1.0 (catalog title lookup)' }
      });
      if (respostaObra.ok) {
        const obra = await respostaObra.json();
        resumo = await traduzirResumoCatalogo(tituloOriginal, resultado.author_name?.join(', '), obra.description);
      }
    } catch (error) {
      console.warn('Descrição adicional do Open Library indisponível:', error.message);
    }
  }

  return {
    titulo: tituloOriginal,
    titulo_catalogo: edicao.full_title || edicao.title || [resultado.title, resultado.subtitle].filter(Boolean).join(': ') || texto,
    autor: Array.isArray(resultado.author_name) ? resultado.author_name.join(', ') : '',
    editora: Array.isArray(editoras) ? editoras[0] || '' : String(editoras || ''),
    genero: Array.isArray(resultado.subject) ? resultado.subject[0] || '' : '',
    ano_publicacao: Number(String(edicao.publish_date || '').match(/\b\d{4}\b/)?.[0]) || Number(resultado.first_publish_year) || null,
    numero_paginas: Number.isInteger(numeroPaginas) && numeroPaginas > 0 ? numeroPaginas : null,
    idioma: converterIdiomaLivro(idioma),
    resumo,
    url_capa: coverId ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(coverId)}-L.jpg?default=false` : '',
    fonte_dados: 'Open Library'
  };
}

async function gerarDadosLivroIA(titulo) {
  const texto = String(titulo || '').trim();
  if (!texto) throw new Error('Título obrigatório.');

  const chaveCache = normalizarTituloBusca(texto);
  if (cacheBuscaLivros.has(chaveCache)) return cacheBuscaLivros.get(chaveCache);

  const errosFonte = [];
  let fontesConsultadas = 0;
  let googleBooksDisponivel = true;
  try {
    const dadosGoogle = await buscarDadosLivroGoogleBooks(texto);
    fontesConsultadas += 1;
    if (dadosGoogle) {
      const dadosComTituloOriginal = {
        ...dadosGoogle,
        titulo: texto,
        titulo_catalogo: dadosGoogle.titulo_catalogo || dadosGoogle.titulo
      };
      cacheBuscaLivros.set(chaveCache, dadosComTituloOriginal);
      return dadosComTituloOriginal;
    }
  } catch (error) {
    errosFonte.push(error);
    googleBooksDisponivel = false;
    console.warn('Google Books indisponível; tentando Open Library.');
  }

  try {
    const dadosOpenLibrary = await buscarDadosLivroOpenLibrary(texto, texto);
    fontesConsultadas += 1;
    if (dadosOpenLibrary) {
      cacheBuscaLivros.set(chaveCache, dadosOpenLibrary);
      return dadosOpenLibrary;
    }
  } catch (error) {
    errosFonte.push(error);
    console.warn('Open Library indisponível:', error.message);
  }

  const titulosAlternativos = await buscarTitulosAlternativosIA(texto);
  for (const tituloAlternativo of titulosAlternativos) {
    if (googleBooksDisponivel) {
      try {
        const dadosGoogle = await buscarDadosLivroGoogleBooks(tituloAlternativo);
        fontesConsultadas += 1;
        if (dadosGoogle) {
          const dadosComTituloOriginal = {
            ...dadosGoogle,
            titulo: texto,
            titulo_catalogo: dadosGoogle.titulo_catalogo || dadosGoogle.titulo
          };
          cacheBuscaLivros.set(chaveCache, dadosComTituloOriginal);
          return dadosComTituloOriginal;
        }
      } catch (error) {
        errosFonte.push(error);
        googleBooksDisponivel = false;
      }
    }

    try {
      const dadosOpenLibrary = await buscarDadosLivroOpenLibrary(tituloAlternativo, texto);
      fontesConsultadas += 1;
      if (dadosOpenLibrary) {
        cacheBuscaLivros.set(chaveCache, dadosOpenLibrary);
        return dadosOpenLibrary;
      }
    } catch (error) {
      errosFonte.push(error);
      console.warn('Open Library indisponÃ­vel para tÃ­tulo alternativo:', error.message);
    }
  }

  if (fontesConsultadas === 0 && errosFonte.length) {
    throw new Error('Não foi possível confirmar o livro nas fontes de catálogo agora. Tente novamente ou preencha os dados manualmente.');
  }

  cacheBuscaLivros.set(chaveCache, null);
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

    const atualizado = await db.query('SELECT l.id, l.titulo, a.nome AS autor, e.nome AS editora, l.genero, l.url_capa, l.ano_publicacao, l.numero_paginas, l.idioma, l.resumo, l.disponivel FROM public.livros l LEFT JOIN public.autores a ON a.id = l.id_autor LEFT JOIN public.editoras e ON e.id = l.id_editora WHERE l.id = $1 LIMIT 1', [livroAtual.id]);
    if (!atualizado.rows?.length) {
      return res.status(500).json({ erro: 'A alteracao foi executada, mas nao foi possivel confirmar o livro salvo.' });
    }
    return res.json(normalizarLivroDoBanco(atualizado.rows[0]));
  } catch (error) {
    console.error('Erro ao atualizar livro no Supabase:', error.message);
    return res.status(500).json({ erro: error.message || 'Nao foi possivel atualizar o livro no Supabase.' });
  }
});

app.delete('/api/livros/:id', async (req, res) => {
  if (db) {
    try {
      const livroAtual = await encontrarLivroPorId(req.params.id);
      if (!livroAtual) {
        return res.status(404).json({ erro: 'Livro não encontrado.' });
      }

      await db.query('DELETE FROM public.livros WHERE id = $1', [Number(req.params.id)]);
      return res.json({ ok: true, removido: livroAtual });
    } catch (error) {
      console.warn('Erro ao deletar livro no banco. Usando fallback em memória.', error.message);
    }
  }

  const index = livrosBase.findIndex((livro) => livro.id === Number(req.params.id));
  if (index === -1) {
    return res.status(404).json({ erro: 'Livro não encontrado.' });
  }

  const removido = livrosBase.splice(index, 1)[0];
  return res.json({ ok: true, removido });
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
        return res.json({ usuario: montarUsuarioSeguranca(rows[0]), ok: true });
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

  if (!wallet || !payload.nome || !payload.email || !payload.username) {
    return res.status(400).json({ erro: 'Dados incompletos para cadastro.' });
  }

  try {
    if (db) {
      // 1. Verifica se a carteira (login) já existe
      const { rows: walletExistente } = await db.query('SELECT * FROM public.usuarios WHERE LOWER(login) = LOWER($1) LIMIT 1', [wallet]);
      if (walletExistente && walletExistente.length > 0) {
        return res.status(400).json({ erro: 'Esta carteira já está vinculada a uma conta.' });
      }

      // 2. Verifica se o email já existe
      const { rows: emailExistente } = await db.query('SELECT * FROM public.usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
      if (emailExistente && emailExistente.length > 0) {
        return res.status(400).json({ erro: 'Este e-mail já está cadastrado em outra conta.' });
      }

      // 3. Se tudo estiver OK, faz o cadastro
      const { rows: novo } = await db.query(
        'INSERT INTO public.usuarios (nome, username, email, senha, login, avatar, tipo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [payload.nome, payload.username, email, payload.senha || '', wallet, payload.avatar || '/img/avatar1.png', 'aluno']
      );
      return res.status(201).json({ usuario: montarUsuarioSeguranca(novo[0]), ok: true });
    }
    return res.status(500).json({ erro: 'Banco de dados não conectado.' });
  } catch (error) {
    console.error('Erro no registro:', error);
    return res.status(500).json({ erro: 'Erro interno ao cadastrar usuário.' });
  }
});

app.put('/api/auth/perfil', async (req, res) => {
  const payload = req.body || {};
  const wallet = normalizarWallet(payload.wallet || payload.walletAddress || payload.wallet_address);

  if (!wallet) return res.status(400).json({ erro: 'Carteira obrigatória.' });

  try {
    if (db) {
      const { rows: usuario } = await db.query('SELECT * FROM public.usuarios WHERE LOWER(wallet) = LOWER($1) OR LOWER(wallet_address) = LOWER($1) LIMIT 1', [wallet]);
      if (!usuario || usuario.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });

      await db.query(
        'UPDATE public.usuarios SET nome = $1, username = $2, email = $3, avatar = $4 WHERE wallet = $5',
        [payload.nome || usuario[0].nome, payload.username || usuario[0].username, payload.email || usuario[0].email, payload.avatar || usuario[0].avatar, wallet]
      );
      return res.json({ ok: true });
    }
    return res.status(500).json({ erro: 'Banco de dados não conectado.' });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    return res.status(500).json({ erro: 'Erro interno ao atualizar perfil.' });
  }
});

app.get('/api/ranking', async (req, res) => {
  if (!db) {
    return res.json([]);
  }

  try {
    const { rows } = await db.query(`
      SELECT
        u.id AS usuario_id,
        u.nome,
        u.username,
        u.login,
        u.avatar,
        COALESCE(r.livros_lidos, 0) AS livros_lidos,
        COALESCE(r.pontos, 0) AS pontos,
        u.data_cadastro
      FROM public.usuarios u
      LEFT JOIN public.ranking_leitores r ON r.usuario_id = u.id
      ORDER BY COALESCE(r.pontos, 0) DESC, COALESCE(r.livros_lidos, 0) DESC, u.nome ASC
    `);

    const ranking = rows.map((usuario) => ({
      usuario_id: usuario.usuario_id,
      nome: usuario.nome || usuario.username || usuario.login || 'Usuário',
      username: usuario.username || usuario.login || 'usuario',
      avatar: usuario.avatar || '/img/avatar1.png',
      livros_lidos: Number(usuario.livros_lidos || 0),
      pontos: Number(usuario.pontos || 0),
      atualizado_em: usuario.data_cadastro
    }));

    return res.json(ranking);
  } catch (error) {
    console.error('Erro ao carregar ranking do banco:', error.message);
    return res.status(500).json({ erro: 'Não foi possível carregar o ranking.' });
  }
});

app.get('/api/reservas', (req, res) => {
  const lista = reservas.map((reserva) => {
    const livro = encontrarLivroPorId(reserva.id_livro);
    return { ...reserva, titulo: livro ? livro.titulo : 'Livro removido', usuario_nome: reserva.usuario_nome || reserva.login || 'Usuário' };
  });
  res.json(lista);
});

app.get('/api/reservas/usuario', (req, res) => {
  const wallet = normalizarWallet(req.query.wallet || '');
  const lista = reservas
    .filter((reserva) => normalizarWallet(reserva.login || reserva.usuario_nome || '') === wallet)
    .map((reserva) => {
      const livro = encontrarLivroPorId(reserva.id_livro);
      return { ...reserva, titulo: livro ? livro.titulo : 'Livro removido' };
    });
  res.json(lista);
});

app.post('/api/reservas', (req, res) => {
  const body = req.body || {};
  const idLivro = Number(body.id_livro);
  const login = normalizarWallet(body.login || body.wallet || body.usuario_nome || '');

  if (!idLivro || !login) {
    return res.status(400).json({ erro: 'Dados da reserva incompletos.' });
  }

  const livro = encontrarLivroPorId(idLivro);
  if (!livro) {
    return res.status(404).json({ erro: 'Livro não encontrado para reservar.' });
  }

  const reserva = {
    id: nextReservaId++,
    id_livro: idLivro,
    login,
    usuario_nome: body.usuario_nome || body.login || login,
    status: 'Pendente',
    motivo: '',
    data_pedido: new Date().toISOString()
  };

  reservas.push(reserva);
  return res.status(201).json(reserva);
});

app.put('/api/reservas/:id', (req, res) => {
  const id = Number(req.params.id);
  const reserva = reservas.find((item) => item.id === id);

  if (!reserva) {
    return res.status(404).json({ erro: 'Reserva não encontrada.' });
  }

  reserva.status = req.body?.status || reserva.status;
  reserva.motivo = req.body?.motivo || reserva.motivo;
  return res.json(reserva);
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

  try {
    const livros = [];
    const naoEncontrados = [];
    const incompletos = [];

    for (const titulo of titulos) {
      const dados = await gerarDadosLivroIA(titulo);
      if (!dados) {
        naoEncontrados.push(titulo);
        continue;
      }
      const camposObrigatoriosAusentes = [
        !dados.autor && 'autor',
        !dados.editora && 'editora',
        !dados.resumo && 'resumo'
      ].filter(Boolean);
      if (camposObrigatoriosAusentes.length) {
        incompletos.push({ titulo, campos: camposObrigatoriosAusentes });
        continue;
      }
      const livroCriado = await persistirLivroComDados(dados);
      if (livroCriado) {
        livros.push(livroCriado);
      }
    }

    return res.status(201).json({ ok: true, total: livros.length, livros, naoEncontrados, incompletos });
  } catch (error) {
    console.error('Erro ao gerar livros em lote pela IA:', error);
    return res.status(500).json({ erro: error.message || 'Erro ao gerar livros em lote.' });
  }
});

async function iniciarServidor() {
  if (db) {
    await garantirEstruturaBanco();
  }

  app.listen(PORT, () => console.log('BookHub rodando na porta ' + PORT));
}

iniciarServidor();
