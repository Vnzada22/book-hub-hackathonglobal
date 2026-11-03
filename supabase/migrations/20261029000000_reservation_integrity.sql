-- Execute em ambiente de homologação antes de produção. Não apaga reservas.
BEGIN;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.bookhub_reservations WHERE exemplar_id IS NOT NULL AND status IN ('Pendente','Aprovado') GROUP BY exemplar_id HAVING COUNT(*) > 1) THEN
  RAISE EXCEPTION 'Reservas ativas duplicadas: reconcilie antes desta migração';
 END IF;
 IF EXISTS (SELECT 1 FROM public.bookhub_reservations r JOIN public.exemplares e ON e.id = r.exemplar_id WHERE r.book_id IS DISTINCT FROM e.livro_id) THEN
  RAISE EXCEPTION 'Reservas vinculadas a exemplares de outro livro: reconcilie antes da migração';
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS bookhub_reservations_one_active_exemplar_idx
 ON public.bookhub_reservations(exemplar_id) WHERE exemplar_id IS NOT NULL AND status IN ('Pendente','Aprovado');
COMMIT;
