# Primeiro acesso BookHub

1. Aplique `20261029000020_perfil_primeiro_acesso.sql` em banco de homologação primeiro.
2. Contas criadas antes desta migração são preservadas como concluídas; contas novas precisam escolher username e confirmar e-mail.
3. Após o login, o perfil redireciona para `/perfil/completar.html` se `onboarding_completed=false`.
4. O formulário exige username único, nome e e-mail confirmado por código (ou identidade `email` já verificada).
5. Depois de confirmado, e-mail e username ficam imutáveis até que seja implementado um fluxo seguro de alteração com nova verificação.
6. Configure RESEND_API_KEY e AUTH_TOKEN_SECRET para envio real de códigos; no desenvolvimento sem Resend os códigos aparecem somente nos logs locais.
7. Valide login Google novo, X, e-mail, carteiras e contas antigas num Supabase de homologação.
8. Observe: o fluxo Google/X existente pode exigir confirmação do e-mail antes de criar a sessão; a tela de perfil só abre depois dessa etapa.

Testes importantes: novo usuário, nome duplicado, username com espaços, e-mail em uso, código incorreto, código expirado, chamada repetida ao endpoint e tentativa de mudar username após confirmar.
