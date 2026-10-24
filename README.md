# BookHub

BookHub é uma aplicação web para consultar o acervo de uma biblioteca física e solicitar a pré-reserva de exemplares para retirada. O catálogo informa a disponibilidade cadastrada no sistema; a confirmação e o atendimento da reserva são feitos pela administração da biblioteca.

## Funcionalidades

- Catálogo com busca por título, autor e gênero, filtros de categoria e detalhes do livro.
- Solicitação de pré-reserva e consulta do status da solicitação.
- Área de administração para cadastrar, editar e remover livros, revisar solicitações e gerenciar usuários.
- Busca assistida para preencher dados de livros. A busca combina resultados de Google Books, Open Library, Wikipedia/Wikidata e Internet Archive; Gemini pode auxiliar na geração/normalização de dados quando configurado.
- Resultados da busca em lote aparecem para revisão antes de serem adicionados ao acervo. Fontes externas podem estar incompletas ou indisponíveis; confirme os dados antes de salvar.
- Autenticação por código enviado ao e-mail, Google, X e carteira MetaMask. Google, X e e-mail dependem das respectivas configurações; MetaMask requer a extensão no navegador.
- Perfil do usuário, histórico de reservas e ranking mensal.

## Tecnologias

- Interface: HTML, CSS e JavaScript.
- Servidor/API: Node.js, Express e JavaScript.
- Banco de dados: PostgreSQL, conectado pela biblioteca `pg` (o projeto usa Supabase como serviço PostgreSQL).
- Integrações opcionais: Gemini, Resend, Google OAuth, X OAuth e MetaMask (`ethers`).

Os dados do catálogo, usuários, reservas, autenticação e ranking são armazenados no PostgreSQL. O `localStorage` do navegador guarda informações auxiliares da interface/sessão do usuário; não é o banco principal do projeto.

## Estrutura

```text
.
├── img/                         # Avatares e ícones
├── pagina_administrativa/
│   ├── html/                    # Painel do acervo
│   ├── css/
│   └── java/
├── pagina_inicial/
│   ├── html/                    # Catálogo e reservas
│   ├── css/
│   └── java/
├── pagina_login/
│   ├── html/
│   ├── css/
│   └── js/
├── pagina_perfil/
│   ├── html/
│   ├── css/
│   └── js/
├── pagina_ranking/
│   ├── html/
│   ├── css/
│   └── js/
├── supabase/migrations/         # Scripts SQL versionados
├── server.js
├── package.json
└── .env.example
```

## Requisitos

- Node.js 18 ou superior e npm.
- Um banco PostgreSQL acessível pela aplicação.
- Credenciais das integrações que deseja habilitar.

## Executar localmente

1. Clone o repositório e entre na pasta do projeto:

   ```powershell
   git clone https://github.com/Vnzada22/book-hub-hackathonglobal.git
   cd book-hub-hackathonglobal
   ```

2. Instale as dependências:

   ```powershell
   npm install
   ```

3. Crie seu arquivo local de ambiente a partir do exemplo:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Edite `.env` e informe pelo menos uma URL de conexão PostgreSQL válida em `DATABASE_URL`. Configure também os serviços que pretende usar conforme a seção seguinte. **Nunca publique o `.env` nem coloque credenciais reais no README ou em outros arquivos versionados.**

5. Inicie o servidor:

   ```powershell
   npm start
   ```

6. Acesse `http://localhost:3000`.

O servidor disponibiliza a interface e a API e prepara/verifica tabelas do sistema na inicialização. Os scripts em `supabase/migrations/` documentam alterações de esquema. Revise-os e aplique-os ao banco na ordem cronológica antes de implantar ou atualizar um banco existente; faça backup antes de alterações em produção.

### Erros de conexão com o Supabase

