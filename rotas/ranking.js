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
// ROTAS DE RANKING
// ==========================================

// GET /api/ranking - Ranking da temporada ativa ou parâmetro ?temporada=
router.get('/', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ erro: 'Banco indisponível.' });
    
    const seasonParam = req.query.temporada;
    
    let seasonId = null;
    let season = null;
    
    if (seasonParam && !/^\d{4}-\d{2}$/.test(seasonParam) && !/^[1-9]\d*$/.test(seasonParam)) return res.status(400).json({ erro: 'Temporada inválida.' });
    if (seasonParam) {
      if (/^\d{4}-\d{2}$/.test(seasonParam)) {
        const { rows } = await db.query('SELECT * FROM public.ranking_seasons WHERE season_key = $1 LIMIT 1', [seasonParam]);
        if (rows.length) {
          seasonId = rows[0].id;
          season = rows[0];
        }
      } else {
        seasonId = Number(seasonParam);
        if (seasonId) {
          const { rows } = await db.query('SELECT * FROM public.ranking_seasons WHERE id = $1 LIMIT 1', [seasonId]);
          if (rows.length) season = rows[0];
        }
      }
    }
    
    if (!seasonId) {
      const { rows } = await db.query('SELECT * FROM public.ranking_seasons WHERE status = \'active\' ORDER BY starts_at DESC LIMIT 1');
      if (rows.length) {
        seasonId = rows[0].id;
        season = rows[0];
      }
    }
    
    if (!seasonId || !season) {
      return res.json([]);
    }
    
    if (season.status === 'closed') {
      const { rows } = await db.query(`
        SELECT u.id as usuario_id, u.nome, u.username, u.avatar, rsr.pontos, rsr.position as posicao
        FROM public.ranking_season_results rsr
        JOIN public.usuarios u ON u.id = rsr.user_id
        WHERE rsr.season_id = $1
        ORDER BY rsr.position ASC
        LIMIT 50
      `, [seasonId]);
      return res.json(rows);
    }
    
    const { rows } = await db.query(`
      SELECT u.id as usuario_id, u.nome, u.username, u.avatar, 
             COALESCE(SUM(rpe.points), 0) as pontos,
             ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(rpe.points), 0) DESC, u.username ASC) as posicao
      FROM public.usuarios u
      LEFT JOIN public.ranking_point_events rpe ON rpe.user_id = u.id AND rpe.season_id = $1
      GROUP BY u.id, u.nome, u.username, u.avatar
      ORDER BY pontos DESC, u.username ASC
      LIMIT 50
    `, [seasonId]);
    
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar ranking:', error);
    res.status(500).json({ erro: 'Não foi possível carregar o ranking.' });
  }
});

// GET /api/ranking/temporadas - Listar temporadas
router.get('/temporadas', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ erro: 'Banco indisponível.' });
    const { rows } = await db.query(`
      SELECT id, season_key, starts_at, ends_at, status, results_hash, hash_algorithm, closed_at
      FROM public.ranking_seasons
      ORDER BY starts_at DESC
      LIMIT 20
    `);
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar temporadas:', error);
    res.status(500).json({ erro: 'Erro ao buscar temporadas.' });
  }
});

// GET /api/ranking/temporadas/:seasonId/resultados - Resultados de uma temporada
router.get('/temporadas/:seasonId/resultados', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ erro: 'Banco indisponível.' });
    const seasonId = Number(req.params.seasonId);
    if (!seasonId) return res.status(400).json({ erro: 'ID de temporada inválido.' });
    
    const { rows } = await db.query(`
      SELECT rsr.*, u.nome, u.username, u.avatar
      FROM public.ranking_season_results rsr
      JOIN public.usuarios u ON u.id = rsr.user_id
      WHERE rsr.season_id = $1
      ORDER BY rsr.position ASC
    `, [seasonId]);
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar resultados da temporada:', error);
    res.status(500).json({ erro: 'Erro ao buscar resultados.' });
  }
});

