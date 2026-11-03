-- Correção idempotente para instalações que já têm public.usuarios, mas ainda não
-- executaram a migração de primeiro acesso. Não apaga nem recria registros.
-- Execute no MESMO projeto/banco apontado pelo DATABASE_URL do BookHub.
BEGIN;
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN;
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS onboarding_confirmed_at TIMESTAMPTZ;
-- Contas existentes mantêm seu estado anterior. Em instalações antigas,
-- antes da implementação, tratamos como completas para não bloquear usuários.
UPDATE public.usuarios SET onboarding_completed = TRUE
WHERE onboarding_completed IS NULL;
ALTER TABLE public.usuarios ALTER COLUMN onboarding_completed SET NOT NULL;
ALTER TABLE public.usuarios ALTER COLUMN onboarding_completed SET DEFAULT FALSE;
COMMIT;
-- Verificação: SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'usuarios'
-- AND column_name IN ('onboarding_completed','onboarding_confirmed_at');
