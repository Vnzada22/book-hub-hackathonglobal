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

async function obterUsuarioDaSessao(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  const cookie = cookies.map(parte => parte.trim()).find(parte => parte.startsWith('bookhub_session='));
  if (!cookie) return null;
  const token = cookie.slice('bookhub_session='.length);
  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const { rows } = await db.query(
    `SELECT u.* FROM public.auth_sessions s
     JOIN public.usuarios u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

function exigirAutenticacao(req, res, next) {
  obterUsuarioDaSessao(req).then(usuario => {
    if (!usuario) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login novamente.' });
    req.usuario = usuario;
    next();
  }).catch(() => res.status(401).json({ erro: 'Erro ao validar sessão.' }));
}

// ==========================================
// ROTAS DE PRÉ-RESERVAS
// ==========================================

// Admin: listar todas as reservas
router.get('/', verificarPermissaoAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        r.id, r.user_id, r.book_id, r.status, r.motivo, r.created_at, r.updated_at,
        u.nome as user_nome, u.email as user_email,
        l.titulo as livro_titulo,
        COALESCE(a.nome, 'Autor desconhecido') as livro_autor,
        r.created_at as data_pedido,
        r.updated_at as data_atualizacao
      FROM public.bookhub_reservations r
      JOIN public.usuarios u ON u.id = r.user_id
      LEFT JOIN public.livros l ON l.id = r.book_id
      LEFT JOIN public.autores a ON a.id = l.id_autor
      ORDER BY r.created_at DESC
    `);
    
    const reservas = rows.map(r => ({
      id: r.id,
      livro_id: r.book_id,
      titulo: r.livro_titulo,
      autor: r.livro_autor,
      status: r.status,
      motivo: r.motivo,
      data_pedido: r.data_pedido,
      data_atualizacao: r.data_atualizacao,
      usuario_id: r.user_id,
      usuario_nome: r.user_nome,
      usuario_email: r.user_email
    }));
    res.json(reservas);
  } catch (error) {
    console.error('Erro ao buscar reservas:', error);
    res.status(500).json({ erro: 'Erro ao buscar reservas.' });
  }
});

// Usuário: suas reservas
router.get('/usuario', exigirAutenticacao, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT 
         r.id, r.user_id, r.book_id, r.status, r.motivo, r.created_at, r.updated_at,
         l.titulo as livro_titulo,
         COALESCE(a.nome, 'Autor desconhecido') as livro_autor,
         r.created_at as data_pedido,
         r.updated_at as data_atualizacao
       FROM public.bookhub_reservations r
       LEFT JOIN public.livros l ON l.id = r.book_id
       LEFT JOIN public.autores a ON a.id = l.id_autor
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC LIMIT 20`,
      [req.usuario.id]
    );
    
    const reservas = rows.map(r => ({
      id: r.id,
      livro_id: r.book_id,
      titulo: r.livro_titulo,
      autor: r.livro_autor,
      status: r.status,
      motivo: r.motivo,
      data_pedido: r.data_pedido,
      data_atualizacao: r.data_atualizacao,
      usuario_id: r.user_id
    }));
    res.json(reservas);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao buscar reservas.' });
  }
});

// Criar reserva
router.post('/', exigirAutenticacao, csrfProtection, async (req, res) => {
  const { id_livro } = req.body || {};
  if (!Number.isSafeInteger(Number(id_livro)) || Number(id_livro) < 1) return res.status(400).json({ erro: 'Livro inválido.' });

  try {
    const { rows: livroRows } = await db.query(
      `SELECT l.id, l.titulo, l.disponivel 
       FROM public.livros l 
       WHERE l.id = $1 LIMIT 1`, 
      [id_livro]
    );
    if (!livroRows.length) return res.status(404).json({ erro: 'Livro não encontrado.' });
    
    const livro = livroRows[0];
    if (livro.disponivel === false) {
      return res.status(400).json({ erro: 'Este livro não está disponível para reserva no momento.' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      // Impede duplicidade por usuário/livro mesmo sob criação concorrente.
      const { rows: existing } = await client.query(
        'SELECT id FROM public.bookhub_reservations WHERE user_id = $1 AND book_id = $2 AND status = $3 LIMIT 1 FOR UPDATE',
        [req.usuario.id, id_livro, 'Pendente']
      );
      if (existing.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Já existe uma reserva pendente para este livro.' });
      }
      const { rows: exemplares } = await client.query(
        `SELECT id FROM public.exemplares WHERE livro_id = $1 AND estado = 'disponivel' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [id_livro]
      );
      
      if (!exemplares.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Nenhum exemplar disponível para reserva.' });
      }
      const exemplarId = exemplares[0].id;
      await client.query(
        `UPDATE public.exemplares SET estado = 'reservado', atualizado_em = NOW() WHERE id = $1 AND livro_id = $2 AND estado = 'disponivel'`,
        [exemplarId, id_livro]
      );

      const { rows } = await client.query(
        `INSERT INTO public.bookhub_reservations (user_id, book_id, exemplar_id, book_title, status, motivo, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'Pendente', '', NOW(), NOW()) RETURNING *`,
        [req.usuario.id, id_livro, exemplarId, livro.titulo]
      );
      
      await client.query('COMMIT');
      
      res.status(201).json({ ok: true, mensagem: 'Pré-reserva solicitada com sucesso.', reserva: rows[0], exemplarId });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ erro: 'Já existe uma reserva pendente para este livro.' });
    }
    console.error('Erro ao criar reserva:', error);
    res.status(500).json({ erro: 'Erro ao criar reserva.' });
  }
});

