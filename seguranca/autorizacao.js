const { db } = require('../configuracao/db');

// Função auxiliar local para buscar usuário da sessão caso não venha importada
async function obterUsuarioDaSessaoNoMiddleware(req) {
    const AUTH_SESSION_COOKIE = 'bookhub_session';
    const cookies = String(req.headers.cookie || '').split(';');
    const cookie = cookies.map(parte => parte.trim()).find(parte => parte.startsWith(`${AUTH_SESSION_COOKIE}=`));
    const token = cookie ? cookie.slice(AUTH_SESSION_COOKIE.length + 1) : '';
    if (!token) return null;

    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');

    const { rows } = await db.query(
        `SELECT u.*
         FROM public.auth_sessions s
         JOIN public.usuarios u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > NOW()
         LIMIT 1`,
        [tokenHash]
    );
    return rows[0] || null;
}

// Middleware para verificar permissão de Administrador / Professor (recebe apenas req, res, next)
async function verificarPermissaoAdmin(req, res, next) {
    try {
        let usuario = null;
        try {
            usuario = await obterUsuarioDaSessaoNoMiddleware(req);
        } catch (erroSessao) {
            usuario = null;
        }

        if (!usuario) {
            return res.status(401).json({ 
                sucesso: false, 
                erro: 'Acesso negado. Faça login para continuar.' 
            });
        }

        if (usuario.perfil !== 'admin' && usuario.perfil !== 'professor' && usuario.tipo !== 'admin' && usuario.tipo !== 'professor') {
            return res.status(403).json({ 
                sucesso: false, 
                erro: 'Acesso negado. Apenas administradores e professores podem realizar esta ação.' 
            });
        }

        req.usuario = usuario; 
        req.usuarioSessao = usuario; 
        next(); 
    } catch (erro) {
        console.error('Erro no middleware de autorização:', erro);
        return res.status(500).json({ sucesso: false, erro: 'Erro interno ao validar permissões.' });
    }
}

module.exports = { verificarPermissaoAdmin };