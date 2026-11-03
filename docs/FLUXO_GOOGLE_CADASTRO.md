# Login Google e conclusão de cadastro

## Fluxo esperado

1. Google autentica e confirma `verified_email=true`. O backend estabelece uma sessão HttpOnly.
2. Usuário novo (`onboarding_completed=false`) é direcionado a `/perfil/completar.html`.
3. O usuário escolhe nome e username, confirma o e-mail já verificado pelo Google ou solicita um código para outro endereço.
4. Após salvar com sucesso, a aplicação redireciona para `/` (página inicial).
5. Ao voltar a entrar, conta já configurada vai direto para `/`.

## Requisitos e validação

- Aplicar primeiro `supabase/migrations/20261029000020_perfil_primeiro_acesso.sql` no Supabase **de homologação**.
- Iniciar `npm install`, `npm test` e `npm start`.
- Testar conta Google nova, conta existente, e-mail diferente, username duplicado, sessão expirada e login e-mail/X/carteiras.
- Confirmar `GET /api/auth/perfil` 200, `onboarding_completed=true` após salvar e redirecionamento para `/`.
- Não usar testes com credenciais de produção. Sem provedor Google e banco de homologação, a integração real não está validada.

## Segurança

- A verificação Google somente é aceita se `userinfo.verified_email` for `true`.
- Alteração de e-mail no primeiro acesso ainda exige código. O username definitivo é travado no banco.
- O ZIP entregue não inclui `.env`: preserve seu arquivo local, jamais envie credenciais num pacote compartilhável.

## Correção 2026-11-03 — usuário criado mas site parece desconectado

Após atualizar o projeto, aplicar **em homologação**, na ordem:
1. `20261029000020_perfil_primeiro_acesso.sql`
2. `20261103000000_onboarding_legacy_google.sql`

A segunda migração reabre o cadastro de contas Google antigas **somente** quando o username corresponde à parte anterior ao `@` do e-mail e nunca foi registrada confirmação de primeiro acesso. Se um usuário escolheu deliberadamente esse mesmo username em uma versão antiga, revisar antes de aplicar. Faça backup.

No navegador, use exclusivamente `http://localhost:3000` para iniciar login e concluir cadastro (não misture `localhost` e `127.0.0.1`). Em DevTools > Network, verifique `GET /api/auth/perfil`: 200 com `usuario.onboarding_completed=false` antes do formulário, 200 com `true` depois, e no callback Google confira o `Set-Cookie: bookhub_session=...` sem divulgar o token. O status 401 significa ausência de sessão; 503 indica problema temporário com banco, não ausência de usuário.

Não há validação com Google real no ambiente de geração; testar em homologação é obrigatório.
