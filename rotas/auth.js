const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { verifyMessage } = require('ethers');

const { verificarPermissaoAdmin } = require('../seguranca/autorizacao');
const { db } = require('../configuracao/db');

// Rate limiting em memória
const loginAttempts = new Map();
const emailCodeAttempts = new Map();

function hashAuthValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function rateLimitLogin(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const key = `login:${ip}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 5;
  
  const attempts = loginAttempts.get(key) || [];
  const recentAttempts = attempts.filter(time => now - time < windowMs);
  
  if (recentAttempts.length >= maxAttempts) {
    return res.status(429).json({ 
      erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' 
    });
  }
  
  recentAttempts.push(now);
  loginAttempts.set(key, recentAttempts);
  next();
}

function rateLimitEmailCode(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const key = `email_code:${ip}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const maxAttempts = 3;
  
  const attempts = emailCodeAttempts.get(key) || [];
  const recentAttempts = attempts.filter(time => now - time < windowMs);
  
  if (recentAttempts.length >= maxAttempts) {
    return res.status(429).json({ 
      erro: 'Muitas solicitações de código. Tente novamente em 1 hora.' 
    });
  }
  
  recentAttempts.push(now);
  emailCodeAttempts.set(key, recentAttempts);
  next();
}

function csrfProtection(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
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
  const tokenHash = hashAuthValue(token);
  const { rows } = await db.query(
    `SELECT u.* FROM public.auth_sessions s
     JOIN public.usuarios u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

// Um cadastro iniciado por OAuth não equivale a um perfil confirmado.
// O servidor consulta o estado real do banco, e não o localStorage.
function precisaCompletarPerfil(usuario) {
  return usuario?.onboarding_completed !== true || !String(usuario?.username || '').trim();
}
function cookieSeguroParaRequisicao(req) {
  // Secure é obrigatório em produção remota; localhost HTTP é permitido apenas em desenvolvimento local.
  return process.env.NODE_ENV === 'production' && !['localhost', '127.0.0.1'].includes(req.hostname);
}

function exigirAutenticacao(req, res, next) {
  obterUsuarioDaSessao(req).then(usuario => {
    if (!usuario) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login novamente.' });
    req.usuario = usuario;
    next();
  }).catch(error => {
    console.error('Falha ao verificar sessão:', error.message);
    if (error.code === '42703') {
      return res.status(503).json({ erro: 'O banco precisa da migração de primeiro acesso. Contate a administração; sua sessão não foi encerrada.', codigo: 'DATABASE_MIGRATION_REQUIRED' });
    }
    return res.status(503).json({ erro: 'Não foi possível verificar a sessão no banco. Tente novamente.' });
  });
}

// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================

// OAuth Google
router.get('/google', (req, res) => {
  const state = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ erro: 'Google OAuth não configurado.' });
  }
  
  db.query(
    `INSERT INTO public.oauth_states (state, provider, expires_at) VALUES ($1, 'google', $2)
     ON CONFLICT (state) DO UPDATE SET provider = EXCLUDED.provider, expires_at = EXCLUDED.expires_at`,
    [state, expiresAt]
  ).catch(() => {});
  
  const redirectUri = `${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/api/auth/google/callback`;
  const scope = 'openid email profile';
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}&access_type=offline&prompt=consent`;
  
  res.redirect(authUrl);
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.redirect(`${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/login?error=google_cancelled`);
  }
  
  if (!code || !state) {
    return res.redirect(`${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/login?error=invalid_callback`);
  }
  
  try {
    const { rows: stateRows } = await db.query(
      `SELECT * FROM public.oauth_states WHERE state = $1 AND provider = 'google' AND expires_at > NOW() LIMIT 1`,
      [state]
    );
    
    if (!stateRows.length) {
      return res.redirect(`${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/login?error=invalid_state`);
    }
    
    await db.query('DELETE FROM public.oauth_states WHERE state = $1', [state]);
    
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/api/auth/google/callback`,
        grant_type: 'authorization_code'
      })
    });
    
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(tokenData.error_description || 'Falha ao obter token');
    }
    
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    
    const userData = await userRes.json();
    // Um e-mail informado pelo provedor não é necessariamente verificado.
    // O endpoint userinfo v2 retorna verified_email para contas Google válidas.
    if (!userRes.ok || !userData.email || userData.verified_email !== true) {
      throw new Error('O Google não confirmou um endereço de e-mail verificado.');
    }
    
    const email = userData.email.toLowerCase();
    const nome = userData.name || email.split('@')[0];
    
    let { rows: usuarios } = await db.query('SELECT * FROM public.usuarios WHERE LOWER(email) = $1 LIMIT 1', [email]);
    let usuario;
    if (!usuarios.length) {
      // Username só será escolhido na configuração do perfil, nunca derivado do Gmail.
      const { rows: newUser } = await db.query(
        `INSERT INTO public.usuarios (email, nome, username, tipo, data_cadastro, onboarding_completed)
         VALUES ($1, $2, NULL, 'aluno', NOW(), FALSE) RETURNING *`,
        [email, nome]
      );
      usuario = newUser[0];
    } else {
      usuario = usuarios[0];
      // Compatibilidade: versões anteriores geravam username a partir do e-mail.
      // Se essa conta Google nunca concluiu a nova etapa, reabre o primeiro acesso.
      // A migração corrige os registros legados; aqui apenas respeitamos o estado do banco.
    }
    
    await db.query(
      `INSERT INTO public.oauth_accounts (provider, provider_user_id, user_id)
       VALUES ('google', $1, $2)
       ON CONFLICT (provider, provider_user_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [userData.id, usuario.id]
    );
    
    await db.query(
      `INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at)
       VALUES ($1, 'google', $2, NOW())
       ON CONFLICT (method, provider_user_id) DO UPDATE SET verified_at = NOW(), last_login_at = NOW()
       WHERE auth_identities.user_id = EXCLUDED.user_id`,
      [usuario.id, userData.id]
    );
    
    // O Google já atestou a posse do endereço informado (verified_email=true).
    // Registramos essa verificação para que o primeiro acesso não fique preso no
    // fluxo de handoff. Se o usuário editar o e-mail no formulário, será exigido OTP.
    await db.query(
      `INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at)
       VALUES ($1, 'email', $2, NOW())
       ON CONFLICT (method, provider_user_id) DO UPDATE SET verified_at = NOW()
       WHERE auth_identities.user_id = EXCLUDED.user_id`,
      [usuario.id, email]
    );

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashAuthValue(token);
    await db.query(
      `INSERT INTO public.auth_sessions (token_hash, user_id, expires_at, created_at, last_used_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days', NOW(), NOW())`,
      [tokenHash, usuario.id]
    );
    
    res.cookie('bookhub_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSeguroParaRequisicao(req),
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    });
    
    res.redirect(precisaCompletarPerfil(usuario) ? '/perfil/completar.html' : '/');
  } catch (error) {
    console.error('Erro no callback Google:', error);
    res.redirect(`${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/login?error=google_failed`);
  }
});

