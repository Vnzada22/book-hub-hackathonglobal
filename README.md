# 📚 BookHub

<div align="center">
  <img src="https://img.shields.io/badge/Status-Production%20Ready-4CAF50?style=for-the-badge&logo=book" alt="Status do projeto" />
  <img src="https://img.shields.io/badge/Type-Full%20Stack%20Web%20App-FF9800?style=for-the-badge" alt="Tipo do projeto" />
  <img src="https://img.shields.io/badge/Backend-Node.js%20%7C%20Express%205-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Backend" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL%20%7C%20Supabase-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="Database" />
  <img src="https://img.shields.io/badge/Frontend-HTML5%20%7C%20CSS3%20%7C%20Vanilla%20JS-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="Frontend" />
  <img src="https://img.shields.io/badge/Auth-JWT%20%7C%20OAuth%20%7C%20Web3-6A5ACD?style=for-the-badge" alt="Auth" />
  <img src="https://img.shields.io/badge/Tests-Jest-99424F?style=for-the-badge&logo=jest&logoColor=white" alt="Tests" />
</div>

<p align="center">
  <img src="https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1200&q=80" alt="Banner da biblioteca" width="100%" />
</p>

> **Plataforma completa de gestão de biblioteca escolar** — Catálogo, reservas, ranking sazonal, autenticação multi-fator (e-mail, Google, X, MetaMask), painel administrativo e IA para preenchimento bibliográfico.

---

## 🎯 Objetivo

O BookHub resolve a gestão de acervos escolares com:
- **Catálogo inteligente** com busca, filtros e IA para preenchimento automático de dados bibliográficos
- **Sistema de pré-reservas** com controle de exemplares físicos, aprovação admin e pontuação no ranking
- **Ranking sazonal** mensal com conquistas, histórico e prova criptográfica (Merkle root)
- **Autenticação robusta**: e-mail com código, Google OAuth 2.0, X OAuth 2.0 (PKCE), MetaMask (SIWE)
- **Painel administrativo** com filtros, busca, badges de pendentes, confirmações e UX otimizada
- **Segurança**: CSRF (origin exact-match), cookies HttpOnly/Secure/SameSite, rate limiting, XSS prevention (createElement/textContent)

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologias |
|--------|-------------|
| **Runtime** | Node.js 20+, Express 5 |
| **Database** | PostgreSQL (Supabase), Pool pg, migrations SQL |
| **Auth** | JWT em cookies HttpOnly, OAuth 2.0 (Google, X), SIWE (MetaMask), HMAC codes |
| **Frontend** | HTML5, CSS3 (custom properties, Grid/Flex), Vanilla ES6+ (modules, async/await) |
| **IA** | Google Gemini API (JSON structured output, batch ≤20) |
| **Testes** | Jest + Supertest (28 testes passing) |
| **Deploy** | Variáveis de ambiente (.env), health check `/health` |

---

## 📁 Estrutura do Projeto