// GET /api/ranking/conquistas/:usuarioId - Conquistas de um usuário
router.get('/conquistas/:usuarioId', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ erro: 'Banco indisponível.' });
    const usuarioId = Number(req.params.usuarioId);
    if (!usuarioId) return res.status(400).json({ erro: 'ID de usuário inválido.' });
    
    const { rows: eventos } = await db.query(`
      SELECT rpe.*, rs.season_key
      FROM public.ranking_point_events rpe
      JOIN public.ranking_seasons rs ON rs.id = rpe.season_id
      WHERE rpe.user_id = $1
      ORDER BY rpe.created_at DESC
    `, [usuarioId]);
    
    const conquistas = [];
    const reservasAprovadas = eventos.filter(e => e.event_type === 'reserva_aprovada').length;
    const livrosCadastrados = eventos.filter(e => e.event_type === 'livro_cadastrado').length;
    const temporadasParticipadas = [...new Set(eventos.map(e => e.season_id))].length;
    
    if (reservasAprovadas >= 1) conquistas.push({ id: 'primeira_reserva', nome: 'Primeira Reserva', descricao: 'Teve uma reserva aprovada', icone: '📚', data: eventos.find(e => e.event_type === 'reserva_aprovada')?.created_at });
    if (reservasAprovadas >= 5) conquistas.push({ id: 'leitor_ativo', nome: 'Leitor Ativo', descricao: '5 reservas aprovadas', icone: '📖', data: null });
    if (reservasAprovadas >= 10) conquistas.push({ id: 'bibliofilo', nome: 'Bibliófilo', descricao: '10 reservas aprovadas', icone: '🏛️', data: null });
    if (livrosCadastrados >= 1) conquistas.push({ id: 'primeiro_livro', nome: 'Primeiro Livro Cadastrado', descricao: 'Cadastrou o primeiro livro no catálogo', icone: '➕', data: eventos.find(e => e.event_type === 'livro_cadastrado')?.created_at });
    if (temporadasParticipadas >= 1) conquistas.push({ id: 'participante_temporada', nome: 'Participante de Temporada', descricao: 'Participou de pelo menos uma temporada do ranking', icone: '🏆', data: null });
    
    const { rows: tops } = await db.query(`
      SELECT rs.season_key, rsr.position
      FROM public.ranking_season_results rsr
      JOIN public.ranking_seasons rs ON rs.id = rsr.season_id
      WHERE rsr.user_id = $1 AND rsr.position <= 3
      ORDER BY rs.starts_at DESC
    `, [usuarioId]);
    
    if (tops.length > 0) {
      tops.forEach(t => {
        conquistas.push({ 
          id: `top3_${t.season_key}`, 
          nome: `Top 3 - ${t.season_key}`, 
          descricao: `Ficou em ${t.position}º lugar na temporada ${t.season_key}`, 
          icone: t.position === 1 ? '🥇' : t.position === 2 ? '🥈' : '🥉', 
          data: null 
        });
      });
    }
    
    // Posições atuais devem aparecer imediatamente no perfil, sem esperar o fechamento da temporada.
    const { rows: posicoesAtuais } = await db.query(`
      WITH pontuacao AS (
        SELECT u.id AS user_id,
               ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(rpe.points), 0) DESC, u.username ASC) AS posicao,
               COALESCE(SUM(rpe.points), 0) AS pontos
        FROM public.usuarios u
        LEFT JOIN public.ranking_point_events rpe ON rpe.user_id = u.id AND rpe.season_id = $2
        GROUP BY u.id, u.username
      )
      SELECT p.posicao, p.pontos, rs.season_key AS temporada
      FROM pontuacao p CROSS JOIN public.ranking_seasons rs
      WHERE p.user_id = $1 AND rs.id = $2 AND p.posicao <= 3 AND p.pontos > 0
    `, [usuarioId, (await db.query("SELECT id FROM public.ranking_seasons WHERE status = 'active' ORDER BY starts_at DESC LIMIT 1")).rows[0]?.id || null]);
    const atuais = posicoesAtuais.map(p => ({ posicao: Number(p.posicao), pontos: Number(p.pontos), temporada: p.temporada, em_andamento: true }));
    const historicas = tops.map(t => ({ posicao: Number(t.position), pontos: 0, temporada: t.season_key, em_andamento: false }));
    res.json({ usuarioId, conquistas, atuais, historicas, totalEventos: eventos.length });
  } catch (error) {
    console.error('Erro ao buscar conquistas:', error);
    res.status(500).json({ erro: 'Erro ao buscar conquistas.' });
  }
});

// GET /api/ranking/historico/:usuarioId - Histórico de pontuação
router.get('/historico/:usuarioId', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ erro: 'Banco indisponível.' });
    const usuarioId = Number(req.params.usuarioId);
    if (!usuarioId) return res.status(400).json({ erro: 'ID de usuário inválido.' });
    
    const { rows } = await db.query(`
      SELECT rpe.*, rs.season_key
      FROM public.ranking_point_events rpe
      JOIN public.ranking_seasons rs ON rs.id = rpe.season_id
      WHERE rpe.user_id = $1
      ORDER BY rpe.created_at DESC
      LIMIT 50
    `, [usuarioId]);
    
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    res.status(500).json({ erro: 'Erro ao buscar histórico.' });
  }
});

module.exports = router;