// OAuth X (Twitter) com PKCE
router.get('/x', (req, res) => {
  const state = crypto.randomBytes(32).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url').replace(/=/g, '');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ erro: 'X OAuth não configurado.' });
  }
  
  db.query(
    `INSERT INTO public.oauth_states (state, provider, code_verifier, expires_at) 
     VALUES ($1, 'x', $2, $3)
     ON CONFLICT (state) DO UPDATE SET provider = EXCLUDED.provider, code_verifier = EXCLUDED.code_verifier, expires_at = EXCLUDED.expires_at`,
    [state, codeVerifier, expiresAt]
  ).catch(() => {});
  
  const redirectUri = `${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/api/auth/x/callback`;
  const scope = 'tweet.read users.read offline.access';
  const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  
  res.redirect(authUrl);
});

router.get('/x/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.redirect(`${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/login?error=x_cancelled`);
  }
  
  if (!code || !state) {
    return res.redirect(`${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/login?error=invalid_callback`);
  }
  
  try {
    const { rows: stateRows } = await db.query(
      `SELECT * FROM public.oauth_states WHERE state = $1 AND provider = 'x' AND expires_at > NOW() LIMIT 1`,
      [state]
    );
    
    if (!stateRows.length) {
      return res.redirect(`${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/login?error=invalid_state`);
    }
    
    const codeVerifier = stateRows[0].code_verifier;
    await db.query('DELETE FROM public.oauth_states WHERE state = $1', [state]);
    
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/api/auth/x/callback`,
        code_verifier: codeVerifier
      })
    });
    
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(tokenData.error_description || 'Falha ao obter token');
    }
    
    const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=name,username', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    
    const userData = await userRes.json();
    if (!userData.data?.id) {
      throw new Error('ID não fornecido pelo X');
    }
    
    const providerUserId = userData.data.id;
    const nome = userData.data.name || userData.data.username;
    
    let { rows: usuarios } = await db.query('SELECT * FROM public.usuarios WHERE wallet = $1 LIMIT 1', [`x_${providerUserId}`]);
    let usuario;
    let isNewUser = false;
    
    if (!usuarios.length) {
      const { rows: newUser } = await db.query(
        `INSERT INTO public.usuarios (wallet, nome, username, tipo, data_cadastro)
         VALUES ($1, $2, $3, 'aluno', NOW()) RETURNING *`,
        [`x_${providerUserId}`, nome, userData.data.username]
      );
      usuario = newUser[0];
      isNewUser = true;
    } else {
      usuario = usuarios[0];
    }
    
    await db.query(
      `INSERT INTO public.oauth_accounts (provider, provider_user_id, user_id)
       VALUES ('x', $1, $2)
       ON CONFLICT (provider, provider_user_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [providerUserId, usuario.id]
    );
    
    await db.query(
      `INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at)
       VALUES ($1, 'x', $2, NOW())
       ON CONFLICT (method, provider_user_id) DO UPDATE SET verified_at = NOW(), last_login_at = NOW()
       WHERE auth_identities.user_id = EXCLUDED.user_id`,
      [usuario.id, providerUserId]
    );
    
    const requireEmailVerification = isNewUser || !usuario.email;
    
    if (requireEmailVerification) {
      const handoffToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = hashAuthValue(handoffToken);
      await db.query(
        `INSERT INTO public.oauth_handoffs (token_hash, user_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
        [tokenHash, usuario.id]
      );
      return res.redirect(`${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/login?oauth_code=${handoffToken}&provider=x`);
    }
    
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashAuthValue(token);
    await db.query(
      `INSERT INTO public.auth_sessions (token_hash, user_id, expires_at, created_at, last_used_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days', NOW(), NOW())`,
      [tokenHash, usuario.id]
    );
    
    res.cookie('bookhub_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSeguroParaRequisicao(req),
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    });
    
    res.redirect(precisaCompletarPerfil(usuario) ? '/perfil/completar.html' : '/');
  } catch (error) {
    console.error('Erro no callback X:', error);
    res.redirect(`${process.env.AUTH_BASE_URL || 'http://localhost:3000'}/login?error=x_failed`);
  }
});

