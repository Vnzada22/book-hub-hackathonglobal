# Demonstração do BookHub — roteiro operacional

## Preparação (homologação, nunca produção)
1. Crie um Supabase de homologação e aplique as migrações por ordem. **Não cole credenciais no repositório.**
2. Configure `.env` baseado em `.env.example`, usando endereços OAuth e domínios da demonstração.
3. Execute `npm ci`, `npm test -- --runInBand` e `npm start`.
4. Prepare três livros de domínio público, com capas licenciadas: um com 3 exemplares, um com 1 e outro com 0.
5. Crie um perfil aluno e um perfil administrador de demonstração, sem dados pessoais reais.
6. Em navegador anônimo, confirme login, logout e ausência de sessão antiga; não utilize cookies exportados.

## Percurso ao vivo
1. Apresente a página inicial e alterne modo claro/escuro.
2. Abra catálogo; pesquise um título; observe a disponibilidade inicial.
3. Entre como aluno, solicite uma pré-reserva; mostre a mensagem de confirmação e o histórico.
4. Abra outro navegador com outro aluno; tente reservar o último exemplar simultaneamente: somente uma operação pode confirmar.
5. Entre como admin; confirme acesso administrativo, aprove uma solicitação, rejeite outra com motivo.
6. Mostre a atualização da disponibilidade e do histórico do aluno após cada transição.
7. Exiba ranking e filtre temporada ativa e encerrada; se não houver dados, mostre estado vazio.
8. Faça logout e confirme que endpoints protegidos retornam 401.

## Critérios de saída
- Todas as verificações acima passam com Supabase real de homologação.
- Os fluxos Google e X foram exercitados com credenciais próprias dos provedores.
- Não existe exposição de tokens, dados privados ou acesso administrativo por aluno.
- Desktop e celular inspecionados nos temas claro/escuro.

## Limitações
Os testes HTTP com banco simulado não comprovam o comportamento do Supabase real nem de provedores externos. Documente os resultados da execução antes de apresentar como validado.
