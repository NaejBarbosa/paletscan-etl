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
[ Codigos_Barras ] (SKU, EAN-13, DUN-14) ◄── Resiliência a Conflitos de EAN/DUN & Higienização SQL
```

### 🔑 Identificadores Determinísticos (UUIDv5) & Tratamento de Conflitos Cross-Scraper
- Os IDs de todas as tabelas são gerados no Node.js via **UUIDv5** a partir de um `PALETSCAN_NAMESPACE` estático (`6ba7b810-9dad-11d1-80b4-00c04fd430c8`).
- **Resiliência a Colisões de EAN/DUN**: Como a coluna `codigo` da tabela `codigos_barras` possui constraint `UNIQUE`, colisões entre scrapers de fornecedores diferentes não interrompem o pipeline. O script [`db_sync/sync.ts`](file:///root/paletscan-etl/db_sync/sync.ts) executa um fallback item-por-item, "engole" erros de duplicidade (`23505`), ignora a inserção conflitante e registra os detalhes em `staging/conflicts_log.json`.
- **Preservação do Tipo de Dado e Zeros à Esquerda**: A coluna `codigo` é estritamente configurada como `VARCHAR` / `TEXT` no PostgreSQL, garantindo que códigos iniciados com zero (ex: `0789...`) ou strings completas de 13 e 14 dígitos não sofram truncamento de zeros nem coerção inadequada para tipos inteiros.
- **Higienização SQL em Nível de Banco (`db_sync/validar_e_corrigir_eans.sql`)**: Função em PL/pgSQL (`fn_calculate_mod10_ean13`) que roda diretamente no Supabase para sanitizar registros legados de 12 dígitos, remover duplicidades retroativas e atualizar a base para 100% de conformidade com EAN-13.

---

## ⚙️ 3. Pipeline de ETL e Inteligência Artificial Local

O pipeline de dados é totalmente independente e executa requisições web HTTP ao vivo:

1. **Extração Web ao Vivo (Fetch & Parse)**: O módulo [`scrapers/friboi/index.ts`](file:///root/paletscan-etl/scrapers/friboi/index.ts) realiza web scraping em tempo real baixando o sitemap XML oficial do portal B2B Friboi (`https://www.friboionline.com.br/productSitemap.xml`) e consultando concorrentemente as APIs HTTP de produto (`ccstoreui/v1/products/`) para capturar dados vivos.
2. **Integridade e Preservação de Dígitos de Códigos de Barras (`normalizeEAN13` e `normalizeDUN14`)**:
   - **Tipagem Estrita como String**: Códigos EAN e DUN são tratados integralmente como `string` em todas as etapas (scraping, parsing, staging e sync), eliminando truncamento de zeros à esquerda ou conversões numéricas acidentais.
   - **Cálculo de Dígito Verificador Modulus 10 (GS1) para EAN-13**: EANs extraídos com 12 dígitos (ou com `0` à esquerda espúrio em sequências de 13 dígitos como `0789...` / `0790...`) têm o zero inicial limpo e o 13º dígito verificador recalculado via algoritmo GS1 Modulus 10, garantindo o código oficial completo de 13 dígitos.
   - **Formatação e Derivação de DUN-14 (14 Dígitos)**: Códigos DUN com 13 dígitos recebem o 14º dígito verificador Modulus 10. Quando o DUN não é informado na origem, ele é derivado automaticamente a partir do EAN-13 (Variante logística `'1'` + 12 dígitos base do EAN + Dígito Verificador Modulus 10), garantindo DUN-14 de 14 dígitos completo.
3. **Normalização de Texto e Pesos (`core/normalizers/text_parser.ts`)**:
   - Converte strings ALL CAPS para Title Case respeitando a acentuação em PT-BR (corrigindo termos como "Filé", "Moída", "Acém").
   - Extrai pesos fixos para gramas numéricas (`peso_gramas`).
   - Identifica cortes fracionados/peso variável e ajusta a descrição para `"Nome do Produto (pesar)"` ou `"Nome do Produto + Peso"`.
