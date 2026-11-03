# BookHub — correção do erro `42703` e confirmação do perfil

## Diagnóstico

`column "onboarding_completed" does not exist` (PostgreSQL 42703) significa que o servidor está rodando código mais recente que a estrutura do banco. O envio do código por e-mail pode funcionar, mas `/api/auth/perfil` falha e o primeiro acesso não consegue continuar. **Não é evidência de código de verificação incorreto.**

## Aplicar no ambiente de homologação primeiro

1. Faça backup do banco e confirme qual Supabase o `DATABASE_URL` referencia. **Não compartilhe o valor do DATABASE_URL.**
2. No painel do Supabase desse mesmo projeto, vá ao SQL Editor e execute `supabase/migrations/20261103000010_reparar_onboarding_colunas.sql`. Esse script adiciona `onboarding_completed` e `onboarding_confirmed_at` sem apagar dados; contas existentes sem marcação são preservadas como completas, e novas contas têm `onboarding_completed=false` por padrão.
3. Confira a existência das colunas com:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='usuarios'
AND column_name IN ('onboarding_completed', 'onboarding_confirmed_at');
```

4. Reinicie o servidor (`npm start`) e use **somente** `http://localhost:3000` durante todo o fluxo, sem trocar por `127.0.0.1` ou outro domínio.
5. Em uma aba anônima, comece o login Google novamente. Uma conta **nova** com `onboarding_completed=false` deve abrir `/perfil/completar.html`. Preencha o nome e o username. Um endereço já verificado pelo provedor pode dispensar um novo código; mudar o e-mail exige código.
6. Depois da confirmação, verifique o redirecionamento para `/` e a presença de sessão em `/api/auth/perfil`.

## Se a sessão estiver realmente ausente

A mensagem `Sessão inválida ou expirada` é HTTP 401 e não pode ser corrigida apenas com o código OTP: a tela de primeiro acesso depende também de `bookhub_session`. Inspecione em DevTools > Application > Cookies > `http://localhost:3000` se existe `bookhub_session`, sem copiar o valor. Se não existir, recomece o login Google pela mesma origem.

Se a chamada retornar HTTP 503 com `DATABASE_MIGRATION_REQUIRED`, ainda há alguma diferença entre o banco conectado e a migração; não apague a conta nem o código.

## Atenção às contas antigas

A correção de colunas **não altera usernames antigos**, para evitar mudanças silenciosas. A migração `20261103000000_onboarding_legacy_google.sql` é opcional e deve ser revisada em homologação antes de aplicá-la, pois ela pode reabrir o primeiro acesso de contas existentes que tenham usernames gerados automaticamente. Não execute migrações históricas novamente num banco de produção sem conferir o histórico.
