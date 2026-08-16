-- ============================================================================
-- PALETSCAN - ETAPA 1: MIGRAÇÃO MULTI-TENANT & POLÍTICAS RLS NO SUPABASE
-- Data: 2026-08-16
-- ============================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TIPOS CUSTOMIZADOS (ENUMS)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('superadmin', 'empresa_admin', 'auditor', 'operador', 'leitor');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'palete_status') THEN
        CREATE TYPE palete_status AS ENUM ('armazenado', 'expedido', 'bloqueado', 'avaria', 'quarentena');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auditoria_status') THEN
        CREATE TYPE auditoria_status AS ENUM ('em_andamento', 'concluida', 'cancelada');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qrcode_status') THEN
        CREATE TYPE qrcode_status AS ENUM ('pending', 'authorized', 'consumed', 'expired');
    END IF;
END $$;

-- 3. TABELA: EMPRESAS (Tenants)
CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cnpj VARCHAR(18) UNIQUE NOT NULL,
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    configuracoes JSONB DEFAULT '{
        "dias_alerta_vencimento": 30,
        "bloquear_vaga_cheia": true,
        "permitir_multiplos_paletes_vaga": false,
        "camaras_padrao": ["1", "2", "3", "4", "5"]
    }'::jsonb,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABELA: PROFILES (Perfis de Usuários com vínculo em auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'operador',
    telefone VARCHAR(30),
    ativo BOOLEAN DEFAULT true,
    ultimo_acesso TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. TABELA: PALETES (Substitui e expande paletes/paletes_armazenados)
CREATE TABLE IF NOT EXISTS public.paletes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES public.profiles(id),
    produto_id UUID REFERENCES public.produtos(id),
    produto_ean VARCHAR(13) NOT NULL,
    validade DATE NOT NULL,
    camara VARCHAR(50) NOT NULL,
    vaga VARCHAR(50) NOT NULL,
    lote VARCHAR(100),
    quantidade INT DEFAULT 1,
    status palete_status DEFAULT 'armazenado',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. TABELA: LOCAIS DE ARMAZENAGEM (Câmaras & Vagas Cadastradas)
CREATE TABLE IF NOT EXISTS public.locais_armazenagem (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    camara VARCHAR(50) NOT NULL,
    vaga VARCHAR(50) NOT NULL,
    tipo_temperatura VARCHAR(50) DEFAULT 'congelado',
    capacidade_maxima INT DEFAULT 1,
    bloqueado BOOLEAN DEFAULT false,
    motivo_bloqueio TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(empresa_id, camara, vaga)
);

-- 7. TABELAS: AUDITORIAS & ITENS CONCILIADOS
CREATE TABLE IF NOT EXISTS public.auditorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    auditor_id UUID NOT NULL REFERENCES public.profiles(id),
    camaras_auditadas TEXT[] NOT NULL,
    total_paletes_esperados INT DEFAULT 0,
    total_paletes_encontrados INT DEFAULT 0,
    total_divergencias INT DEFAULT 0,
    resumo_divergencias JSONB DEFAULT '{}'::jsonb,
    status auditoria_status DEFAULT 'em_andamento',
    data_inicio TIMESTAMPTZ DEFAULT now(),
    data_conclusao TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.auditoria_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auditoria_id UUID NOT NULL REFERENCES public.auditorias(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    produto_ean VARCHAR(13) NOT NULL,
    validade DATE,
    camara VARCHAR(50) NOT NULL,
    vaga VARCHAR(50) NOT NULL,
    status_conciliacao VARCHAR(50) NOT NULL,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. TABELAS: WATCHLISTS (Listas do Radar)
CREATE TABLE IF NOT EXISTS public.watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) DEFAULT 'geral',
    itens JSONB NOT NULL DEFAULT '[]'::jsonb,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. TABELA: QRCODE AUTH SESSIONS (Login por QR Code Mobile)
CREATE TABLE IF NOT EXISTS public.qrcode_auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(64) UNIQUE NOT NULL,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    authorized_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    status qrcode_status DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. TABELA: LOGS DE SESSÃO E AUDITORIA OPERACIONAL
CREATE TABLE IF NOT EXISTS public.logs_sessao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    acao VARCHAR(100) NOT NULL,
    detalhes JSONB DEFAULT '{}'::jsonb,
    ip VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- FUNÇÕES DE CONTEXTO E SEGURANÇA (SECURITY DEFINER)
-- ============================================================================

CREATE OR REPLACE FUNCTION auth.get_user_empresa_id() 
RETURNS UUID AS $$
    SELECT empresa_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION auth.get_user_role() 