router.post('/email/send-code', rateLimitEmailCode, csrfProtection, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  }

  const ip = req.ip || req.connection.remoteAddress;
  
  const { rows: rateCheckEmail } = await db.query(
    `SELECT COUNT(*) as count FROM public.email_verification_codes 
     WHERE email = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [email]
  );
  
  if (parseInt(rateCheckEmail[0].count) >= 3) {
    return res.status(429).json({ erro: 'Muitas solicitações para este e-mail. Aguarde antes de pedir novo código.' });
  }
  
  const { rows: rateCheckIp } = await db.query(
    `SELECT COUNT(*) as count FROM public.email_code_logs 
     WHERE ip = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [ip]
  );
  
  if (parseInt(rateCheckIp[0].count) >= 10) {
    return res.status(429).json({ erro: 'Muitas solicitações deste IP. Aguarde um momento.' });
  }

  const code = String(crypto.randomInt(100000, 999999));
  const codeHash = crypto.createHmac('sha256', process.env.AUTH_TOKEN_SECRET).update(`${email}:${code}`).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      
      await client.query(
        `INSERT INTO public.email_verification_codes (email, code_hash, expires_at, attempts, created_at)
         VALUES ($1, $2, $3, 0, NOW())
         ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, verified_at = NULL, created_at = NOW()`,
        [email, codeHash, expiresAt]
      );
      
      await client.query(
        `INSERT INTO public.email_code_logs (email, ip, created_at)
         VALUES ($1, $2, NOW())`,
        [email, ip]
      );
      
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    if (process.env.RESEND_API_KEY) {
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: process.env.AUTH_EMAIL_FROM || 'BookHub <onboarding@resend.dev>',
            to: [email],
            subject: 'Seu código de verificação BookHub',
            html: `<p>Seu código de verificação é: <strong>${code}</strong></p><p>Expira em 10 minutos.</p>`
          })
        });
        
        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          throw new Error(`Resend API error: ${emailResponse.status} - ${errorText}`);
        }
      } catch (emailError) {
        console.error('Falha ao enviar email via Resend:', emailError.message);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`📧 Código de verificação para ${email}: ${code}`);
        } else {
          return res.status(500).json({ erro: 'Falha ao enviar código de verificação. Tente novamente.' });
        }
      }
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`📧 Código de verificação para ${email}: ${code}`);
    }

    res.json({ ok: true, mensagem: 'Código de verificação enviado com sucesso.' });
  } catch (error) {
    console.error('Erro ao enviar código:', error);
    res.status(500).json({ erro: 'Não foi possível enviar o código.' });
  }
});

router.post('/email/verify-code', rateLimitLogin, csrfProtection, async (req, res) => {
  const { email, code, oauthTicket } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ erro: 'E-mail e código são obrigatórios.' });
  }

  const emailLower = String(email).trim().toLowerCase();
  const codeStr = String(code).trim();

  try {
    const { rows } = await db.query(
      `SELECT code_hash, expires_at, attempts FROM public.email_verification_codes WHERE email = $1 LIMIT 1`,
      [emailLower]
    );

    if (!rows.length) {
      return res.status(400).json({ erro: 'Código não solicitado ou expirado.' });
    }

    const record = rows[0];
    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ erro: 'Código expirado. Solicite um novo.' });
    }

    if (record.attempts >= 5) {
      return res.status(400).json({ erro: 'Muitas tentativas. Solicite um novo código.' });
    }

    const expectedHash = crypto.createHmac('sha256', process.env.AUTH_TOKEN_SECRET).update(`${emailLower}:${codeStr}`).digest('hex');
    if (record.code_hash !== expectedHash) {
      await db.query('UPDATE public.email_verification_codes SET attempts = attempts + 1 WHERE email = $1', [emailLower]);
      return res.status(400).json({ erro: 'Código inválido.' });
    }

    await db.query(
      `UPDATE public.email_verification_codes SET verified_at = NOW(), code_hash = NULL WHERE email = $1`,
      [emailLower]
    );

    let { rows: usuarios } = await db.query('SELECT * FROM public.usuarios WHERE LOWER(email) = $1 LIMIT 1', [emailLower]);
    let usuario;
    if (!usuarios.length) {
      const { rows: newUser } = await db.query(
        `INSERT INTO public.usuarios (email, nome, username, tipo, data_cadastro)
         VALUES ($1, $2, $3, 'aluno', NOW()) RETURNING *`,
        [emailLower, emailLower.split('@')[0], emailLower.split('@')[0]]
      );
      usuario = newUser[0];
    } else {
      usuario = usuarios[0];
    }

    await db.query(
      `INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at)
       VALUES ($1, 'email', $2, NOW())
       ON CONFLICT (method, provider_user_id) DO UPDATE SET verified_at = NOW() WHERE auth_identities.user_id = EXCLUDED.user_id`,
      [usuario.id, emailLower]
    );

    if (oauthTicket) {
      const tokenHash = hashAuthValue(oauthTicket);
      const { rows: handoffRows } = await db.query(
        `SELECT user_id FROM public.oauth_handoffs WHERE token_hash = $1 AND expires_at > NOW() LIMIT 1`,
        [tokenHash]
      );
      
      if (handoffRows.length && handoffRows[0].user_id === usuario.id) {
        await db.query('DELETE FROM public.oauth_handoffs WHERE token_hash = $1', [tokenHash]);
      }
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashAuthValue(token);
    await db.query(
      `INSERT INTO public.auth_sessions (token_hash, user_id, expires_at, created_at, last_used_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days', NOW(), NOW())`,
      [tokenHash, usuario.id]
    );

    res.cookie('bookhub_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSeguroParaRequisicao(req),
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    res.json({ ok: true, mensagem: 'E-mail verificado com sucesso.', usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome, tipo: usuario.tipo } });
  } catch (error) {
    console.error('Erro ao verificar código:', error);
    res.status(500).json({ erro: 'Erro ao verificar código.' });
  }
});

