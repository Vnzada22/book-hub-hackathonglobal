-- Contas anteriores continuam ativas; novas contas precisam configurar o perfil.
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.usuarios ALTER COLUMN onboarding_completed SET DEFAULT FALSE;
-- Impedir usernames duplicados, inclusive com diferença de maiúsculas/minúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_username_unique_ci ON public.usuarios (LOWER(username)) WHERE onboarding_completed = TRUE AND username IS NOT NULL;
-- Proteção também contra alterações diretas/rotas antigas após a confirmação.
CREATE OR REPLACE FUNCTION public.proteger_identidade_definitiva() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.onboarding_completed IS TRUE AND
    (NEW.username IS DISTINCT FROM OLD.username OR NEW.email IS DISTINCT FROM OLD.email OR NEW.onboarding_completed IS DISTINCT FROM OLD.onboarding_completed) THEN
    RAISE EXCEPTION 'Identidade confirmada não pode ser alterada';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS usuarios_identidade_definitiva ON public.usuarios;
CREATE TRIGGER usuarios_identidade_definitiva BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.proteger_identidade_definitiva();
