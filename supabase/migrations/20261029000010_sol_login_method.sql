-- Permite a identidade Solana sem modificar migrações previamente aplicadas.
ALTER TABLE public.auth_identities DROP CONSTRAINT IF EXISTS auth_identities_method_check;
ALTER TABLE public.auth_identities ADD CONSTRAINT auth_identities_method_check
  CHECK (method IN ('email', 'google', 'x', 'metamask', 'solana'));