router.post('/wallet/challenge', rateLimitEmailCode, csrfProtection, async (req, res) => {
  const wallet = String(req.body?.wallet || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ erro: 'Endereço de carteira inválido.' });
  }

  const nonce = crypto.randomBytes(32).toString('hex');
  const message = `BookHub login\n\nDomain: ${req.get('host') || 'localhost'}\nNonce: ${nonce}\nTimestamp: ${Date.now()}\nPurpose: Autenticação via MetaMask`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await db.query(
      `INSERT INTO public.wallet_login_challenges (wallet, message, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (wallet) DO UPDATE SET message = EXCLUDED.message, expires_at = EXCLUDED.expires_at`,
      [wallet, message, expiresAt]
    );
    res.json({ ok: true, message: 'Desafio gerado.', nonce: message });
  } catch (error) {
    console.error('Erro ao gerar desafio:', error);
    res.status(500).json({ erro: 'Erro ao gerar desafio.' });
  }
});

router.post('/wallet/verify', rateLimitLogin, csrfProtection, async (req, res) => {
  const { wallet, signature } = req.body || {};
  const walletLower = String(wallet || '').trim().toLowerCase();
  
  if (!/^0x[a-f0-9]{40}$/.test(walletLower)) {
    return res.status(400).json({ erro: 'Carteira inválida.' });
  }
  if (!signature) {
    return res.status(400).json({ erro: 'Assinatura obrigatória.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT message FROM public.wallet_login_challenges WHERE wallet = $1 AND expires_at > NOW() LIMIT 1`,
      [walletLower]
    );

    if (!rows.length) {
      return res.status(400).json({ erro: 'Desafio não encontrado ou expirado. Solicite novo desafio.' });
    }

    const message = rows[0].message;
    let recoveredAddress;
    try {
      recoveredAddress = verifyMessage(message, signature);
    } catch (e) {
      return res.status(400).json({ erro: 'Assinatura inválida.' });
    }

    if (recoveredAddress.toLowerCase() !== walletLower) {
      return res.status(400).json({ erro: 'Assinatura não corresponde à carteira.' });
    }

    await db.query('DELETE FROM public.wallet_login_challenges WHERE wallet = $1', [walletLower]);

    let { rows: usuarios } = await db.query('SELECT * FROM public.usuarios WHERE LOWER(wallet) = $1 LIMIT 1', [walletLower]);
    let usuario;
    if (!usuarios.length) {
      const { rows: newUser } = await db.query(
        `INSERT INTO public.usuarios (wallet, nome, username, tipo, data_cadastro)
         VALUES ($1, $2, $3, 'aluno', NOW()) RETURNING *`,
        [walletLower, `Wallet ${walletLower.slice(0, 6)}...${walletLower.slice(-4)}`, walletLower.slice(2, 10)]
      );
      usuario = newUser[0];
    } else {
      usuario = usuarios[0];
    }

    await db.query(
      `INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at)
       VALUES ($1, 'metamask', $2, NOW())
       ON CONFLICT (method, provider_user_id) DO UPDATE SET verified_at = NOW(), last_login_at = NOW()
       WHERE auth_identities.user_id = EXCLUDED.user_id`,
      [usuario.id, walletLower]
    );

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashAuthValue(token);
    await db.query(
      `INSERT INTO public.auth_sessions (token_hash, user_id, expires_at, created_at, last_used_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days', NOW(), NOW())`,
      [tokenHash, usuario.id]
    );

    res.cookie('bookhub_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSeguroParaRequisicao(req),
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    res.json({ ok: true, mensagem: 'Carteira verificada com sucesso.', usuario: { id: usuario.id, wallet: usuario.wallet, nome: usuario.nome, tipo: usuario.tipo } });
  } catch (error) {
    console.error('Erro ao verificar carteira:', error);
    res.status(500).json({ erro: 'Erro ao verificar carteira.' });
  }
});

// Validação Base58 própria somente para chaves públicas (32 bytes); assinaturas em hex.
const SOLANA_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function decodeSolanaAddress(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) throw new Error('Carteira Solana inválida.');
  let number = 0n;
  for (const c of value) {
    const index = SOLANA_ALPHABET.indexOf(c);
    if (index < 0) throw new Error('Carteira Solana inválida.');
    number = number * 58n + BigInt(index);
  }
  const bytes = [];
  while (number > 0n) { bytes.unshift(Number(number & 255n)); number >>= 8n; }
  const zeroes = value.match(/^1*/)[0].length;
  const decoded = Buffer.from([...Array(zeroes).fill(0), ...bytes]);
  if (decoded.length !== 32) throw new Error('Chave pública Solana inválida.');
  return decoded;
}

router.post('/solana/challenge', rateLimitEmailCode, csrfProtection, async (req,res) => {
  const wallet = String(req.body?.wallet || '');
  try { decodeSolanaAddress(wallet); } catch { return res.status(400).json({ erro: 'Endereço Solana inválido.' }); }
  const nonce = crypto.randomBytes(32).toString('hex');
  const domain = req.get('host') || 'localhost';
  const message = `BookHub — Entrar com Solana\nDomínio: ${domain}\nCarteira: ${wallet}\nNonce: ${nonce}\nAção: autenticação, sem transação financeira`;
  try {
    await db.query(`INSERT INTO public.wallet_login_challenges (wallet,message,expires_at)
      VALUES ($1,$2,NOW()+INTERVAL '5 minutes') ON CONFLICT (wallet)
      DO UPDATE SET message=EXCLUDED.message,expires_at=EXCLUDED.expires_at`, [`solana:${wallet}`, message]);
    return res.json({ ok:true, message });
  } catch(err) { console.error('Erro ao gerar desafio Solana:',err); return res.status(500).json({erro:'Não foi possível preparar o login.'}); }
});

router.post('/solana/verify', rateLimitLogin, csrfProtection, async (req,res) => {
  const wallet = String(req.body?.wallet || '');
  const signature = String(req.body?.signature || '');
  let address;
  try { address = decodeSolanaAddress(wallet); } catch { return res.status(400).json({erro:'Endereço Solana inválido.'}); }
  if (!/^[a-fA-F0-9]{128}$/.test(signature)) return res.status(400).json({erro:'Assinatura inválida.'});
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const challenge = await client.query(`DELETE FROM public.wallet_login_challenges
      WHERE wallet=$1 AND expires_at>NOW() RETURNING message`,[`solana:${wallet}`]);
    if (!challenge.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({erro:'Desafio expirado ou já utilizado.'}); }
    const publicKey = crypto.createPublicKey({ key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),address]), format:'der',type:'spki' });
    const valid = crypto.verify(null,Buffer.from(challenge.rows[0].message,'utf8'),publicKey,Buffer.from(signature,'hex'));
    if (!valid) { await client.query('ROLLBACK'); return res.status(401).json({erro:'Assinatura não corresponde à carteira.'}); }
    const existing = await client.query(`SELECT u.* FROM public.usuarios u JOIN public.auth_identities i ON i.user_id=u.id
      WHERE i.method='solana' AND i.provider_user_id=$1 LIMIT 1`,[wallet]);
    let usuario = existing.rows[0];
    if (!usuario) {
      const created = await client.query(`INSERT INTO public.usuarios (wallet,nome,username,tipo,data_cadastro)
        VALUES ($1,$2,$3,'aluno',NOW()) RETURNING *`,[`solana:${wallet}`,`Solana ${wallet.slice(0,5)}...${wallet.slice(-4)}`,`sol_${crypto.randomBytes(5).toString('hex')}`]);
      usuario=created.rows[0];
      await client.query(`INSERT INTO public.auth_identities (user_id,method,provider_user_id,verified_at)
        VALUES ($1,'solana',$2,NOW())`,[usuario.id,wallet]);
    } else {
      await client.query(`UPDATE public.auth_identities SET last_login_at=NOW() WHERE method='solana' AND provider_user_id=$1`,[wallet]);
    }
    const token=crypto.randomBytes(32).toString('base64url');
    await client.query(`INSERT INTO public.auth_sessions (token_hash,user_id,expires_at,created_at,last_used_at)
      VALUES ($1,$2,NOW()+INTERVAL '30 days',NOW(),NOW())`,[hashAuthValue(token),usuario.id]);
    await client.query('COMMIT');
    res.cookie('bookhub_session',token,{httpOnly:true,sameSite:'lax',secure:cookieSeguroParaRequisicao(req),maxAge:30*24*60*60*1000,path:'/'});
    return res.json({ok:true,usuario:{id:usuario.id,nome:usuario.nome,avatar:usuario.avatar,tipo:usuario.tipo,wallet}});
  } catch(err) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    console.error('Erro na autenticação Solana:',err);
    return res.status(500).json({erro:'Não foi possível concluir o login Solana.'});
  } finally { client?.release(); }
});

