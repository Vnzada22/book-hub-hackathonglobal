-- Aplicar após 20261029000020_perfil_primeiro_acesso.sql.
-- Metadados explícitos para distinguir perfil escolhido de username provisório legado.
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS onboarding_confirmed_at TIMESTAMPTZ;
-- Usuários de versões antigas com username automático igual à parte local do e-mail
-- nunca tiveram oportunidade de escolher seu username. Restringimos à conta Google
-- e a registros ainda não explicitamente finalizados com a nova etapa.
-- O trigger de proteção exige sua remoção e recriação na mesma transação de migração.
BEGIN;
DROP TRIGGER IF EXISTS usuarios_identidade_definitiva ON public.usuarios;
UPDATE public.usuarios u
SET onboarding_completed = FALSE,
    username = NULL
WHERE u.onboarding_completed = TRUE
  AND u.onboarding_confirmed_at IS NULL
  AND u.email IS NOT NULL
  AND u.username IS NOT NULL
  AND LOWER(u.username) = LOWER(split_part(u.email, '@', 1))
  AND EXISTS (SELECT 1 FROM public.oauth_accounts a WHERE a.user_id = u.id AND a.provider = 'google');
CREATE TRIGGER usuarios_identidade_definitiva
BEFORE UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.proteger_identidade_definitiva();
COMMIT;
-- Contas anteriores cujo username já foi escolhido manualmente permanecem intactas.