O endpoint direto de banco do Supabase pode resolver para um endereço IPv6. Se a rede da máquina não oferecer rota IPv6 e o servidor reportar `ENETUNREACH`, a interface ainda pode abrir, mas as funções que dependem do banco não funcionarão.

Para resolver, habilite IPv6 na rede ou, no painel do Supabase, copie a URL de conexão do **Session Pooler** compatível com IPv4 e substitua o valor de `DATABASE_URL` no `.env`. Use a URL completa fornecida pelo painel, sem publicar a senha. Não é necessário instalar a CLI do Supabase ou iniciar Docker para conectar a um projeto Supabase hospedado; esses recursos só são necessários para executar a stack local do Supabase.

## Variáveis de ambiente e integrações

As variáveis e os nomes dos callbacks estão listados em [`.env.example`](./.env.example).

| Variável | Necessária para | Observação |
| --- | --- | --- |
| `DATABASE_URL` | Banco de dados | URL de conexão PostgreSQL. Necessária para persistir e consultar os dados da aplicação. |
| `PORT` | Servidor | Porta HTTP; padrão `3000`. |
| `AUTH_TOKEN_SECRET` | Autenticação por e-mail e sessões/token | Use um segredo longo e aleatório, exclusivo para o ambiente. |
| `RESEND_API_KEY` | Envio de códigos por e-mail | Chave da conta Resend. |
| `AUTH_EMAIL_FROM` | Envio de códigos por e-mail | Remetente aceito/configurado no Resend. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth | Registre o callback `/api/auth/google/callback` no provedor. |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | X OAuth 2.0 | Registre o callback `/api/auth/x/callback` no provedor. |
| `AUTH_BASE_URL` | Callbacks OAuth | URL base pública da aplicação; em desenvolvimento, `http://localhost:3000`. |
| `GOOGLE_REDIRECT_URI`, `X_REDIRECT_URI` | Callbacks OAuth personalizados | Opcionais; use apenas se os callbacks diferirem dos padrões. |
| `GEMINI_API_KEY` | Assistência de dados de livros | Opcional; sem ela, a aplicação ainda pode consultar os catálogos externos configurados no servidor. |

Para autenticação por e-mail, configure Resend e os três valores `RESEND_API_KEY`, `AUTH_EMAIL_FROM` e `AUTH_TOKEN_SECRET`. Para Google ou X, configure as credenciais do provedor, a URL base e os callbacks correspondentes. A autenticação X também solicita verificação do e-mail informado pelo usuário. A MetaMask não usa variável de ambiente: é necessária uma carteira compatível no navegador.

## Reservas e ranking

As reservas são solicitações para retirada física, não empréstimos nem leitura digital dentro do site. O status pode ser acompanhado e atualizado pela administração.

O ranking é organizado por temporadas mensais. Cada livro diferente pré-reservado por um usuário pode gerar 1 ponto por temporada; a restrição no banco evita pontuar novamente a mesma origem do evento. Ao fechar uma temporada, os resultados são persistidos e o servidor calcula um hash SHA-256 em estrutura Merkle dos resultados.

**Não há integração on-chain operacional neste momento.** O hash da temporada fica no PostgreSQL. Não há contrato inteligente, transação blockchain, NFT ou SBT sendo emitido. A tabela `blockchain_ranking_events` é apenas uma estrutura de preparação.

## Observações e limitações

- A disponibilidade apresentada depende dos dados mantidos no catálogo e deve ser confirmada pela biblioteca.
- Catálogos externos podem impor limites, ficar indisponíveis ou retornar metadados incompletos. A busca assistida não garante o preenchimento de todos os campos; revise cada resultado.
- Google OAuth, X OAuth, Resend e Gemini exigem credenciais próprias e configuração no provedor.
- Use HTTPS, segredos seguros e backups apropriados ao disponibilizar a aplicação em produção. Configure as origens e callbacks para o domínio público utilizado.
- O projeto não oferece leitura de livros online nem substitui o processo físico de empréstimo da biblioteca.
