# Pesquisa bibliográfica reforçada — BookHub

## O que foi alterado

A rota `POST /api/ia/preencher` não depende mais de o Gemini inventar uma ficha bibliográfica. O backend consulta até cinco etapas:

1. **Google Books**, pesquisando pelo título (`intitle:`) ou ISBN.
2. **Open Library**, pesquisando pelo título ou ISBN.
3. **Google Books**, busca ampliada.
4. **Open Library**, busca ampliada.
5. **Títulos alternativos**, consultando as duas bases após tradução segura/alternativas (quando necessário).

Sempre que possível, os metadados de edição do Open Library são consultados pela API de edições, e descrições podem ser recuperadas da obra. As respostas só são aceitas com correspondência forte de título, e autores de obras clássicas conhecidas são usados para rejeitar adaptações/obras com nomes iguais.

É normal que livros raros, sem ISBN, adaptações e obras não catalogadas retornem dados parciais ou não sejam encontrados. **Nenhum serviço consegue garantir 100% de acertos.**

## Campos e fontes

O endpoint informa `fontes`, `campos_fonte`, `campos_ausentes`, `tentativas`, `encontrado` e `aviso`. O ano, editora, páginas e idioma vêm da **mesma edição principal**, evitando misturar dados de edições diferentes. A IA ajuda a encontrar traduções de títulos e adaptar resumos. Em último caso, quando a chave Gemini está configurada e existe título + autor, pode oferecer um **rascunho de resumo**, identificado como não verificado e que exige revisão antes da publicação. A IA não preenche ano, número de páginas ou editora por suposição.

A interface informa as fontes e abre links de conferência; campos de edição sem confirmação permanecem em branco. Se o catálogo sugerir uma média de páginas, ela aparece separada, com botão para aplicação consciente — não é automaticamente registrada como número exato. A busca em lote fica recolhida até o usuário clicar em **Adicionar vários livros**. Evite publicar sinopses ou capas sem verificar permissão/licenciamento de uso.

## Configuração

- Node.js 18+ (recomendado 22) com conexão à internet disponível no servidor.
- `GEMINI_API_KEY` é **opcional**: ajuda a buscar títulos alternativos e a adaptar resumos em português, mas **não** substitui os dados dos catálogos.
- `GOOGLE_BOOKS_API_KEY` é **opcional**, configurada somente no backend; não coloque a chave no JavaScript do navegador.
- Consulte políticas e limites das APIs públicas. A Open Library pode restringir excesso de acessos; o sistema limita concorrência e usa cache por 30 minutos.

## Teste automatizado sem instalar dependências

No diretório principal do projeto:

```bash
node --test tests/catalogoBibliografico.node.cjs
```

O teste simula as respostas das APIs e cobre nove cenários, incluindo sinopse da obra, página complementar e o formulário de busca em lote. Ele **não** comprova que as APIs estejam acessíveis, nem que o Supabase esteja conectado.

## Teste manual

1. Reinicie o servidor (`npm start`).
2. Entre com usuário administrador e abra o painel de livros.
3. Pesquise `A Pequena Sereia`, verificando a obra de Hans Christian Andersen. Em caso de dados incompletos, tente o ISBN da edição física.
4. Confirme que editora, páginas, ano e capa correspondem **à edição da biblioteca**, não só à obra.
5. Busque um título inexistente para conferir a mensagem, em vez de dados inventados.
6. Experimente o preenchimento em lote e revise os resultados antes de salvar.
7. Se surgir HTTP 403, confira a sessão/permissão de administrador. Se surgir HTTP 429/503, é limite ou indisponibilidade das fontes, e não ausência do livro.

Para problemas persistentes, envie apenas o status HTTP, título pesquisado e mensagens do servidor. Não envie credenciais.

## Uso rápido antes da apresentação

1. Abra o painel de cadastro e digite o título no primeiro campo.
2. Clique em **Procurar um livro**; os dados aparecem **imediatamente abaixo da busca**.
3. Confira o resumo, a editora e o número de páginas. Se houver uma sugestão aproximada, consulte sua edição física antes de aplicá-la.
4. Só use **Adicionar vários livros** caso queira cadastrar uma lista inteira; a caixa permanece oculta até o clique.
5. Não deixe o placeholder de páginas ser confundido com um valor preenchido. O campo começa vazio.

Para `A Pequena Sereia`, edições diferentes podem ter números de páginas diferentes; informe o ISBN da edição em mãos para maior precisão. A descrição pode ser recuperada da obra (Open Library), de uma página portuguesa de referência validada ou, em último caso, de um rascunho de IA marcado como não verificado. Resumos e capas exigem revisão de direito de uso.