router.post('/oauth/consume', csrfProtection, async (req, res) => {
  const { code, token, oauth_code, oauthTicket } = req.body || {};
  const handoffToken = token || code || oauth_code || oauthTicket;
  if (!handoffToken) {
    return res.status(400).json({ erro: 'Token de handoff obrigatório.' });
  }

  const tokenHash = hashAuthValue(handoffToken);

  try {
    const client = await db.connect();
    try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `DELETE FROM public.oauth_handoffs WHERE token_hash = $1 AND expires_at > NOW() RETURNING user_id`,
      [tokenHash]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Token de handoff inválido ou expirado.' });
    }

    const userId = rows[0].user_id;

    const { rows: usuarios } = await client.query('SELECT * FROM public.usuarios WHERE id = $1 LIMIT 1', [userId]);
    if (!usuarios.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    const usuario = usuarios[0];

    const { rows: emailIdentity } = await client.query(
      `SELECT verified_at FROM public.auth_identities WHERE user_id = $1 AND method = 'email' AND verified_at IS NOT NULL LIMIT 1`,
      [userId]
    );

    const hasVerifiedEmail = emailIdentity.length > 0;

    if (!hasVerifiedEmail) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        erro: 'Verificação de e-mail obrigatória para esta conta.', 
        requerEmail: true,
        handoffToken: handoffToken
      });
    }



    const sessionToken = crypto.randomBytes(32).toString('base64url');
    const sessionTokenHash = hashAuthValue(sessionToken);
    await client.query(
      `INSERT INTO public.auth_sessions (token_hash, user_id, expires_at, created_at, last_used_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days', NOW(), NOW())`,
      [sessionTokenHash, usuario.id]
    );

    await client.query('COMMIT');
    res.cookie('bookhub_session', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSeguroParaRequisicao(req),
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    res.json({ ok: true, mensagem: 'Autenticação OAuth consumida.', usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome, tipo: usuario.tipo } });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  } catch (error) {
    console.error('Erro ao consumir OAuth:', error);
    res.status(500).json({ erro: 'Erro ao processar autenticação OAuth.' });
  }
});

