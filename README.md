# 📚 BookHub

<div align="center">
  <img src="https://img.shields.io/badge/Status-MVP%20Funcional-4CAF50?style=for-the-badge&logo=book" alt="Status do projeto" />
  <img src="https://img.shields.io/badge/Tipo-Web%20App-FF9800?style=for-the-badge" alt="Tipo do projeto" />
  <img src="https://img.shields.io/badge/Escola-Biblioteca-2196F3?style=for-the-badge" alt="Aplicação escolar" />
  <img src="https://img.shields.io/badge/Stack-HTML%20%7C%20CSS%20%7C%20JS-6A5ACD?style=for-the-badge" alt="Stack" />
</div>

<p align="center">
  <img src="https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1200&q=80" alt="Banner da biblioteca" width="100%" />
</p>

> Uma plataforma moderna para gestão de biblioteca escolar, com foco em leitura, organização e controle do acervo.

BookHub é uma plataforma web dedicada à gestão de biblioteca escolar com foco em organização do acervo, reservas de livros, perfil do usuário e administração do sistema. O objetivo do projeto é facilitar o acesso à leitura, melhorar a experiência de uso para alunos e professores e dar mais controle para quem administra a biblioteca.

## 🏷️ Stack tecnológica

<div align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5" />
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/JSON-000000?style=for-the-badge&logo=json&logoColor=white" alt="JSON" />
  <img src="https://img.shields.io/badge/LocalStorage-FF6F61?style=for-the-badge" alt="LocalStorage" />
</div>

---

## ✨ Visão geral do projeto

O sistema foi pensado como uma solução prática para escolas e instituições que desejam digitalizar o processo de gestão de livros. A ideia principal é centralizar em um único ambiente o cadastro de livros, a visualização do catálogo, a reserva de exemplares e a administração das movimentações da biblioteca.

Além disso, o projeto busca entregar uma experiência amigável e intuitiva, com páginas separadas para login, catálogo, perfil e painel administrativo, tornando o uso mais simples tanto para usuários quanto para administradores.

## ✅ O que já foi desenvolvido

Atualmente, o projeto já conta com uma base funcional de MVP, incluindo:

- sistema de login e sessão do usuário;
- catálogo de livros com visualização do acervo;
- reservas de livros por parte dos usuários;
- perfil do usuário com informações e histórico de atividades;
- painel administrativo para gestão de livros e usuários;
- controle de permissões para administradores;
- armazenamento local com JSON e LocalStorage para simular banco de dados em ambiente de prototipação;
- integração inicial com APIs locais para manipulação de dados;
- suporte a autenticação por carteira digital, como MetaMask e Phantom, em uma camada inicial de integração.

## 🏗️ Estrutura do projeto

O repositório está organizado em páginas e módulos principais:

- login: autenticação e sessão do usuário;
- pagina-inicial: catálogo e acesso ao acervo;
- perfil: dados pessoais e histórico do aluno;
- parte-de-administrador: gerenciamento de livros, admins e reservas;
- banco-de-dados: arquivos JSON e servidor local para leitura e gravação de informações;
- adequacao.md: documento com análise do projeto em relação a regulamento, blockchain e competitividade.

## 🚀 Funcionalidades principais

### 1. Catálogo de livros
O usuário pode visualizar os livros disponíveis no acervo, com informações como título, autor, capa e descrição. A interface foi estruturada para facilitar a navegação e a busca por itens do catálogo.

### 2. Reservas
O sistema permite que alunos realizem reservas de livros. As reservas passam por um fluxo que pode ser acompanhado pelo painel administrativo, com informações de status e controle da solicitação.

### 3. Perfil do usuário
A área de perfil mostra informações do estudante ou usuário, além de registrar histórico de movimentações e atividades relacionadas ao uso da biblioteca.

### 4. Painel administrativo
O administrador pode:

- cadastrar novos livros;
- editar ou remover registros do acervo;
- visualizar e controlar reservas;
- promover usuários para administração;
- manter uma visão mais ampla do funcionamento da biblioteca.

