-- ==============================================================================
-- PALETSCAN / SUPABASE - SCRIPT DE CORREÇÃO DE SEGURANÇA (RLS SECURITY ADVISOR)
-- Projeto Supabase Ref: xyujqsitpshfqnlogeib
-- Objetivo: Resolver o alerta 'rls_disabled_in_public' (Table publicly accessible)
-- Autor: Antigravity AI / Arquiteto de Sistemas
-- ==============================================================================

-- 1. HABILITAR ROW LEVEL SECURITY (RLS) E CRIAR POLÍTICAS EM TODAS AS TABELAS DO SCHEMA PUBLIC
DO $$
DECLARE
    r RECORD;
    v_policy_name TEXT;
BEGIN
    -- Habilita RLS em cada tabela presente no schema public
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
        RAISE NOTICE 'RLS ativado com sucesso para a tabela: %', r.tablename;
    END LOOP;

    -- Cria politica de acesso para tabelas que ainda nao possuem politicas
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    ) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = r.tablename
        ) THEN
            v_policy_name := 'policy_allow_all_' || r.tablename;
            EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true);', v_policy_name, r.tablename);
            RAISE NOTICE 'Politica de acesso % criada para a tabela %', v_policy_name, r.tablename;
        END IF;
    END LOOP;
END $$;

-- 2. VERIFICAÇÃO FINAL DO STATUS DO RLS NAS TABELAS DO SCHEMA PUBLIC
SELECT 
    schemaname,
    tablename,
    rowsecurity AS rls_habilitado
FROM 
    pg_tables 
WHERE 
    schemaname = 'public'
ORDER BY 
    tablename;