RETURNS user_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION auth.is_superadmin() 
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'superadmin' AND ativo = true
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- TRIGGER: Auto-criação de profile ao registrar novo auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_empresa_id UUID;
BEGIN
    SELECT id INTO default_empresa_id FROM public.empresas LIMIT 1;
    IF default_empresa_id IS NULL THEN
        INSERT INTO public.empresas (cnpj, razao_social, nome_fantasia)
        VALUES ('00.000.000/0001-00', 'Empresa Matriz PaletScan', 'PaletScan Padrão')
        RETURNING id INTO default_empresa_id;
    END IF;

    INSERT INTO public.profiles (id, empresa_id, nome, email, role)
    VALUES (
        NEW.id,
        COALESCE((NEW.raw_user_meta_data->>'empresa_id')::UUID, default_empresa_id),
        COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'operador')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- ATIVAÇÃO E REGRAS RLS (ROW LEVEL SECURITY)
-- ============================================================================

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabricantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codigos_barras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locais_armazenagem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qrcode_auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_sessao ENABLE ROW LEVEL SECURITY;

-- 1. POLÍTICAS: CATÁLOGO MESTRE (Público autenticado / Superadmin escrita)
DROP POLICY IF EXISTS "produtos_select_all" ON public.produtos;
CREATE POLICY "produtos_select_all" ON public.produtos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "produtos_superadmin_write" ON public.produtos;
CREATE POLICY "produtos_superadmin_write" ON public.produtos FOR ALL TO authenticated 
    USING (auth.is_superadmin()) WITH CHECK (auth.is_superadmin());

DROP POLICY IF EXISTS "marcas_select_all" ON public.marcas;
CREATE POLICY "marcas_select_all" ON public.marcas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "fabricantes_select_all" ON public.fabricantes;
CREATE POLICY "fabricantes_select_all" ON public.fabricantes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "codigos_barras_select_all" ON public.codigos_barras;
CREATE POLICY "codigos_barras_select_all" ON public.codigos_barras FOR SELECT TO authenticated USING (true);

-- 2. POLÍTICAS: EMPRESAS & PROFILES
DROP POLICY IF EXISTS "empresas_isolation_select" ON public.empresas;
CREATE POLICY "empresas_isolation_select" ON public.empresas FOR SELECT TO authenticated 
    USING (id = auth.get_user_empresa_id() OR auth.is_superadmin());

DROP POLICY IF EXISTS "profiles_isolation_select" ON public.profiles;
CREATE POLICY "profiles_isolation_select" ON public.profiles FOR SELECT TO authenticated 
    USING (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin());

DROP POLICY IF EXISTS "profiles_isolation_update" ON public.profiles;
CREATE POLICY "profiles_isolation_update" ON public.profiles FOR UPDATE TO authenticated 
    USING (
        (empresa_id = auth.get_user_empresa_id() AND auth.get_user_role() IN ('empresa_admin', 'superadmin'))
        OR id = auth.uid()
    )
    WITH CHECK (
        (empresa_id = auth.get_user_empresa_id() AND auth.get_user_role() IN ('empresa_admin', 'superadmin'))
        OR id = auth.uid()
    );

-- 3. POLÍTICAS: PALETES (ISOLAMENTO MULTI-TENANT)
DROP POLICY IF EXISTS "paletes_isolation_all" ON public.paletes;
CREATE POLICY "paletes_isolation_all" ON public.paletes FOR ALL TO authenticated 
    USING (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin())
    WITH CHECK (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin());

-- 4. POLÍTICAS: LOCAIS DE ARMAZENAGEM
DROP POLICY IF EXISTS "locais_isolation_all" ON public.locais_armazenagem;
CREATE POLICY "locais_isolation_all" ON public.locais_armazenagem FOR ALL TO authenticated 
    USING (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin())
    WITH CHECK (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin());

-- 5. POLÍTICAS: AUDITORIAS & ITENS
DROP POLICY IF EXISTS "auditorias_isolation_all" ON public.auditorias;
CREATE POLICY "auditorias_isolation_all" ON public.auditorias FOR ALL TO authenticated 
    USING (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin())
    WITH CHECK (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin());

DROP POLICY IF EXISTS "auditoria_itens_isolation_all" ON public.auditoria_itens;
CREATE POLICY "auditoria_itens_isolation_all" ON public.auditoria_itens FOR ALL TO authenticated 
    USING (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin())
    WITH CHECK (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin());

-- 6. POLÍTICAS: WATCHLISTS
DROP POLICY IF EXISTS "watchlists_isolation_all" ON public.watchlists;
CREATE POLICY "watchlists_isolation_all" ON public.watchlists FOR ALL TO authenticated 
    USING (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin())
    WITH CHECK (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin());

-- 7. POLÍTICAS: QR CODE SESSIONS
DROP POLICY IF EXISTS "qrcode_isolation_all" ON public.qrcode_auth_sessions;
CREATE POLICY "qrcode_isolation_all" ON public.qrcode_auth_sessions FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- 8. POLÍTICAS: LOGS DE SESSÃO
DROP POLICY IF EXISTS "logs_sessao_isolation_all" ON public.logs_sessao;
CREATE POLICY "logs_sessao_isolation_all" ON public.logs_sessao FOR ALL TO authenticated 
    USING (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin())
    WITH CHECK (empresa_id = auth.get_user_empresa_id() OR auth.is_superadmin());