router.post('/login', rateLimitLogin, csrfProtection, async (req, res) => {
  const { email, wallet, password, code } = req.body || {};
  
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim().toLowerCase())) {
    return res.status(400).json({ erro: 'E-mail inválido.' });
  }

  const identification = String(email || wallet || '').trim().toLowerCase();
  if (!identification) return res.status(400).json({ erro: 'Identificação obrigatória.' });

  try {
    let { rows: usuarios } = await db.query('SELECT * FROM public.usuarios WHERE LOWER(email) = $1 OR LOWER(wallet) = $1 LIMIT 1', [identification]);
    
    if (!usuarios.length) {
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }
    
    const usuario = usuarios[0];

    if (email) {
      if (!code) {
        return res.status(400).json({ erro: 'Código de verificação obrigatório.' });
      }
      
      const emailLower = String(email).trim().toLowerCase();
      const { rows: verification } = await db.query(
        `SELECT code_hash, expires_at, attempts, verified_at FROM public.email_verification_codes WHERE email = $1 LIMIT 1`,
        [emailLower]
      );
      
      if (!verification.length) {
        return res.status(401).json({ erro: 'Código não solicitado ou expirado.' });
      }
      
      const record = verification[0];
      if (new Date(record.expires_at) < new Date()) {
        return res.status(401).json({ erro: 'Código expirado. Solicite um novo.' });
      }
      
      if (record.attempts >= 5) {
        return res.status(401).json({ erro: 'Muitas tentativas. Solicite um novo código.' });
      }
      
      const expectedHash = crypto.createHmac('sha256', process.env.AUTH_TOKEN_SECRET).update(`${emailLower}:${code}`).digest('hex');
      if (record.code_hash !== expectedHash) {
        await db.query('UPDATE public.email_verification_codes SET attempts = attempts + 1 WHERE email = $1', [emailLower]);
        return res.status(401).json({ erro: 'Código inválido.' });
      }
      
      await db.query(
        `UPDATE public.email_verification_codes SET verified_at = NOW(), code_hash = NULL WHERE email = $1`,
        [emailLower]
      );
      
      await db.query(
        `INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at)
         VALUES ($1, 'email', $2, NOW())
         ON CONFLICT (method, provider_user_id) DO UPDATE SET verified_at = NOW()`,
        [usuario.id, emailLower]
      );
    }

    if (wallet) {
      const walletLower = String(wallet).trim().toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(walletLower)) {
        return res.status(400).json({ erro: 'Endereço de carteira inválido.' });
      }
      
      const { rows: identity } = await db.query(
        `SELECT verified_at FROM public.auth_identities WHERE user_id = $1 AND method = 'metamask' AND provider_user_id = $2 LIMIT 1`,
        [usuario.id, walletLower]
      );
      if (!identity.length || !identity[0].verified_at) {
        return res.status(401).json({ erro: 'Carteira não verificada. Complete o desafio de assinatura.' });
      }
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashAuthValue(token);
    await db.query(
      `INSERT INTO public.auth_sessions (token_hash, user_id, expires_at, created_at, last_used_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days', NOW(), NOW())`,
      [tokenHash, usuario.id]
    );

    res.cookie('bookhub_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSeguroParaRequisicao(req),
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    res.json({ ok: true, novoUsuario: false, mensagem: 'Autenticado com sucesso.', usuario: { id: usuario.id, email: usuario.email, wallet: usuario.wallet, nome: usuario.nome, tipo: usuario.tipo } });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({ erro: 'Erro ao autenticar.' });
  }
});

