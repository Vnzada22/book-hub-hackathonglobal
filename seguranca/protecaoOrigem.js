/** Proteção contra requisições cross-site com cookies de sessão. */
function protegerOrigem(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  const host = req.get('host');
  const allowed = new Set([
    ...(process.env.CORS_ORIGIN || '').split(','),
    process.env.AUTH_BASE_URL || '',
    ...(process.env.NODE_ENV === 'production' ? [] : [`http://${host}`, `https://${host}`, 'http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'])
  ].map(s => s.trim()).filter(Boolean));
  // A ausência de Origin é aceita em desenvolvimento (testes e clientes não navegador).
  // Em produção a origem deve ser explícita para evitar CSRF em sessões por cookie.
  if ((origin && !allowed.has(origin)) || (!origin && process.env.NODE_ENV === 'production')) {
    return res.status(403).json({ erro: 'Origem da requisição não autorizada.' });
  }
  next();
}
module.exports = { protegerOrigem };
