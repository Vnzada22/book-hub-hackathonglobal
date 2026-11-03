# BookHub — pesquisa bibliográfica e resumos em português do Brasil

## O que foi ajustado

- O campo **Resumo** recebe somente texto em português quando a busca automática termina.
- Descrições que promovem **coletâneas de histórias** ou apenas enumeram títulos são rejeitadas como resumos da obra isolada.
- Se uma descrição de catálogo estiver em outro idioma, o BookHub tenta produzir uma síntese em português com Gemini (quando `GEMINI_API_KEY` está configurada). Uma tradução ou síntese não validada não é tratada como metadado certificado.
- Para *A Pequena Sereia*, de Hans Christian Andersen, há um resumo **editorial original**, não uma reprodução de texto de coletâneas. Ele aparece com **revisão obrigatória**.
- Se não for possível obter uma sinopse válida em português, o campo permanece vazio com uma explicação para a bibliotecária; nenhum texto estrangeiro é publicado automaticamente.
- Os gêneros reconhecidos são exibidos em português do Brasil. Um gênero não identificado não é automaticamente inventado ou exibido em inglês ao preencher o formulário.

## Informações que não devem ser traduzidas automaticamente

- **Autor e editora:** nomes próprios devem permanecer como constam na edição.
- **Ano, número de páginas e idioma:** são características da edição identificada, não da obra em geral. Uma edição em inglês deve indicar `Inglês` (em português), e não `Português` apenas porque o usuário pesquisou o título traduzido.
- **Capa e sinopse:** confirme a edição e os direitos de uso antes de publicar no catálogo.

## Testes

No diretório do projeto:

```sh
npm run test:catalogo
```

O teste inclui a descrição inglesa de coletânea que citava *The Little Mermaid* e verifica que a busca retorna um resumo original do conto em português brasileiro. Nenhuma conexão com Supabase é necessária para esses testes simulados.

## Após atualizar o projeto

1. Preserve o `.env` da sua instalação atual (não está no ZIP).
2. Reinicie o servidor (`Ctrl+C` e `npm start`) para limpar o cache da busca em memória.
3. Atualize a página com `Ctrl+Shift+R` e pesquise `A pequena sereia`.
4. Confira o resumo em português e revise os campos de edição antes de salvar.

**Observação:** catálogos incompletos podem não fornecer todas as informações. O sistema não consegue garantir um resumo verificável de qualquer livro sem fontes apropriadas.