```
book-hub-hackathonglobal-main/
├── configuracao/
│   └── db.js                    # Pool PostgreSQL + schema auto-migration
├── rotas/                       # Rotas modulares (api.js agrega)
│   ├── api.js                   # Entry point: /api/*
│   ├── auth.js                  # /api/auth/* - login, register, OAuth, session
│   ├── livros.js                # /api/livros/* - CRUD catálogo + batch + IA
│   ├── reservas.js              # /api/reservas/* - pré-reservas + exemplares
│   ├── ranking.js               # /api/ranking/* - temporadas, conquistas, histórico
│   └── ia.js                    # /api/ia/* - preencher/preencher-multiplo
├── seguranca/
│   └── autorizacao.js           # Middleware verificarPermissaoAdmin
├── utilitarios/
│   └── iaUtils.js               # Gemini prompt helpers
├── pagina_inicial/              # Catálogo público + reservas do aluno
│   ├── html/index.html
│   ├── html/reservas.html
│   ├── css/*.css
│   └── java/*.js
├── pagina_login/                # Login, OTP, registro, OAuth, MetaMask
│   ├── html/login.html
│   ├── css/*.css
│   └── js/login.js
├── pagina_perfil/               # Perfil, histórico, conquistas, edição
│   ├── html/perfil.html
│   ├── css/*.css
│   └── js/perfil.js
├── pagina_administrativa/       # Admin: livros, IA batch, exclusão c/ confirmação
│   ├── html/livros.html
│   ├── css/*.css
│   └── java/livros.js
├── pagina_ranking/              # Ranking sazonal, pódio, prova Merkle
│   ├── html/ranking.html
│   ├── css/*.css
│   └── js/ranking.js
├── supabase/migrations/
│   └── 20261027000000_consolidated_schema.sql  # Schema único versionado
├── tests/
│   ├── auth.test.js             # 28 testes: auth, OAuth, ranking, reservas, sessão
│   └── seguranca.test.js
├── server.js                    # Express app + static files + route registration
├── package.json
├── .env.example
└── README.md
```

---

## 🚀 Funcionalidades Principais

### 1. Catálogo de Livros (`/api/livros`)
- `GET /` — Lista pública com JOIN autores/editoras
- `GET /:id` — Detalhe do livro
- `POST /` — **Admin**: cria livro, resolve autor/editora (upsert), registra pontos `livro_cadastrado` (5 pts)
- `PUT /:id` — **Admin**: atualiza **todos** campos (título, autor, editora, gênero, capa, ano, páginas, idioma, resumo, disponibilidade), resolve FKs, valida números
- `DELETE /:id` — **Admin**: remove livro, preserva histórico de reservas (SET NULL), retorna contagem de reservas afetadas
- `POST /lote` — **Admin**: batch insert (≤20), retorna salvos/falhas com índices

### 2. Pré-Reservas (`/api/reservas`)
- `GET /` — **Admin**: lista todas com JOIN usuário + livro + autor, filtros status/busca/data
- `GET /usuario` — **Aluno**: próprias reservas (limit 20)
- `POST /` — **Aluno**: cria reserva, valida disponibilidade, impede duplicatas/conflitos, trava exemplar (`disponivel → reservado`) via `SELECT FOR UPDATE`
- `PUT /:id` — **Admin**: aprova/rejeita/cancela, transição de estados do exemplar (`reservado → emprestado → disponivel`), registra pontos `reserva_aprovada` (10 pts)
- `DELETE /:id` — **Owner/Admin**: cancela, libera exemplar

### 3. Ranking Sazonal (`/api/ranking`)
- `GET /?temporada=2025-01` — Ranking da temporada ativa ou parâmetro; calcula `SUM(points)` de `ranking_point_events` + `ROW_NUMBER()`; temporadas fechadas lêem `ranking_season_results`
- `GET /temporadas` — Lista temporadas (status, hash Merkle, datas)
- `GET /temporadas/:id/resultados` — Resultados finais de uma temporada
- `GET /conquistas/:usuarioId` — Badges: Primeira Reserva, Leitor Ativo (5), Bibliófilo (10), Primeiro Livro, Top 3 por temporada
- `GET /historico/:usuarioId` — Eventos de pontuação paginados (50)

### 4. IA Bibliográfica (`/api/ia`) — **Admin only**
- `POST /preencher` — Um título → JSON `{autor, genero, ano_publicacao, numero_paginas, resumo}`
- `POST /preencher-multiplo` — Até 20 títulos em `Promise.all`, retorna array de fichas editáveis
- Prompt estruturado: resposta **apenas JSON válido**, campos incertos = `null`

