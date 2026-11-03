const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const { verificarPermissaoAdmin } = require('../seguranca/autorizacao');
const { db } = require('../configuracao/db');

function csrfProtection(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.origin;
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:5500',
      'http://localhost:5500',
      process.env.AUTH_BASE_URL
    ].filter(Boolean);
    
    if (process.env.NODE_ENV === 'production') {
      if (!origin) {
        return res.status(403).json({ erro: 'Cabeçalho Origin obrigatório para operações que modificam dados.' });
      }
      if (!allowedOrigins.some(allowed => origin === allowed)) {
        return res.status(403).json({ erro: 'Origem não permitida.' });
      }
    }
  }
  next();
}

router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT l.id, l.titulo, COALESCE(a.nome, 'Autor desconhecido') AS autor,
             COALESCE(e.nome, 'Editora não informada') AS editora,
             l.genero, l.url_capa, l.ano_publicacao, l.numero_paginas, l.idioma, l.resumo, l.disponivel
      FROM public.livros l
      LEFT JOIN public.autores a ON a.id = l.id_autor
      LEFT JOIN public.editoras e ON e.id = l.id_editora
      ORDER BY l.titulo ASC
    `;
    const { rows } = await db.query(query);
    res.json(rows || []);
  } catch (error) {
    console.error('❌ ERRO AO BUSCAR LIVROS:', error.message);
    res.status(500).json({ erro: 'Não foi possível carregar os livros.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const numero = Number(req.params.id);
    if (!Number.isSafeInteger(numero) || numero < 1) return res.status(400).json({ erro: 'ID de livro inválido.' });
    const { rows } = await db.query(`
      SELECT l.id, l.titulo, a.nome AS autor, e.nome AS editora,
             l.genero, l.url_capa, l.ano_publicacao, l.numero_paginas, l.idioma, l.resumo, l.disponivel
      FROM public.livros l
      LEFT JOIN public.autores a ON a.id = l.id_autor
      LEFT JOIN public.editoras e ON e.id = l.id_editora
      WHERE l.id = $1 LIMIT 1
    `, [numero]);

    if (!rows || rows.length === 0) return res.status(404).json({ erro: 'Livro não encontrado.' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno ao buscar livro.' });
  }
});

router.post('/', verificarPermissaoAdmin, csrfProtection, async (req, res) => {
  const corpo = req.body || {};
  const titulo = String(corpo.titulo || '').trim();
  const autor = String(corpo.autor || '').trim();

  if (!titulo || !autor || titulo.length > 250 || autor.length > 250) {
    return res.status(400).json({ erro: 'Título e autor são obrigatórios.' });
  }
  if (!db) return res.status(503).json({ erro: 'Banco de dados indisponível.' });
  if (corpo.ano_publicacao != null && corpo.ano_publicacao !== '' && (!Number.isInteger(Number(corpo.ano_publicacao)) || Number(corpo.ano_publicacao) < 0 || Number(corpo.ano_publicacao) > new Date().getFullYear() + 1)) return res.status(400).json({ erro: 'Ano de publicação inválido.' });
  if (corpo.numero_paginas != null && corpo.numero_paginas !== '' && (!Number.isInteger(Number(corpo.numero_paginas)) || Number(corpo.numero_paginas) <= 0)) return res.status(400).json({ erro: 'Número de páginas inválido.' });

  try {
    let idAutor = null;
    const autorRes = await db.query('SELECT id FROM public.autores WHERE LOWER(nome) = LOWER($1) LIMIT 1', [autor]);
    if (autorRes.rows.length > 0) {
      idAutor = autorRes.rows[0].id;
    } else {
      const novoAutor = await db.query('INSERT INTO public.autores (nome) VALUES ($1) RETURNING id', [autor]);
      idAutor = novoAutor.rows[0].id;
    }

    let idEditora = null;
    const editoraNome = String(corpo.editora || 'Editora não informada').trim();
    const editoraRes = await db.query('SELECT id FROM public.editoras WHERE LOWER(nome) = LOWER($1) LIMIT 1', [editoraNome]);
    if (editoraRes.rows.length > 0) {
      idEditora = editoraRes.rows[0].id;
    } else {
      const novaEditora = await db.query('INSERT INTO public.editoras (nome) VALUES ($1) RETURNING id', [editoraNome]);
      idEditora = novaEditora.rows[0].id;
    }

    const insertQuery = `
      INSERT INTO public.livros (titulo, id_autor, id_editora, genero, url_capa, ano_publicacao, numero_paginas, idioma, resumo, disponivel)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, titulo, genero, url_capa, ano_publicacao, numero_paginas, idioma, resumo, disponivel
    `;
    const valores = [
      titulo,
      idAutor,
      idEditora,
      String(corpo.genero || 'Geral').trim(),
      String(corpo.url_capa || '').trim(),
      corpo.ano_publicacao ? Number(corpo.ano_publicacao) : null,
      corpo.numero_paginas ? Number(corpo.numero_paginas) : null,
      String(corpo.idioma || 'Português').trim(),
      String(corpo.resumo || '').trim(),
      corpo.disponivel !== false
    ];

    const { rows } = await db.query(insertQuery, valores);
    
    try {
      const { rows: seasons } = await db.query(
        `SELECT id FROM public.ranking_seasons WHERE status = 'active' ORDER BY starts_at DESC LIMIT 1`
      );
      if (seasons.length && req.usuario) {
        await db.query(
          `INSERT INTO public.ranking_point_events (season_id, user_id, event_type, source_type, source_id, points, metadata)
           VALUES ($1, $2, 'livro_cadastrado', 'livro', $3, 5, $4)
           ON CONFLICT ON CONSTRAINT ranking_point_events_source_unique DO NOTHING`,
          [seasons[0].id, req.usuario.id, rows[0].id, JSON.stringify({ livro_id: rows[0].id, titulo })]
        );
      }
    } catch (pointsError) {
      console.warn('Erro ao registrar pontos:', pointsError.message);
    }
    
    return res.status(201).json({ ok: true, mensagem: 'Livro gravado com sucesso no Supabase.', livro: rows[0] });
  } catch (error) {
    console.error('Erro ao salvar livro no Supabase:', error);
    return res.status(500).json({ erro: 'Não foi possível salvar o livro no banco de dados.' });
  }
});

router.put('/:id', verificarPermissaoAdmin, csrfProtection, async (req, res) => {
  const id = Number(req.params.id);
  const corpo = req.body || {};
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ erro: 'ID de livro inválido.' });

  const allowedFields = [
    'titulo', 'autor', 'editora', 'genero', 'url_capa', 
    'ano_publicacao', 'numero_paginas', 'idioma', 'resumo', 'disponivel'
  ];

  const updates = [];
  const values = [];
  let paramIndex = 1;

  for (const field of allowedFields) {
    if (corpo[field] !== undefined) {
      if (field === 'ano_publicacao' || field === 'numero_paginas') {
        const num = Number(corpo[field]);
        if (isNaN(num) || num < 0) {
          return res.status(400).json({ erro: `Campo ${field} deve ser um número válido.` });
        }
        updates.push(`${field} = $${paramIndex}`);
        values.push(num);
      } else if (field === 'disponivel') {
        updates.push(`${field} = $${paramIndex}`);
        values.push(corpo[field] === true || corpo[field] === 'true');
      } else if (field === 'autor') {
        const autor = String(corpo[field] || '').trim();
        if (!autor) return res.status(400).json({ erro: 'Autor não pode ser vazio.' });
        const autorRes = await db.query('SELECT id FROM public.autores WHERE LOWER(nome) = LOWER($1) LIMIT 1', [autor]);
        let idAutor;
        if (autorRes.rows.length > 0) {
          idAutor = autorRes.rows[0].id;
        } else {
          const novoAutor = await db.query('INSERT INTO public.autores (nome) VALUES ($1) RETURNING id', [autor]);
          idAutor = novoAutor.rows[0].id;
        }
        updates.push(`id_autor = $${paramIndex}`);
        values.push(idAutor);
      } else if (field === 'editora') {
        const editoraNome = String(corpo[field] || 'Editora não informada').trim();
        const editoraRes = await db.query('SELECT id FROM public.editoras WHERE LOWER(nome) = LOWER($1) LIMIT 1', [editoraNome]);
        let idEditora;
        if (editoraRes.rows.length > 0) {
          idEditora = editoraRes.rows[0].id;
        } else {
          const novaEditora = await db.query('INSERT INTO public.editoras (nome) VALUES ($1) RETURNING id', [editoraNome]);
          idEditora = novaEditora.rows[0].id;
        }
        updates.push(`id_editora = $${paramIndex}`);
        values.push(idEditora);
      } else {
        updates.push(`${field} = $${paramIndex}`);
        values.push(String(corpo[field]).trim());
      }
      paramIndex++;
    }
  }

  if (!updates.length) {
    return res.status(400).json({ erro: 'Nenhum campo válido para atualizar.' });
  }

  values.push(id);

  try {
    const { rows } = await db.query(
      `UPDATE public.livros SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ erro: 'Livro não encontrado.' });
    return res.json({ ok: true, mensagem: 'Livro atualizado com sucesso.', livro: rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar livro:', error);
    return res.status(500).json({ erro: 'Erro ao atualizar livro.' });
  }
});

