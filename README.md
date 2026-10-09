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

### 5. Sessão e autenticação
O projeto já implementa uma lógica de sessão para manter o usuário logado na aplicação e controlar o acesso às áreas restritas, como o painel administrativo.

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