4. **Validação de Imagens Reais do Produto (`isValidProductImage` / `extractBestProductImage`)**:
   - **Busca Exaustiva de Candidatos**: Varre concorrentemente todos os campos de imagem no JSON da API CCStore (`primaryFullImageURL`, `primaryLargeImageURL`, `fullImageURLs`, `sourceImageURLs` e `childSKUs`).
   - **Correspondência Exata de SKU**: Garante que o número de SKU presente no nome do arquivo da imagem (`/products/<SKU>_(00|01)_<slug>`) corresponda estritamente ao SKU do produto sob inspeção, eliminando imagens de outros produtos ou da vitrine da página.
   - **Filtro de Acurácia Semântica**: Exige sobreposição semântica de palavras-chave entre o slug do arquivo de imagem e o título do produto.
   - **Filtro Heurístico Rigoroso**: Rejeita banners promocionais, fotos de receitas/pratos prontos (`_02`, `_03`, `_05`), logos institucionais (`_50`), selos, tabelas nutricionais e placeholders genéricos. Retorna `null` caso não haja acurácia suficiente para confirmar a imagem do produto.
5. **Pipeline de Imagens com Fundo Branco Sólido e IA Local (`images/ai_pipeline/process_image.py`)**:
   - Remoção de fundo com IA local (`rembg` em Python).
   - Achatamento do canal alpha sobre fundo branco sólido RGB (`#FFFFFF`).
   - Redimensionamento máximo otimizado (`--max-dim 1000`) e conversão para `.webp` leve (< 100-150KB) mantendo alta nitidez.
   - Upload para o Supabase Storage (`produtos-imagens`), atualizando a `imagem_url` para o status `aprovado` e movendo o arquivo para `images/archived/`.

---

## ✅ 4. O Que Já Foi Feito