router.post('/register', rateLimitLogin, csrfProtection, async (req, res) => {
  const { email, nome, code } = req.body || {};
  if (!email || !nome || !code) {
    return res.status(400).json({ erro: 'Dados incompletos para cadastro. E-mail, nome e código de verificação são obrigatórios.' });
  }

  const emailLower = String(email).trim().toLowerCase();
  const nomeTrim = String(nome).trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
    return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  }

  try {
    const { rows: verification } = await db.query(
      `SELECT code_hash, expires_at, attempts, verified_at FROM public.email_verification_codes WHERE email = $1 LIMIT 1`,
      [emailLower]
    );
    
    if (!verification.length) {
      return res.status(400).json({ erro: 'Código não solicitado ou expirado.' });
    }
    
    const record = verification[0];
    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ erro: 'Código expirado. Solicite um novo.' });
    }
    
    if (record.attempts >= 5) {
      return res.status(400).json({ erro: 'Muitas tentativas. Solicite um novo código.' });
    }
    
    const expectedHash = crypto.createHmac('sha256', process.env.AUTH_TOKEN_SECRET).update(`${emailLower}:${code}`).digest('hex');
    if (record.code_hash !== expectedHash) {
      await db.query('UPDATE public.email_verification_codes SET attempts = attempts + 1 WHERE email = $1', [emailLower]);
      return res.status(400).json({ erro: 'Código inválido.' });
    }
    
    await db.query(
      `UPDATE public.email_verification_codes SET verified_at = NOW(), code_hash = NULL WHERE email = $1`,
      [emailLower]
    );

    let { rows: usuarios } = await db.query('SELECT * FROM public.usuarios WHERE LOWER(email) = $1 LIMIT 1', [emailLower]);
    
    if (usuarios.length) {
      return res.status(409).json({ erro: 'Conta já existe para este e-mail. Faça login.' });
    }
    
    const { rows: newUser } = await db.query(
      `INSERT INTO public.usuarios (email, nome, username, tipo, data_cadastro)
       VALUES ($1, $2, $3, 'aluno', NOW()) RETURNING *`,
      [emailLower, nomeTrim, emailLower.split('@')[0]]
    );
    const usuario = newUser[0];

    await db.query(
      `INSERT INTO public.auth_identities (user_id, method, provider_user_id, verified_at)
       VALUES ($1, 'email', $2, NOW())
       ON CONFLICT (method, provider_user_id) DO UPDATE SET verified_at = NOW()`,
      [usuario.id, emailLower]
    );

    // Cadastro também deve autenticar: sem cookie a interface voltaria ao login.
    const sessionToken = crypto.randomBytes(32).toString('base64url');
    await db.query(
      `INSERT INTO public.auth_sessions (token_hash, user_id, expires_at, created_at, last_used_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days', NOW(), NOW())`,
      [hashAuthValue(sessionToken), usuario.id]
    );
    res.cookie('bookhub_session', sessionToken, {
      httpOnly: true, sameSite: 'lax', secure: cookieSeguroParaRequisicao(req),
      maxAge: 30 * 24 * 60 * 60 * 1000, path: '/'
    });
    res.status(201).json({ ok: true, mensagem: 'Conta criada com sucesso.', usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome, tipo: usuario.tipo } });
  } catch (error) {
    console.error('Erro ao registrar:', error);
    if (error.code === '23505') {
      return res.status(409).json({ erro: 'Conta já existe para este e-mail.' });
    }
    res.status(500).json({ erro: 'Erro ao criar conta.' });
  }
});

router.post('/logout', csrfProtection, async (req, res) => {
  const cookies = String(req.headers.cookie || '').split(';');
  const cookie = cookies.map(parte => parte.trim()).find(parte => parte.startsWith('bookhub_session='));
  
  if (cookie) {
    const token = cookie.slice('bookhub_session='.length);
    const tokenHash = hashAuthValue(token);
    try {
      await db.query('DELETE FROM public.auth_sessions WHERE token_hash = $1', [tokenHash]);
    } catch (e) {
      console.warn('Erro ao remover sessão:', e.message);
    }
  }

  res.clearCookie('bookhub_session', {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSeguroParaRequisicao(req),
    path: '/'
  });

  res.json({ ok: true, mensagem: 'Sessão encerrada.' });
});

router.post('/logout-all', exigirAutenticacao, csrfProtection, async (req, res) => {
  try {
    await db.query('DELETE FROM public.auth_sessions WHERE user_id = $1', [req.usuario.id]);
    res.clearCookie('bookhub_session', {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSeguroParaRequisicao(req),
      path: '/'
    });
    res.json({ ok: true, mensagem: 'Todas as sessões encerradas.' });
  } catch (error) {
    console.error('Erro ao encerrar todas as sessões:', error);
    res.status(500).json({ erro: 'Erro ao encerrar sessões.' });
  }
});

