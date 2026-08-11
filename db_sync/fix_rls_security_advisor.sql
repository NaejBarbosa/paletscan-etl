/* PALETSCAN - CORRECAO DE SEGURANCA RLS SUPABASE */

ALTER TABLE IF EXISTS public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fabricantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.codigos_barras ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.paletes_armazenados ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.paletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.logs_sessao ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(t) || ' ENABLE ROW LEVEL SECURITY;';
    END LOOP;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_produtos') THEN
        CREATE POLICY allow_all_produtos ON public.produtos FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_marcas') THEN
        CREATE POLICY allow_all_marcas ON public.marcas FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_fabricantes') THEN
        CREATE POLICY allow_all_fabricantes ON public.fabricantes FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_codigos_barras') THEN
        CREATE POLICY allow_all_codigos_barras ON public.codigos_barras FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_paletes_armazenados') THEN
        CREATE POLICY allow_all_paletes_armazenados ON public.paletes_armazenados FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_paletes') THEN
        CREATE POLICY allow_all_paletes ON public.paletes FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_logs_sessao') THEN
        CREATE POLICY allow_all_logs_sessao ON public.logs_sessao FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