router.delete('/:id', verificarPermissaoAdmin, csrfProtection, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ erro: 'ID de livro inválido.' });
  try {
    const { rows: livro } = await db.query('SELECT id, titulo FROM public.livros WHERE id = $1 LIMIT 1', [id]);
    if (!livro.length) return res.status(404).json({ erro: 'Livro não encontrado.' });
    
    // A exclusão física apaga exemplares em cascata e compromete reservas históricas.
    // Até existir arquivamento explícito, bloquear qualquer livro com histórico.
    const { rows: historico } = await db.query(
      'SELECT id FROM public.bookhub_reservations WHERE book_id = $1 LIMIT 1', [id]
    );
    if (historico.length) {
      return res.status(409).json({ erro: 'Este livro possui reservas. Preserve o histórico e retire-o do catálogo por edição.' });
    }
    const { rows: exemplares } = await db.query(
      'SELECT id FROM public.exemplares WHERE livro_id = $1 LIMIT 1', [id]
    );
    if (exemplares.length) {
      return res.status(409).json({ erro: 'Este livro possui exemplares físicos. Remova ou transfira os exemplares antes da exclusão.' });
    }
    const { rows } = await db.query('DELETE FROM public.livros WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) return res.status(404).json({ erro: 'Livro não encontrado.' });
    return res.json({ ok: true, id: rows[0].id, mensagem: 'Livro excluído com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir livro:', error);
    return res.status(500).json({ erro: 'Erro ao excluir livro.' });
  }
});

