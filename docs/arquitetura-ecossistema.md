# 🏗️ Arquitetura Integrada Ponta a Ponta

A simbiose entre o **Pipeline ETL** e o **PaletScan PWA** foi desenhada para resolver um clássico dilema da engenharia de software industrial: **como manter um catálogo corporativo massivo atualizado sem comprometer a autonomia, a velocidade e a resiliência offline da operação de campo?**

---

## 🔄 1. O Circuito Fechado de Dados (Closed-Loop Data Flow)

O ecossistema opera através de um circuito fechado de dados bidirecional:

```mermaid
flowchart TD
    subgraph Nuvem ["1. Nuvem e Fornecedores"]
        A["Portais B2B e APIs dos Frigoríficos"]
        B["Pipeline ETL (paletscan-etl)"]
        C["Supabase PostgreSQL - Catálogo Mestre"]
        A --> B
        B --> C
    end

    subgraph Sync ["2. Sincronização Sob Demanda"]
        D["Motor de Sincronização (sync.ts)"]
        E["WatermelonDB Local (Schema v11)"]
        D --> E
    end

    subgraph ChaoDeFabrica ["3. Chão de Fábrica e Câmaras Frigoríficas"]
        F["Leitura Óptica e Scanner"]
        G["Validação e Registro de Vaga"]
        H["Vínculo Manual de DUN-14 e Pesagem"]
        F --> G
        G --> H
    end

    subgraph Feedback ["4. Realimentação e Imunidade"]
        I["API de Cadastro e Sincronização"]
        J["Tabela produtos_atributos_manuais"]
        I --> J
    end

    C -->|1. Hash Check e Delta Sync| D
    E -->|2. Consulta Reativa Imediata| F
    H -->|3. Gravação Offline Imediata| E
    H -->|4. Fila pending_sync ao Reconectar| I
    J -->|5. Precedência Absoluta sobre ETL| C
```

---

## 🛡️ 2. Modelo de Convivência e Imunidade de Dados Manuais

Um dos problemas mais comuns em pipelines ETL corporativos é a sobreescrita acidental de dados refinados manualmente por operadores de campo durante as cargas automatizadas de fornecedores.

Para solucionar isso, o PaletScan implementa o padrão **Dual-Layer Persistence**:

### A. Tabela de Overrides (`produtos_atributos_manuais`)
Quando um operador de empilhadeira vincula uma caixa master (DUN-14) ou um código de pesagem de balança através do modal [`GerenciarCodigosModal.tsx`](file:///root/repo_pwa/components/GerenciarCodigosModal.tsx), esse dado é gravado na tabela `produtos_atributos_manuais`:

```sql
-- Estrutura da tabela de blindagem contra sobrescritas do ETL
CREATE TABLE produtos_atributos_manuais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produto_ean VARCHAR(20) NOT NULL UNIQUE,
    dun_14 VARCHAR(20),
    pesar_cod VARCHAR(10),
    classe_manual VARCHAR(50),
    conservacao_manual VARCHAR(50),
    atualizado_por VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### B. Views Relacionais Consolidadas (`vw_produtos_com_marcas`)
O catálogo mestre consumido pelo PWA é servido através de Views SQL que utilizam a cláusula `COALESCE` para priorizar rigorosamente o dado manual inserido pelo operador:

```sql
CREATE OR REPLACE VIEW vw_produtos_com_marcas AS
SELECT 
    p.ean,
    COALESCE(m.dun_14, p.dun) AS dun,
    p.marca_id,
    pr_marca.nome AS marca_nome,
    COALESCE(m.classe_manual, p.classe) AS classe,
    COALESCE(m.conservacao_manual, p.conservacao) AS conservacao,
    p.descricao,
    COALESCE(m.pesar_cod, p.pesar_cod) AS pesar_cod,
    p.imagem_url,
    p.updated_at
FROM produtos p
LEFT JOIN marcas pr_marca ON p.marca_id = pr_marca.id
LEFT JOIN produtos_atributos_manuais m ON p.ean = m.produto_ean;
```

---

## ⚡ 3. Instant Sync em Menos de 30ms (Status Hash)

Para não sobrecarregar a franquia de dados móveis e garantir velocidade instantânea de inicialização no coletor, o motor de sincronização utiliza um algoritmo de comparação de integridade baseado em hashes:

1. **Consulta Leve de Hash**: O PWA dispara uma requisição ultra-rápida (`GET /api/status-hash`) que retorna a contagem de registros e o timestamp da última mutação no Supabase.
2. **Comparação com Cache Local**: Se os hashes `ps_pwa_db_hash` e `ps_pwa_paletes_hash` coincidirem com os valores locais salvos no `localStorage`, a sincronização é **finalizada em menos de 30ms** sem transferir nenhuma linha do catálogo.
3. **Delta Download**: Se houver divergência, o sistema baixa exclusivamente os registros adicionados ou modificados desde o último timestamp, atualizando atomicamente o WatermelonDB local.

---

## 📦 4. Contratos de Dados e Tipagens Compartilhadas

Ambos os projetos compartilham as mesmas convenções de tipagem TypeScript para SKUs, conservação e códigos de barras:

| Campo | Tipo TypeScript | Validação / Padrão | Origem Principal |
| :--- | :--- | :--- | :--- |
| `ean` | `string` | 13 dígitos numéricos (Modulus 10 GS1) | ETL B2B / Cadastro PWA |
| `dun` | `string \| null` | 14 dígitos numéricos (Modulus 10 GS1) | Scraper B2B / Vínculo Manual PWA |
| `marca_nome` | `string` | Title Case (ex: *Friboi*, *Sadia*, *Lar*) | Classificador Heurístico ETL |
| `classe` | `string` | 10 Classes Canônicas | Heurística ETL / Override Manual |
| `conservacao` | `'Congelado' \| 'Resfriado'` | Restrição estrita de câmara fria | Classificador Heurístico ETL |
| `pesar_cod` | `string \| null` | 1 a 6 dígitos numéricos | Detecção `(pesar)` / Balança PWA |
| `validade` | `string` | Formato `DD/MM/AAAA` | Decodificador Regex PWA (AI 17/11) |
| `camara` | `'R1' \| 'R2' \| 'C1' \| 'C2'` | Chave de endereçamento de câmara | Seletor de Vagas PWA |
| `vaga` | `string` | 4 caracteres contínuos (ex: `A10D`) | Seletor de Vagas PWA |