### 5. Autenticação (`/api/auth`)
| Método | Descrição |
|--------|-----------|
| `GET /google` | Inicia OAuth Google (state + PKCE opcional) |
| `GET /google/callback` | Troca code → token → userinfo → upsert usuário + identidade |
| `GET /x` | Inicia OAuth X **com PKCE** (code_verifier/challenge S256) |
| `GET /x/callback` | Valida PKCE → upsert usuário (wallet `x_{id}`) + identidade |
| `POST /email/send-code` | Gera código 6 dígitos, HMAC-SHA256, rate limit email/IP (email_code_logs), envia via Resend (fetch nativo + `response.ok`) |
| `POST /email/verify-code` | Valida HMAC, attempts ≤5, cria/atualiza usuário, emite cookie `bookhub_session` |
| `POST /wallet/challenge` | Gera nonce SIWE (`BookHub login\nDomain...\nNonce...`) |
| `POST /wallet/verify` | `ethers.verifyMessage`, upsert usuário (wallet), emite cookie |
| `POST /oauth/consume` | Consome `oauth_token`/`oauth_code` do handoff (10 min), emite sessão |
| `POST /login` | Login unificado: email+código **ou** wallet+assinatura verificada |
| `POST /register` | Cadastro pós-verificação de e-mail (código já validado) |
| `POST /logout` | Remove sessão + limpa cookie |
| `POST /logout-all` | **Auth**: remove todas sessões do usuário |
| `GET /perfil` | **Auth**: retorna usuário da sessão |
| `PUT /perfil` | **Auth**: atualiza nome/username/avatar (bloqueia tipo) |

### 6. Segurança
- **CSRF**: middleware `csrfProtection` em **todas** rotas `POST/PUT/DELETE/PATCH`; comparação **exata** de `origin` contra allowlist
- **Cookies**: `HttpOnly`, `SameSite=lax`, `Secure` em produção, `maxAge=30d`, path `/`
- **Rate limiting**: login (5/15min/IP), email code (3/hr/email + 10/hr/IP via `email_code_logs`)
- **XSS**: frontend usa `document.createElement` + `textContent` (admin/reservas/perfil); URLs de capa validadas
- **Senhas**: não armazenadas (auth por código/OAuth/SIWE)

---

## ⚙️ Configuração (`.env`)

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# Server
PORT=3000
NODE_ENV=production
AUTH_BASE_URL=https://seu-dominio.com
CORS_ORIGIN=https://seu-dominio.com

# Auth secrets
AUTH_TOKEN_SECRET=gere-um-segredo-longo-e-aleatorio-aqui

# Resend (e-mail)
RESEND_API_KEY=re_...
AUTH_EMAIL_FROM=BookHub <noreply@seu-dominio.com>

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# X (Twitter) OAuth 2.0
X_CLIENT_ID=...
X_CLIENT_SECRET=...

# Gemini AI
GEMINI_API_KEY=...
```

> Copie `.env.example` → `.env` e preencha. Em desenvolvimento, `NODE_ENV=development` desativa `Secure` e usa allowlist localhost.

---

## 🗄️ Banco de Dados & Migrações

O schema completo está em **`supabase/migrations/20261027000000_consolidated_schema.sql`** (único arquivo, transação única). Tabelas principais:

| Tabela | Propósito |
|--------|-----------|
| `autores`, `editoras`, `livros` | Catálogo normalizado |
| `usuarios` | Perfil + wallet + tipo (aluno/professor/admin) |
| `auth_sessions` | Sessões JWT (token_hash PK, FK user, expiração) |
| `auth_identities` | Identidades unificadas (email, google, x, metamask) |
| `oauth_accounts`, `oauth_states`, `oauth_handoffs` | Fluxos OAuth |
| `email_verification_codes`, `email_code_logs` | Códigos HMAC + rate limit IP |
| `wallet_login_challenges` | Nonces SIWE |
| `ranking_seasons`, `ranking_season_results`, `ranking_point_events` | Ranking sazonal |
| `bookhub_reservations` | Pré-reservas (status, motivo, timestamps) |
| `exemplares` | Cópias físicas (estado: disponivel/reservado/emprestado/manutencao/extraviado) |

**Inicialização**: `garantirEstruturaBanco()` roda no startup (idempotente, `CREATE TABLE IF NOT EXISTS`). Em produção, aplique a migração consolidada via Supabase CLI ou SQL Editor **antes** do deploy.

---

## ▶️ Como Executar

```bash
# 1. Instalar dependências
npm ci