// Cadastro de perfil: username definitivo escolhido pelo usuário, nunca derivado automaticamente do OAuth.
router.post('/onboarding/complete', exigirAutenticacao, csrfProtection, async (req, res) => {
  const nome = String(req.body?.nome || '').trim();
  const username = String(req.body?.username || '').trim().toLowerCase();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  if (nome.length < 2 || nome.length > 100 || !/^[a-z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({ erro: 'Informe um nome e um username de 3 a 24 caracteres (letras, números e _).' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  }
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, email, onboarding_completed FROM public.usuarios WHERE id=$1 FOR UPDATE', [req.usuario.id]);
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ erro:'Conta não encontrada.' }); }
    const usuario = rows[0];
    if (usuario.onboarding_completed) { await client.query('ROLLBACK'); return res.status(409).json({ erro:'Username já confirmado; não pode ser alterado.' }); }
    const taken = await client.query('SELECT id FROM public.usuarios WHERE LOWER(username)=$1 AND id<>$2 LIMIT 1', [username, usuario.id]);
    if (taken.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ erro:'Este username já está em uso.' }); }
    const other = await client.query('SELECT id FROM public.usuarios WHERE LOWER(email)=$1 AND id<>$2 LIMIT 1', [email, usuario.id]);
    if (other.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ erro:'Este e-mail já pertence a outra conta.' }); }
    const verified = await client.query("SELECT 1 FROM public.auth_identities WHERE user_id=$1 AND method='email' AND provider_user_id=$2 AND verified_at IS NOT NULL LIMIT 1", [usuario.id,email]);
    if (!verified.rows.length) {
      if (!/^\d{6}$/.test(code)) { await client.query('ROLLBACK'); return res.status(400).json({ erro:'Confirme o e-mail com o código de seis dígitos enviado.', requerCodigo:true }); }
      const codes = await client.query('SELECT code_hash, expires_at, attempts FROM public.email_verification_codes WHERE email=$1 FOR UPDATE', [email]);
      const record = codes.rows[0];
      if (!record || record.attempts >= 5 || new Date(record.expires_at) <= new Date() || !record.code_hash) { await client.query('ROLLBACK'); return res.status(400).json({ erro:'Código expirado ou indisponível. Solicite outro.' }); }
      const expected = crypto.createHmac('sha256',process.env.AUTH_TOKEN_SECRET).update(`${email}:${code}`).digest('hex');
      if (record.code_hash !== expected) {
        await client.query('UPDATE public.email_verification_codes SET attempts=attempts+1 WHERE email=$1',[email]);
        await client.query('COMMIT');
        return res.status(400).json({erro:'Código de verificação incorreto.'});
      }
      await client.query('UPDATE public.email_verification_codes SET verified_at=NOW(),code_hash=NULL WHERE email=$1',[email]);
      await client.query("INSERT INTO public.auth_identities(user_id,method,provider_user_id,verified_at) VALUES ($1,'email',$2,NOW()) ON CONFLICT(method,provider_user_id) DO UPDATE SET verified_at=NOW() WHERE auth_identities.user_id=EXCLUDED.user_id",[usuario.id,email]);
    }
    const result = await client.query('UPDATE public.usuarios SET nome=$1,username=$2,email=$3,onboarding_completed=TRUE, onboarding_confirmed_at=NOW() WHERE id=$4 RETURNING id,nome,username,email,onboarding_completed', [nome,username,email,usuario.id]);
    await client.query('COMMIT');
    return res.json({ ok:true, usuario:result.rows[0] });
  } catch(err) {
    if(client) await client.query('ROLLBACK').catch(()=>{});
    if(err.code==='23505') return res.status(409).json({erro:'Username ou e-mail já cadastrado.'});
    console.error('Erro ao concluir perfil:',err);
    return res.status(500).json({erro:'Não foi possível concluir o cadastro.'});
  } finally {client?.release();}
});

router.get('/perfil', exigirAutenticacao, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, nome, username, wallet, wallet_address, avatar, tipo, data_cadastro, onboarding_completed
       FROM public.usuarios WHERE id = $1 LIMIT 1`,
      [req.usuario.id]
    );
    
    if (!rows.length) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    
    res.json({ ok: true, usuario: rows[0] });
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    if (error.code === '42703') {
      return res.status(503).json({ erro: 'A estrutura do banco está desatualizada. É necessário aplicar a migração de primeiro acesso.', codigo: 'DATABASE_MIGRATION_REQUIRED' });
    }
    res.status(500).json({ erro: 'Erro ao buscar perfil.' });
  }
});

router.put('/perfil', exigirAutenticacao, csrfProtection, async (req, res) => {
  const corpo = req.body || {};
  const allowedFields = ['nome', 'username', 'avatar'];
  const updates = [];
  const values = [];
  let paramIndex = 1;

  for (const field of allowedFields) {
    if (corpo[field] !== undefined) {
      if (field === 'username') continue; // username é definitivo após o primeiro acesso
      updates.push(`${field} = $${paramIndex}`);
      values.push(String(corpo[field]).trim());
      paramIndex++;
    }
  }

  if (corpo.tipo || corpo.perfil || corpo.role) {
    return res.status(403).json({ erro: 'Não é permitido alterar o tipo de usuário.' });
  }

  if (!updates.length) {
    return res.status(400).json({ erro: 'Nenhum campo válido para atualizar.' });
  }

  values.push(req.usuario.id);

  try {
    const { rows } = await db.query(
      `UPDATE public.usuarios SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, email, nome, username, wallet, wallet_address, avatar, tipo, data_cadastro, onboarding_completed`,
      values
    );
    
    res.json({ ok: true, mensagem: 'Perfil atualizado com sucesso.', usuario: rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ erro: 'Erro ao atualizar perfil.' });
  }
});

module.exports = router;