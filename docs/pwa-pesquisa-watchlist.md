# 🔎 Pesquisa, Consulta & Radar Watchlist

O módulo de **Pesquisa e Consulta** ([`PesquisaProduto.tsx`](file:///root/repo_pwa/components/PesquisaProduto.tsx)) é a central de consulta técnica de SKUs, busca inteligente por aproximação textual e monitoramento prioritário de validades (Watchlist) no **PaletScan PWA**.

---

## 🔍 1. Busca Avançada por Aproximação (Fuzzy Matching)

* **Biblioteca `fuzzball`**: Algoritmo `token_set_ratio` que tolera erros de digitação e acentuação cometidos no teclado do smartphone.
* **Consulta Local Imediata**: Busca reativa sobre o catálogo mestre sincronizado no WatermelonDB, sem depender de conexão de rede.

---

## 🎯 2. Radar de Produtos Procurados (Multi-Watchlists)

O módulo de radar gerencia listas prioritárias e cruza os dados com o estoque em tempo real em um fluxo estritamente vertical:

```mermaid
flowchart TD
    RADAR["🎯 Módulo Radar Watchlist"]
    
    RADAR --> G1["📋 1. Gestor de Múltiplas Listas"]
    G1 --> D1["Listas Segmentadas (ex: Validades Críticas, Friboi, Fim de Semana)"]
    
    D1 --> G2["📍 2. Localizador Geográfico em Estoque"]
    G2 --> D2["Cruzamento Automático com Vagas Físicas (ex: R1 - B21E)"]
    
    D2 --> G3["🎉 3. Alerta Visual e Gamificação"]
    G3 --> D3["Feedback Sonoro e Efeito de Confetes ao Bipar Item Monitorado"]
```

---

## 🏷️ 3. Gerenciamento e Vínculo de Códigos (`GerenciarCodigosModal.tsx`)

* **Vínculo de Caixas (DUN-14)**: Permite associar códigos de caixa máster de 14 dígitos a produtos EAN consumidores.
* **Código de Pesagem / Balança**: Restrito estritamente a produtos fracionados de peso variável.
* **Gravação Segura**: Persistido com prioridade na tabela `produtos_atributos_manuais`, garantindo imunidade contra rotinas automáticas de ETL.