router.post('/lote', verificarPermissaoAdmin, csrfProtection, async (req, res) => {
  const { livros } = req.body || {};
  if (!Array.isArray(livros) || !livros.length || livros.length > 20) {
    return res.status(400).json({ erro: 'Array de livros obrigatório.' });
  }

  const resultados = { salvos: [], falhas: [] };

  for (const [indice, livro] of livros.entries()) {
    try {
      const corpo = livro || {};
      const titulo = String(corpo.titulo || '').trim();
      const autor = String(corpo.autor || '').trim();

      if (!titulo || !autor || titulo.length > 250 || autor.length > 250) {
        throw new Error('Título e autor são obrigatórios.');
      }

      let idAutor = null;
      const autorRes = await db.query('SELECT id FROM public.autores WHERE LOWER(nome) = LOWER($1) LIMIT 1', [autor]);
      if (autorRes.rows.length > 0) {
        idAutor = autorRes.rows[0].id;
      } else {
        const novoAutor = await db.query('INSERT INTO public.autores (nome) VALUES ($1) RETURNING id', [autor]);
        idAutor = novoAutor.rows[0].id;
      }

      let idEditora = null;
      const editoraNome = String(corpo.editora || 'Editora não informada').trim();
      const editoraRes = await db.query('SELECT id FROM public.editoras WHERE LOWER(nome) = LOWER($1) LIMIT 1', [editoraNome]);
      if (editoraRes.rows.length > 0) {
        idEditora = editoraRes.rows[0].id;
      } else {
        const novaEditora = await db.query('INSERT INTO public.editoras (nome) VALUES ($1) RETURNING id', [editoraNome]);
        idEditora = novaEditora.rows[0].id;
      }

      const insertQuery = `
        INSERT INTO public.livros (titulo, id_autor, id_editora, genero, url_capa, ano_publicacao, numero_paginas, idioma, resumo, disponivel)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, titulo, genero, url_capa, ano_publicacao, numero_paginas, idioma, resumo, disponivel
      `;
      const valores = [
        titulo,
        idAutor,
        idEditora,
        String(corpo.genero || 'Geral').trim(),
        String(corpo.url_capa || '').trim(),
        corpo.ano_publicacao ? Number(corpo.ano_publicacao) : null,
        corpo.numero_paginas ? Number(corpo.numero_paginas) : null,
        String(corpo.idioma || 'Português').trim(),
        String(corpo.resumo || '').trim(),
        corpo.disponivel !== false
      ];

      const { rows } = await db.query(insertQuery, valores);
      resultados.salvos.push({ indice, livro: rows[0] });
    } catch (error) {
      resultados.falhas.push({ indice, erro: error.message });
    }
  }

  const statusCode = resultados.falhas.length === 0 ? 201 : (resultados.salvos.length === 0 ? 400 : 207);
  return res.status(statusCode).json({ ok: resultados.falhas.length === 0, ...resultados });
});

module.exports = router;