- [x] **Estrutura Base do Repositório**: Diretórios `scrapers/`, `core/`, `images/`, `staging/`, `db_sync/`.
- [x] **Esquema de Validação Rigoroso**: Manifesto JSON Schema em [`core/manifest/schema_manifest.json`](file:///root/paletscan-etl/core/manifest/schema_manifest.json).
- [x] **Integridade Estrita e Dígitos Completos de EAN-13 e DUN-14**:
  - Manipulação estrita de EAN e DUN como `string` em todas as fases.
  - Modulus 10 GS1 para cálculo automático do 13º dígito em EANs de 12 dígitos e derivador de DUN-14 de 14 dígitos em [`core/normalizers/text_parser.ts`](file:///root/paletscan-etl/core/normalizers/text_parser.ts).
  - Remoção de artefatos de zeros à esquerda (`0789...` / `0790...`) e reconstrução dos 13/14 dígitos reais.
- [x] **Script SQL de Higienização e Correção de EAN no Supabase**:
  - Script em PL/pgSQL [`db_sync/validar_e_corrigir_eans.sql`](file:///root/paletscan-etl/db_sync/validar_e_corrigir_eans.sql) com função `fn_calculate_mod10_ean13`.
  - Limpeza de registros legados duplicados e padronização da coluna `codigo` como `TEXT`/`VARCHAR` com 100% de conformidade.
- [x] **Algoritmo de Acurácia e Seleção Exaustiva de Imagens Reais**:
  - Validação de correspondência de SKU exato no nome do arquivo de imagem e busca em múltiplos campos de candidatos (incluindo `childSKUs`).
  - Filtro de acurácia semântica com o título do produto e rejeição de imagens de outras seções da página ou receitas em [`scrapers/friboi/index.ts`](file:///root/paletscan-etl/scrapers/friboi/index.ts).
- [x] **Padronização de Fundo Branco e Otimização WebP**: Pipeline Python em [`images/ai_pipeline/process_image.py`](file:///root/paletscan-etl/images/ai_pipeline/process_image.py).
- [x] **Módulo Normalizador de Texto e Pesos**: [`core/normalizers/text_parser.ts`](file:///root/paletscan-etl/core/normalizers/text_parser.ts).
- [x] **Heurísticas de Marca e Categoria**: [`core/heuristics/brand_classifier.ts`](file:///root/paletscan-etl/core/heuristics/brand_classifier.ts) e [`category_classifier.ts`](file:///root/paletscan-etl/core/heuristics/category_classifier.ts).
- [x] **Web Scraper Friboi B2B em Tempo Real**: [`scrapers/friboi/index.ts`](file:///root/paletscan-etl/scrapers/friboi/index.ts).
- [x] **Sincronização em Tempo Real do Frontend PWA com o Supabase**:
  - Limpeza completa de arquivos estáticos residuais em `public/imagens_produtos/`.
  - Atualização do componente [`ProdutoAvatar.tsx`](file:///root/repo_pwa/components/ProdutoAvatar.tsx) no repositório PWA para respeitar o status `sem_imagem` do Supabase e desativar fallbacks para imagens locais legadas.
  - Ajuste na API `/api/validar` com redução do TTL de cache para 1 minuto e suporte a consulta direta em tempo real no Supabase.
- [x] **Pipeline de Sincronização Resiliente Supabase (UUIDv5 & Fail-safe Conflitos EAN)**: [`db_sync/sync.ts`](file:///root/paletscan-etl/db_sync/sync.ts) com suporte a múltiplos arquivos de staging e salvamento de log em `staging/conflicts_log.json`.
- [x] **Pipeline de Carga de Mídia e Arquivamento**: [`db_sync/sync_images.ts`](file:///root/paletscan-etl/db_sync/sync_images.ts).
- [x] **Web Scraper Multi-Fonte BRF S.A.**: [`scrapers/brf/index.ts`](file:///root/paletscan-etl/scrapers/brf/index.ts) com extração combinada de sitemaps Sadia/Perdigão, portal B2B e PDF comercial, gerando 1.120 produtos e 3.184 EANs/DUNs.
- [x] **Gerador de Relatórios Excel (.xlsx)**: Scripts [`scripts/export_excel.ts`](file:///root/paletscan-etl/scripts/export_excel.ts) e [`scripts/export_pending.ts`](file:///root/paletscan-etl/scripts/export_pending.ts) com envio direto para a pasta Download e integração com `termux-media-scan`.
- [x] **Web Scraper Lar Cooperativa Agroindustrial**: [`scrapers/lar/index.ts`](file:///root/paletscan-etl/scrapers/lar/index.ts) com sitemap XML ao vivo, gerando 111 produtos e 218 códigos de barras válidos com EAN.
- [x] **Validação Estrita de EAN Obrigatório (Módulo ETL & Banco)**:
  - Trava estrita em [`db_sync/sync.ts`](file:///root/paletscan-etl/db_sync/sync.ts) que padroniza descrições para Title Case com pesagem exata (`1kg`, `700g`, `1,005kg`) ou `(pesar)` e executa higienização automatizada pós-sincronização.
  - Higienização e auditoria automatizada em [`db_sync/sanitize_supabase_db.ts`](file:///root/paletscan-etl/db_sync/sanitize_supabase_db.ts) e [`scripts/audit_database.ts`](file:///root/paletscan-etl/scripts/audit_database.ts), consolidando a base mestre em **3.001 produtos 100% padronizados e exclusivamente respaldados por EAN** (0 anomalias).
- [x] **Tratamento de Modais e Busca Fuzzy no PWA (`repo_pwa`)**:
  - Gerados e sincronizados os arquivos [`repo_pwa/produtos.json`](file:///root/repo_pwa/produtos.json) e [`repo_pwa/public/produtos.json`](file:///root/repo_pwa/public/produtos.json) contendo os 3.001 produtos purificados em *Title Case* com pesagem exata e 0 anomalias.
  - Unificada a constante de cache `PRODUCT_CATALOG_CACHE_KEY` (`banco_valida_data_v38_clean`) em [`repo_pwa/lib/cache.ts`](file:///root/repo_pwa/lib/cache.ts) e em todas as APIs (`validar.ts`, `atualizar-conservacao.ts`, `atualizar-pesar-cod.ts`, `cadastrar-produto.ts`, `atualizar-classe.ts`), com fallback local robusto para `produtos.json`.
  - Corrigida a lógica em [`repo_pwa/pages/index.tsx`](file:///root/repo_pwa/pages/index.tsx) para **sempre priorizar a base viva da API (`apiProducts`)**, eliminando o bloqueio por contagem de cache local.
  - Ajustada a resposta do sincronizador [`repo_pwa/lib/database/sync.ts`](file:///root/repo_pwa/lib/database/sync.ts) durante `forceReset` para retornar produtos no array `created` (em vez de `updated`), garantindo o repovoamento total dos registros purificados em Title Case (3.001 produtos e 0 anomalias).
- [x] **Módulo de Validação e Aprovação de Imagens Pendentes no PWA**: Módulo administrativo em [`repo_pwa/components/ValidacaoPendenciasAdmin.tsx`](file:///root/repo_pwa/components/ValidacaoPendenciasAdmin.tsx) e API [`repo_pwa/pages/api/admin/pendencias.ts`](file:///root/repo_pwa/pages/api/admin/pendencias.ts) integrado ao `/admin` do PWA.
- [x] **Web Scraper Cooperativa Central Aurora Alimentos (Novo Padrão & Fallback PDF)**: [`scrapers/aurora/index.ts`](file:///root/paletscan-etl/scrapers/aurora/index.ts) com raspagem de sitemap XML ao vivo, ingestão enriquecida do catálogo PDF/SQLite (385 produtos com EAN/DUN), normalização via `text_parser.ts`, geração de staging relacional UUIDv5 (`aurora_staging.json` / `aurora_staging_uuid.json`), inclusão das sub-marcas em `brand_classifier.ts` e módulo de fallback para extração geométrica do PDF + tratamento de fundo branco RGB `#FFFFFF` e salvamento em WebP ([`images/ai_pipeline/pdf_extractor.py`](file:///root/paletscan-etl/images/ai_pipeline/pdf_extractor.py) e [`core/validators/pdf_extractor.ts`](file:///root/paletscan-etl/core/validators/pdf_extractor.ts)) acionado automaticamente para itens sem imagem no sitemap.
- [x] **Módulo de Limpeza Total e Purga de Caches Multi-Camadas (Supabase & PWA)**:
  - Script de reset estrito [`db_sync/wipe_db_only.ts`](file:///root/paletscan-etl/db_sync/wipe_db_only.ts) para zerar tabelas no Supabase (`fabricantes`, `marcas`, `produtos`, `codigos_barras`) com resiliência a limites de URL do PostgREST.
  - Eliminação de fallbacks estáticos legados nos repositórios PWA (`meus-repos/PaletScan` e `repo_pwa`), zerando os arquivos `produtos.json` e `public/produtos.json`.
  - Atualização da chave de reset forçado (`cleanKey`) para `'ps_pwa_reset_v41_empty_wipe'` em [`lib/database/sync.ts`](file:///root/repo_pwa/lib/database/sync.ts) e purga de cache KV Redis via `PRODUCT_CATALOG_CACHE_KEY`.
  - Trava de segurança no motor de cache offline de mídia ([`lib/imageOfflineCache.ts`](file:///root/repo_pwa/lib/imageOfflineCache.ts)) em `prefetchGlobalCatalogImages()` para omitir o pré-carregamento de imagens quando o banco local contiver `0` produtos.
- [x] **Regra Estrita de Exportação PWA (EAN-13 Obrigatório e Bloqueio de SKU)**:
  - Definido no manifesto [`core/manifest/schema_manifest.json`](file:///root/paletscan-etl/core/manifest/schema_manifest.json) e documentado em [`docs/schema-manifesto.md`](file:///root/paletscan-etl/docs/schema-manifesto.md) que apenas produtos com no mínimo **EAN de 13 dígitos numéricos** são exportados para o PWA.
  - Atualizado [`scripts/generate_pwa_produtos_json.ts`](file:///root/paletscan-etl/scripts/generate_pwa_produtos_json.ts) e [`repo_pwa/pages/api/validar.ts`](file:///root/repo_pwa/pages/api/validar.ts) para filtrar categoricamente qualquer produto sem EAN-13 (descartando os 683 itens de catálogos B2B sem EAN de consumidor).
  - Removido qualquer fallback e exibição de SKU da experiência do usuário no PWA ([`PesquisaProduto.tsx`](file:///root/repo_pwa/components/PesquisaProduto.tsx), [`DetalheProdutoModal.tsx`](file:///root/repo_pwa/components/DetalheProdutoModal.tsx), [`NovosProdutosModal.tsx`](file:///root/repo_pwa/components/NovosProdutosModal.tsx)), restringindo a exibição exclusivamente a **EAN (13 dígitos)** e **DUN (14 dígitos)**.

---

## 🎯 5. Próximos Passos (Next Steps)

1. **Integração Backend Supabase com Frontend PWA**: Conectar o novo banco relacional PostgreSQL/Supabase à aplicação PWA em produção, substituindo a integração legada via Google Sheets.
2. **Busca Unificada Fuzzy no PWA**: Implementar busca rápida por SKU, EAN-13, DUN-14 e termos aproximados de produtos diretamente no scanner do operador.