Na busca de vários livros, o servidor consulta Google Books, Open Library, Wikipedia/Wikidata e Internet Archive, tenta títulos alternativos conhecidos/traduzidos e combina os campos encontrados entre as fontes. Resumos são apresentados em português do Brasil; se a descrição encontrada for apenas o título ou não puder ser traduzida com segurança, o campo fica vazio para revisão manual. Nomes de autores com escrita não latina e valores de editora que parecem ser notas de tradução são descartados para evitar atribuições falsas; podem ser preenchidos manualmente na ficha. A ficha apresenta as fontes consultadas e links quando disponíveis. Os resultados aparecem como fichas editáveis e **não são salvos até o administrador confirmar cada livro**. Dados que não foram encontrados ficam em branco para revisão manual, sem serem inventados.

### 5. Sessão e autenticação
O projeto já implementa uma lógica de sessão para manter o usuário logado na aplicação e controlar o acesso às áreas restritas, como o painel administrativo.

O login também oferece código de verificação por e-mail, Google OAuth, X OAuth 2.0 com PKCE e assinatura de carteira MetaMask. Para ativar esses serviços, configure no `.env` as variáveis correspondentes do `.env.example`:

- `RESEND_API_KEY`, `AUTH_EMAIL_FROM` e um `AUTH_TOKEN_SECRET` aleatório e longo para envio/validação segura dos códigos por e-mail (Resend);
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e, em produção, `AUTH_BASE_URL` para Google OAuth;
- `X_CLIENT_ID`, `X_CLIENT_SECRET` e, em produção, `AUTH_BASE_URL` para X OAuth.

Cadastre os endereços de callback na configuração de cada provedor: `/api/auth/google/callback` e `/api/auth/x/callback`. O endereço público configurado em `AUTH_BASE_URL` precisa corresponder ao domínio do site. As tabelas de verificação e de associação das contas OAuth são criadas pelo servidor no banco PostgreSQL durante a inicialização.

Ao entrar pelo X, o usuário também informa um e-mail e confirma um código de 6 dígitos enviado para esse endereço antes de acessar a conta ou concluir o cadastro. A associação da identidade X só é gravada após essa confirmação. A tabela auxiliar desse fluxo também está definida em `supabase/migrations/20261023001000_require_verified_email_for_x.sql`.

Os métodos confirmados são registrados em `public.auth_identities`, associados ao usuário e identificados por `method` (`email`, `google`, `x` ou `metamask`) e `provider_user_id`. A tabela mantém os horários da verificação e do último login. A inicialização copia para ela os e-mails, contas OAuth e carteiras já existentes sem remover as colunas/tabelas legadas.

Depois de uma autenticação verificada, o servidor também mantém uma sessão opaca em cookie `HttpOnly` (`public.auth_sessions`). As operações de reserva e de perfil usam essa sessão em vez de confiar no identificador enviado pelo navegador.

### Ranking por temporadas e comprovação futura

O ranking usa temporadas mensais e mantém as pontuações fora da blockchain, no PostgreSQL/Supabase. A primeira temporada começa sem importar os saldos antigos de `ranking_leitores`; esses dados legados não são apagados, mas não contam para a nova classificação. No momento, cada livro diferente reservado pelo mesmo usuário vale **1 ponto por temporada**. Novas tentativas do mesmo livro não geram pontos repetidos. Resumos ainda não pontuam: quando a funcionalidade de resenhas for criada, a regra prevista é **3 pontos por resumo aprovado**, com um evento único por resumo.

Reservas e eventos de pontuação ficam persistidos em `bookhub_reservations` e `ranking_point_events`. Ao encerrar o mês, os resultados são congelados em `ranking_season_results`; as posições Top 1, Top 2 e Top 3 ficam visíveis no perfil como tags históricas. A tela de ranking permite consultar a temporada atual e as anteriores.

No fechamento de cada temporada, o servidor calcula um resumo SHA-256 em estrutura Merkle dos resultados e o guarda em `ranking_seasons.results_hash`. Esse digest permite preparar uma verificação futura, mas **ainda não é publicado on-chain**: não há RPC, contrato, transação nem NFT/SBT implementado. O hash usa identificadores internos e posições/pontos, não nomes, e-mail ou histórico pessoal. A publicação em rede só deve ser adicionada após definir rede, política de confirmação e tratamento de reorganizações.

A migração `supabase/migrations/20261022231000_add_monthly_ranking_seasons.sql` cria as tabelas de sessão, temporada, eventos de pontos, resultados e reservas persistentes. O servidor também garante essas tabelas na inicialização. Revise e aplique a migração no projeto Supabase antes de implantar, especialmente em produção; faça backup do banco antes de qualquer alteração de esquema.