# 2. Configurar variáveis
cp .env.example .env
# edite .env com suas credenciais

# 3. (Produção) Aplicar migração no Supabase
#    Copie supabase/migrations/20261027000000_consolidated_schema.sql
#    e execute no SQL Editor do Supabase

# 4. Iniciar
npm start
# ou desenvolvimento:
npm run dev   # se tiver nodemon configurado

# 5. Health check
curl http://localhost:3000/health
# {"ok":true,"timestamp":"...","database":"connected"}

# 6. Testes automatizados
npm test
# 28 passing
```

---

## ✅ Testes

```bash
npm test
```

**Cobertura (28 testes):**
- Auth: bloqueio anônimo (401), validação email/código/wallet, login/register, logout-all, OAuth consume
- Segurança: admin-only endpoints (401), CSRF origin check
- Ranking: público, temporadas, conquistas, histórico
- Livros: GET público, POST/PUT/DELETE admin, batch
- IA: endpoints protegidos
- Sessão: expiração, logout, cookie HttpOnly

> Testes usam `DATABASE_URL` fake + mocks; não requerem DB real. Para e2e real, configure banco de homologação.

---

## 📸 Fluxos Principais (Prints)

| Tela | Descrição |
|------|-----------|
| **Catálogo** | Carrosséis por gênero, cards com `createElement`, lazy-loading, pré-reserva 1-clique |
| **Login** | Abas: e-mail (código), Google, X, MetaMask; handoff OAuth → verificação e-mail |
| **Perfil** | Abas Visão Geral / Histórico; conquistas Top 3 por temporada; edição modal |
| **Admin Livros** | Form completo + IA batch (≤20), tabela com filtros gênero/disponibilidade/busca, confirmação exclusão |
| **Admin Reservas** | Filtros status/busca/data, badge pendentes, ações Aprovar/Rejeitar (prompt motivo), atualização em tempo real |
| **Ranking** | Pódio Top 3 animado, tabela restante, seletor temporada, prova Merkle SHA-256 |

*(Adicione screenshots reais em `docs/screenshots/` futuramente)*

---

## ⚠️ Limitações Conhecidas

1. **Blockchain/on-chain**: `ranking_seasons.results_hash` é calculado (Merkle SHA-256) mas **não publicado** em rede; infraestrutura preparada (`blockchain_ranking_events`, `pontos_onchain`)
2. **Empréstimos/devoluções**: exemplares controlam `reservado/emprestado/disponivel`; fluxo de devolução manual via admin
3. **Multi-tenancy**: single-tenant (uma escola/instância); expansão prevista via `organization_id`
4. **Notificações push/e-mail**: apenas códigos de verificação; reservas usam polling/frontend
5. **Testes e2e browser**: não automatizados (Cypress/Playwright pendente)

---

## 📄 Licença

MIT — Uso livre para fins educacionais e comerciais.

---

## 🤝 Contribuição

1. Fork → branch `feature/nova-funcionalidade`
2. `npm test` deve passar (28/28)
3. `npm run lint` se configurado
4. PR com descrição clara + screenshots se UI

---

## 📞 Contato

Projeto desenvolvido para hackathon global — BookHub Team.

**Links úteis:**
- [Supabase Dashboard](https://supabase.com/dashboard)
- [Google Cloud Console (OAuth)](https://console.cloud.google.com/apis/credentials)
- [X Developer Portal](https://developer.twitter.com/en/portal/dashboard)
- [Resend (E-mail API)](https://resend.com)
- [Gemini API](https://aistudio.google.com/apikey)
---

## Revisão de integridade — 29/10/2026

Esta revisão reforça o vínculo entre pré-reservas e exemplares físicos. **Não foi homologada em um Supabase real.** Faça backup e teste em um banco de homologação antes de aplicar em produção.

### Atualização de banco de dados

- Instalação nova: execute `supabase/migrations/20261027000000_consolidated_schema.sql` num banco vazio (agora `exemplares` é criada antes das reservas).
- Banco que já executou a migração consolidada: **não a execute novamente para atualizar o histórico**. Rode `supabase/migrations/20261029000000_reservation_integrity.sql`, após conferir a situação das reservas e das cópias físicas.
- A migração incremental interrompe a execução se detectar duas reservas ativas do mesmo exemplar ou exemplar vinculado ao livro errado, para que os registros sejam reconciliados manualmente sem perda de histórico.
- É necessário reconciliar reservas antigas sem `exemplar_id`. Elas não são associadas arbitrariamente a um exemplar.

### Mudanças nas regras de negócio

- Uma nova pré-reserva exige exemplar físico disponível e usa bloqueio de linha (`FOR UPDATE SKIP LOCKED`) e transação.
- O exemplar muda de `disponivel` para `reservado` ao criar a pré-reserva.
- Aprovação muda a cópia para `emprestado`; rejeição ou cancelamento de solicitação pendente a libera.
- Aprovações não podem ser revertidas automaticamente: devoluções de livros físicos exigem um fluxo de devolução administrativa ainda a implementar. Isso impede liberar incorretamente um exemplar emprestado.
- Cancelamentos preservam a reserva como `Rejeitado`, com motivo de cancelamento, ao invés de apagá-la.
- OAuth consume usa exclusão transacional do ticket e requer identidade de e-mail verificada; o fluxo de confirmação de novos usuários via Google/X precisa ser testado de ponta a ponta com provedores reais.

### Verificações pendentes

- Executar as duas migrações em PostgreSQL de homologação, incluindo um banco vazio.
- Testar disputa simultânea pelo último exemplar e estados de aprovação, cancelamento e rejeição.
- Validar o fluxo completo Google/X e autenticação por cookie com credenciais de teste.
- Implementar o processo administrativo de devolução e revisar os testes antigos que aceitam HTTP 500 em operações de sucesso.
- Verificar interface, catálogo, ranking, acessibilidade e responsividade em navegador. Não foram homologados nesta revisão.


## Verificação antes da apresentação

- Use um Supabase **de homologação** (nunca produção) para aplicar as migrações e verificar a reserva concorrente do último exemplar.
- Configure as variáveis do `.env` a partir do `.env.example` (não compartilhe credenciais reais).
- Execute `npm ci` e `npm test -- --runInBand`. O fluxo de CI em `.github/workflows/testes.yml` também verifica os testes em commits e pull requests.
- Entre com perfis aluno e administrador, confira as políticas de acesso, reserve, aprove/rejeite, e confira o histórico.
- O BookHub não exclui livros que tenham reservas históricas ou exemplares físicos; isso protege os vínculos.
- Para demonstrar Google/X, é necessário configurar as credenciais OAuth e testar os retornos dos provedores em homologação.
- A compatibilidade integral das rotas e do front-end ainda exige validação de ponta a ponta em navegador real.


### Pesquisa bibliográfica em até cinco etapas

O painel administrativo utiliza Google Books e Open Library para localizar livros, consultar edições e preencher apenas dados encontrados em fontes bibliográficas. Quando necessário, faz novas buscas por títulos alternativos. Consulte `docs/CONSULTA_BIBLIOGRAFICA_5_ETAPAS.md` para configuração, limites, testes e revisão de dados. Execute `npm run test:catalogo` para rodar cinco testes simulados sem banco.