// Atualizar reserva (admin/professor)
router.put('/:id', verificarPermissaoAdmin, csrfProtection, async (req, res) => {
  const id = Number(req.params.id);
  const { status, motivo } = req.body || {};
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID inválido.' });
  if (!['Pendente', 'Aprovado', 'Rejeitado'].includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
  if (status === 'Rejeitado' && (!String(motivo || '').trim())) return res.status(400).json({ erro: 'Motivo obrigatório.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: existentes } = await client.query('SELECT * FROM public.bookhub_reservations WHERE id = $1 FOR UPDATE', [id]);
    if (!existentes.length) { await client.query('ROLLBACK'); return res.status(404).json({ erro: 'Reserva não encontrada.' }); }
    const anterior = existentes[0];
    if (anterior.status !== status) {
      if (anterior.status !== 'Pendente' || !['Aprovado', 'Rejeitado'].includes(status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Transição de status inválida. Reservas já decididas não podem ser reabertas.' });
      }
      if (!anterior.exemplar_id) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Reserva antiga sem exemplar vinculado. Necessária reconciliação administrativa.' });
      }
      const { rows: copies } = await client.query('SELECT id, livro_id, estado FROM public.exemplares WHERE id = $1 FOR UPDATE', [anterior.exemplar_id]);
      if (!copies.length || copies[0].livro_id !== anterior.book_id || copies[0].estado !== 'reservado') {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Estado do exemplar inconsistente. Verifique a reserva.' });
      }
      await client.query(`UPDATE public.exemplares SET estado = $1, atualizado_em = NOW() WHERE id = $2`,
        [status === 'Aprovado' ? 'emprestado' : 'disponivel', anterior.exemplar_id]);
    }
    const { rows } = await client.query('UPDATE public.bookhub_reservations SET status = $1, motivo = $2, updated_at = NOW() WHERE id = $3 RETURNING *', [status, status === 'Rejeitado' ? String(motivo).trim() : '', id]);
    if (status === 'Aprovado' && anterior.status !== 'Aprovado') {
      // Pontos não podem ser atribuídos duas vezes à mesma reserva.
      const { rows: seasons } = await client.query("SELECT id FROM public.ranking_seasons WHERE status = 'active' ORDER BY starts_at DESC LIMIT 1");
      if (seasons.length) await client.query(`INSERT INTO public.ranking_point_events (season_id, user_id, event_type, source_type, source_id, points, metadata)
        VALUES ($1, $2, 'reserva_aprovada', 'reserva', $3, 10, $4)
        ON CONFLICT ON CONSTRAINT ranking_point_events_source_unique DO NOTHING`,
        [seasons[0].id, rows[0].user_id, id, JSON.stringify({ reserva_id: id, book_id: rows[0].book_id })]);
    }
    await client.query('COMMIT');
    res.json({ ok: true, mensagem: 'Reserva atualizada com sucesso.', reserva: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar reserva:', error);
    res.status(500).json({ erro: 'Erro ao atualizar reserva.' });
  } finally { client.release(); }
});

// Obter reserva por ID
router.get('/:id', exigirAutenticacao, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ erro: 'ID de reserva inválido.' });

  try {
    const { rows } = await db.query('SELECT * FROM public.bookhub_reservations WHERE id = $1 LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ erro: 'Reserva não encontrada.' });
    
    const reserva = rows[0];
    if (reserva.user_id !== req.usuario.id && !['admin', 'professor'].includes(req.usuario.tipo) && !['admin', 'professor'].includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Acesso negado a esta reserva.' });
    }
    
    res.json(reserva);
  } catch (error) {
    return res.status(500).json({ erro: 'Erro ao buscar reserva.' });
  }
});

// Deletar reserva (usuário próprio se pendente, admin/professor qualquer)
router.delete('/:id', exigirAutenticacao, csrfProtection, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID inválido.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM public.bookhub_reservations WHERE id = $1 FOR UPDATE', [id]);
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ erro: 'Reserva não encontrada.' }); }
    const reserva = rows[0];
    const admin = ['admin','professor'].includes(req.usuario.tipo) || ['admin','professor'].includes(req.usuario.perfil);
    if (!admin && reserva.user_id !== req.usuario.id) { await client.query('ROLLBACK'); return res.status(403).json({ erro: 'Acesso negado.' }); }
    if (reserva.status !== 'Pendente') {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Apenas solicitações pendentes podem ser canceladas. Uma retirada aprovada exige devolução administrativa.' });
    }
    if (!reserva.exemplar_id) { await client.query('ROLLBACK'); return res.status(409).json({ erro: 'Reserva antiga sem exemplar vinculado. Contate a administração.' }); }
    const { rows: copies } = await client.query('SELECT id, livro_id, estado FROM public.exemplares WHERE id = $1 FOR UPDATE', [reserva.exemplar_id]);
    if (!copies.length || copies[0].livro_id !== reserva.book_id || copies[0].estado !== 'reservado') {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Exemplar inconsistente. Cancelamento não realizado.' });
    }
    // Preserva o histórico e libera exclusivamente o exemplar desta solicitação.
    await client.query("UPDATE public.bookhub_reservations SET status = 'Rejeitado', motivo = 'Cancelada pelo usuário', updated_at = NOW() WHERE id = $1", [id]);
    await client.query("UPDATE public.exemplares SET estado = 'disponivel', atualizado_em = NOW() WHERE id = $1", [reserva.exemplar_id]);
    await client.query('COMMIT');
    res.json({ ok: true, mensagem: 'Reserva cancelada com sucesso.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao cancelar reserva:', error);
    res.status(500).json({ erro: 'Erro ao cancelar reserva.' });
  } finally { client.release(); }
});

module.exports = router;