A estrutura anterior `ranking_leitores.pontos_onchain` e `blockchain_ranking_events`, criada pela migração `supabase/migrations/20261022220000_add_auth_identities_and_blockchain_ranking.sql`, permanece como preparação separada e não altera o cálculo do ranking sazonal.

## 🛠️ Tecnologias e abordagem atual

O projeto hoje usa uma abordagem simples e didática para simular uma aplicação web real, com:

- HTML e CSS para interface;
- JavaScript para lógica da aplicação;
- Node.js como servidor local para API;
- arquivos JSON como base de dados inicial;
- LocalStorage para persistência no navegador.

Essa arquitetura é ideal para um protótipo funcional e para demonstração de fluxo de uso, mas ainda é um estado inicial em termos de escalabilidade e segurança.

## 🔧 O que já foi mexido

Ao longo do desenvolvimento, já foi trabalhado o núcleo da experiência do usuário e da gestão da biblioteca, incluindo:

- organização da interface do sistema;
- navegação entre páginas principais;
- fluxo de login e sessão;
- catálogo de livros;
- mecanismo de reservas;
- administração do acervo;
- controle de usuários e perfil de admin;
- estrutura de dados para simular banco e API local.

Em outras palavras, o projeto já saiu do estágio conceitual e chegou a um MVP funcional com base sólida para continuar evoluindo.

## 🌱 O que ainda será mexido / roadmap

A parte futura do BookHub ainda é bastante promissora e inclui melhorias importantes em vários níveis.

### Melhorias de experiência
- refinamento visual da interface;
- melhor organização das telas mobile e desktop;
- mensagens de feedback mais completas para o usuário;
- filtros e busca mais avançados no catálogo;
- notificações mais claras sobre reservas, atrasos e status.

### Melhorias de backend e dados
- migração de JSON/LocalStorage para banco de dados real;
- autenticação mais segura com senha e controle de sessão robusto;
- gerenciamento de permissões por perfil com regras mais precisas;
- logs de auditoria para ações administrativas;
- histórico mais detalhado de empréstimos e devoluções.

### Melhorias de segurança e governança
- uso de HTTPS e políticas de segurança;
- validação mais rígida de dados de entrada;
- controle de acesso mais forte para administradores;
- rastreabilidade de ações do sistema.

### Evolução tecnológica
- integração com blockchain ou soluções de rastreabilidade;
- uso de hashes para validar integridade de registros críticos;
- suporte a autenticação digital e identidade institucional;
- expansão para múltiplas escolas, bibliotecas ou unidades.

### Diferenciação e crescimento
- gamificação para incentivar a leitura;
- certificados e recompensas;
- relatórios de leitura e engajamento;
- expansão do produto para uma solução comercial ou institucional.

## 📊 Status atual

O projeto está em etapa de desenvolvimento funcional, com base de MVP já estruturada e pronta para continuar evoluindo. Ele já demonstra o fluxo principal de uma biblioteca digital, mas ainda precisa de aprimoramentos em arquitetura, segurança, escalabilidade e diferenciação de mercado.

## 🎯 Objetivo futuro

O objetivo é transformar o BookHub em uma plataforma mais robusta, confiável e competitiva, capaz de atender não apenas a gestão básica de livros, mas também a necessidades de instituições educacionais, controle de acervo, governança e engajamento de leitura.

## ▶️ Como rodar o projeto

1. Abra o terminal na pasta do projeto.
2. Acesse a pasta do servidor local:
   - trabalho-inicial/trabalho teste/parte-de-administrador/banco-de-dados
3. Inicie o servidor Node.js:
   - node server.js
4. Abra a página principal do projeto em um navegador.
5. Faça login e utilize as áreas de catálogo, perfil e administração.

> Importante: o projeto ainda depende de um ambiente local para simular dados e APIs, e por isso a execução em conjunto com o servidor local é parte da experiência atual.

## 🧩 Conclusão

O BookHub já apresenta uma base sólida como sistema de gestão de biblioteca escolar, com fluxo principal funcional e boa estrutura para expansão. O que já foi construído mostra a ideia central do projeto, e o que ainda será implementado aponta para uma evolução natural em direção a um produto mais completo, seguro, escalável e preparado para uso institucional.

O projeto tem potencial para crescer de uma ferramenta acadêmica para uma solução moderna de biblioteca digital, com maior controle administrativo, melhor experiência de usuário e novas camadas de tecnologia e inovação.
