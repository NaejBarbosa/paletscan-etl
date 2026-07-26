# 📦 PaletScan ETL & Data Architecture - Contexto do Projeto

> 🤖 **AVISO PARA O AGENTE DE IA (REGRA MESTRA DE ATUALIZAÇÃO):**  
> Você deve **ATUALIZAR ESTE ARQUIVO AUTOMATICAMENTE** sempre que implementar uma nova grande funcionalidade, adicionar novos scrapers, alterar a estrutura do banco de dados (schema_manifest) ou realizar modificações arquiteturais relevantes no projeto.

---

## 🚀 1. Visão Geral do Projeto

O **PaletScan** é uma solução Progressive Web App (PWA) de alto desempenho para escaneamento de códigos de barras, controle rigoroso de validades e endereçamento dinâmico de paletes em câmaras frias. É voltado especialmente para a indústria alimentícia de produtos perecíveis e de alto giro (*meatpacking*, congelados e resfriados).

### 🏆 Marco Técnico e Engenharia
O projeto tem como diferencial um marco técnico impressionante: foi inteiramente idealizado e desenvolvido por **Jean Barbosa (Operador de Empilhadeira)**, construído diretamente a partir de um smartphone Android rodando um ambiente containerizado Linux (Ubuntu no Termux). A aplicação combina inteligência operacional de chão de fábrica com arquitetura de software profissional.

---

## 🗄️ 2. Arquitetura de Banco de Dados (Supabase / PostgreSQL)

O modelo relacional do PaletScan foi projetado para eliminar duplicidades e garantir integridade referencial anti-redundância no PostgreSQL / Supabase:

```
[ Fabricantes (Holdings) ]
         │ (1:N)
         ▼
    [ Marcas ]
         │ (1:N)
         ▼
   [ Produtos ] ◄── Normalização de Pesos e Textos
         │ (1:N)
         ▼
[ Codigos_Barras ] (SKU, EAN-13, DUN-14)
```

### 🔑 Identificadores Determinísticos (UUIDv5)
Para evitar registros duplicados em execuções repetidas do ETL (upserts concorrentes), os IDs de todas as tabelas são gerados no Node.js via **UUIDv5** a partir de um `PALETSCAN_NAMESPACE` estático (`6ba7b810-9dad-11d1-80b4-00c04fd430c8`).
- `toUUID5("fab_friboi_jbs")` $\rightarrow$ ID único e imutável para a holding.
- `toUUID5("prod_friboi_1005")` $\rightarrow$ ID único para o produto SKU 1005.
- As chaves estrangeiras (`fabricante_id`, `marca_id`, `produto_id`) são convertidas em cascata preservando a integridade relacional.

---

## ⚙️ 3. Pipeline de ETL e Inteligência Artificial Local

O pipeline de dados é dividido em camadas modulares em TypeScript/Node.js e Python:

1. **Extração Isolada (Scrapers)**: Módulos dedicados em `scrapers/<empresa>/index.ts` extraem os catálogos B2B sem acoplamento.
2. **Normalização de Texto e Pesos (`core/normalizers/text_parser.ts`)**:
   - Converte strings ALL CAPS para Title Case respeitando a acentuação em PT-BR (corrigindo termos como "Filé", "Moída", "Acém").
   - Extrai pesos fixos para gramas numéricas (`peso_gramas`).
   - Identifica cortes fracionados/peso variável e ajusta a descrição para `"Nome do Produto (pesar)"` ou `"Nome do Produto + Peso"`.
3. **Classificação Heurística (`core/heuristics/`)**:
   - Classifica automaticamente marcas secundárias (*Friboi Black, Maturatta, Do Chef, 1953, Swift, etc.*).
   - Infere a classe do produto (*Bovinos, Suínos, Aves, Pescados, Processados*) e o estado de conservação (*Resfriado, Congelado, Temperatura Ambiente*).
4. **Pipeline de Imagens e IA Local (`images/ai_pipeline/process_image.py`)**:
   - Inspeciona URLs da fonte: se for um placeholder genérico (como `355027_05.jpeg` ou `_00.JPG`), o produto vai para a matriz `pending_images_approval`.
   - Para fotos reais: realiza a remoção do fundo com rede neural local (`rembg` em Python), converte para `.webp` transparente em `images/processed/` e efetua upload para o Supabase Storage (`produtos-imagens`), atualizando a `imagem_url` para o status `aprovado` e movendo o arquivo para `images/archived/`.

---

## ✅ 4. O Que Já Foi Feito

- [x] **Estrutura Base do Repositório**: Diretórios `scrapers/`, `core/`, `images/`, `staging/`, `db_sync/`.
- [x] **Esquema de Validação Rigoroso**: Manifesto JSON Schema em [`core/manifest/schema_manifest.json`](file:///root/paletscan-etl/core/manifest/schema_manifest.json).
- [x] **Módulo Normalizador de Texto e Pesos**: [`core/normalizers/text_parser.ts`](file:///root/paletscan-etl/core/normalizers/text_parser.ts).
- [x] **Heurísticas de Marca e Categoria**: [`core/heuristics/brand_classifier.ts`](file:///root/paletscan-etl/core/heuristics/brand_classifier.ts) e [`category_classifier.ts`](file:///root/paletscan-etl/core/heuristics/category_classifier.ts).
- [x] **Pipeline de IA para Remoção de Fundo**: [`images/ai_pipeline/process_image.py`](file:///root/paletscan-etl/images/ai_pipeline/process_image.py).
- [x] **Scraper Friboi B2B**: Extrator em [`scrapers/friboi/index.ts`](file:///root/paletscan-etl/scrapers/friboi/index.ts) gerando staging normalizado em `staging/friboi_staging.json` (1.813 produtos, 3.355 códigos de barras, 557 pendências de imagem).
- [x] **Script de Sincronização Supabase (UUIDv5)**: [`db_sync/sync.ts`](file:///root/paletscan-etl/db_sync/sync.ts) para conversão determinística e upserts em ordem relacional.
- [x] **Pipeline de Carga de Mídia e Arquivamento**: [`db_sync/sync_images.ts`](file:///root/paletscan-etl/db_sync/sync_images.ts).

---

## 🎯 5. Próximos Passos (Next Steps)

1. **Integração Backend Supabase com Frontend PWA**: Conectar o novo banco relacional PostgreSQL/Supabase à aplicação PWA em produção, substituindo a integração legada via Google Sheets.
2. **Painel ADM de Aprovação de Imagens Pendentes**: Desenvolver a interface administrativa para revisão das 557 imagens marcadas como `pendente_aprovacao`.
3. **Busca Unificada Fuzzy no PWA**: Implementar busca rápida por SKU, EAN-13, DUN-14 e termos aproximados de produtos diretamente no scanner do operador.
