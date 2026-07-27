-- ==============================================================================
-- PALETSCAN ETL - SCRIPT SQL DE VALIDAÇÃO E ESTRUTURAÇÃO DE EAN-13 (SUPABASE)
-- Autor: Engenheiro de Dados Sênior / Arquiteto PaletScan
-- ==============================================================================
-- Este script realiza:
-- 1. Inspeção do tipo de dado da coluna 'codigo' (Garante VARCHAR/TEXT).
-- 2. Declaração da função PL/pgSQL para cálculo do 13º Dígito Verificador Modulus 10 (GS1).
-- 3. Sanitização e remoção de duplicidades legadas de 12 dígitos.
-- 4. Atualização para EAN-13 oficial (13 dígitos numéricos).
-- 5. Exibição de Resumo Estatístico e Amostra de Validação de Dados.
-- ==============================================================================

-- 1. INSPEÇÃO DO TIPO DE COLUNA NA SCHEMA PUBLIC
SELECT 
    table_name, 
    column_name, 
    data_type, 
    character_maximum_length
FROM 
    information_schema.columns
WHERE 
    table_schema = 'public' 
    AND table_name = 'codigos_barras' 
    AND column_name = 'codigo';

-- 2. CRIAÇÃO / ATUALIZAÇÃO DA FUNÇÃO DE CÁLCULO MODULUS 10 (GS1) EM PL/PGSQL
CREATE OR REPLACE FUNCTION fn_calculate_mod10_ean13(p_digits TEXT)
RETURNS TEXT AS $$
DECLARE
    v_clean TEXT;
    v_sum INT := 0;
    v_digit INT;
    v_mult INT;
    v_check INT;
    i INT;
BEGIN
    -- Limpa caracteres não numéricos
    v_clean := regexp_replace(p_digits, '\D', '', 'g');
    
    -- Tratamento para códigos de 13 dígitos com zero inicial (ex: 0789...)
    IF LENGTH(v_clean) = 13 AND (v_clean LIKE '0789%' OR v_clean LIKE '0790%') THEN
        v_clean := SUBSTRING(v_clean FROM 2);
    END IF;

    -- Se já tiver 13 dígitos numéricos válidos, retorna
    IF LENGTH(v_clean) = 13 THEN
        RETURN v_clean;
    END IF;

    -- Pad com zeros até 12 dígitos caso tenha menos
    IF LENGTH(v_clean) < 12 THEN
        v_clean := LPAD(v_clean, 12, '0');
    END IF;

    -- Se não tiver exatamente 12 dígitos, invalida
    IF LENGTH(v_clean) <> 12 THEN
        RETURN v_clean;
    END IF;

    -- Algoritmo GS1 Modulus 10 para EAN-13 (12 dígitos -> 13º dígito)
    FOR i IN 1..12 LOOP
        v_digit := CAST(SUBSTRING(v_clean FROM i FOR 1) AS INT);
        IF i % 2 = 1 THEN
            v_mult := 1;
        ELSE
            v_mult := 3;
        END IF;
        v_sum := v_sum + (v_digit * v_mult);
    END LOOP;

    v_check := (10 - (v_sum % 10)) % 10;
    RETURN v_clean || v_check::TEXT;
END;
$$ LANGUAGE plpgsql;

-- 3. SANITIZAÇÃO DE REGISTROS LEGADOS E DUPLICIDADES
-- Elimina linhas legadas de 12 dígitos onde a versão de 13 dígitos já se encontra presente
DELETE FROM codigos_barras a
USING codigos_barras b
WHERE a.tipo = 'EAN' 
  AND LENGTH(a.codigo) <> 13
  AND b.tipo = 'EAN'
  AND LENGTH(b.codigo) = 13
  AND fn_calculate_mod10_ean13(a.codigo) = b.codigo;

-- Atualiza os registros restantes de 12 dígitos para o padrão oficial de 13 dígitos
UPDATE codigos_barras
SET codigo = fn_calculate_mod10_ean13(codigo)
WHERE tipo = 'EAN' AND LENGTH(codigo) <> 13;

-- 4. RESUMO ESTATÍSTICO DE VALIDAÇÃO DO SUPABASE
SELECT 
    COUNT(*) AS total_eans_supabase,
    COUNT(CASE WHEN LENGTH(codigo) = 13 THEN 1 END) AS eans_com_13_digitos,
    COUNT(CASE WHEN LENGTH(codigo) <> 13 THEN 1 END) AS eans_fora_do_padrao,
    ROUND((COUNT(CASE WHEN LENGTH(codigo) = 13 THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2) || '%' AS percentual_conformidade
FROM 
    codigos_barras
WHERE 
    tipo = 'EAN';

-- 5. AMOSTRA DE DADOS VALIDADA (10 PRODUTOS ALEATÓRIOS COM EAN-13 E METADADOS)
SELECT 
    cb.id AS barcode_uuid,
    cb.codigo AS ean_13_oficial,
    LENGTH(cb.codigo) AS tamanho_digitos,
    p.descricao_padronizada AS produto_descricao,
    m.nome AS marca_nome,
    p.classe,
    p.conservacao,
    cb.criado_em AS data_sincronizacao
FROM 
    codigos_barras cb
JOIN 
    produtos p ON cb.produto_id = p.id
JOIN 
    marcas m ON p.marca_id = m.id
WHERE 
    cb.tipo = 'EAN'
ORDER BY 
    RANDOM()
LIMIT 10;
