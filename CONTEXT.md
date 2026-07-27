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
[ Codigos_Barras ] (SKU, EAN-13, DUN-14) ◄── Resiliência a Conflitos de EAN/DUN
```

### 🔑 Identificadores Determinísticos (UUIDv5) & Tratamento de Conflitos Cross-Scraper
- Os IDs de todas as tabelas são gerados no Node.js via **UUIDv5** a partir de um `PALETSCAN_NAMESPACE` estático (`6ba7b810-9dad-11d1-80b4-00c04fd430c8`).
- **Resiliência a Colisões de EAN/DUN**: Como a coluna `codigo` da tabela `codigos_barras` possui constraint `UNIQUE`, colisões entre scrapers de fornecedores diferentes não interrompem o pipeline. O script executa um fallback item-por-item, "engole" erros de duplicidade (`23505`), ignora a inserção conflitante e registra os detalhes em `staging/conflicts_log.json`.

---

## ⚙️ 3. Pipeline de ETL e Inteligência Artificial Local

O pipeline de dados é totalmente independente e executa requisições web HTTP ao vivo:

1. **Extração Web ao Vivo (Fetch & Parse)**: O módulo [`scrapers/friboi/index.ts`](file:///root/paletscan-etl/scrapers/friboi/index.ts) realiza web scraping em tempo real baixando o sitemap XML oficial do portal B2B Friboi (`https://www.friboionline.com.br/productSitemap.xml`) e consultando concorrentemente as APIs HTTP de produto (`ccstoreui/v1/products/`) para capturar dados vivos.
2. **Integridade de Códigos de Barras (`normalizeEAN13` e `normalizeDUN14`)**:
   - Tratamento estrito de códigos de barras como `string`.
   - Cálculo automático de dígito verificador Modulus 10 (GS1) para EAN-13 de 12 dígitos, garantindo integridade de 13 dígitos.
   - Formatação e derivação de DUN-14 de 14 dígitos (variante logística `1` + EAN base + Modulus 10).
3. **Normalização de Texto e Pesos (`core/normalizers/text_parser.ts`)**:
   - Converte strings ALL CAPS para Title Case respeitando a acentuação em PT-BR (corrigindo termos como "Filé", "Moída", "Acém").
   - Extrai pesos fixos para gramas numéricas (`peso_gramas`).
   - Identifica cortes fracionados/peso variável e ajusta a descrição para `"Nome do Produto (pesar)"` ou `"Nome do Produto + Peso"`.
4. **Validação de Imagens Reais do Produto (`isValidProductImage` / `extractBestProductImage`)**:
   - Filtro heurístico rigoroso para rejeitar banners promocionais, fotos de receitas/pratos prontos, logos institucionais, selos, tabelas nutricionais e ícones "play".
   - Apenas fotos reais de produtos/cortes embalados de fábrica são marcadas como `aprovado`.
5. **Pipeline de Imagens com Fundo Branco Sólido e IA Local (`images/ai_pipeline/process_image.py`)**:
   - Remoção de fundo com IA local (`rembg` em Python).
   - Achatamento do canal alpha sobre fundo branco sólido RGB (`#FFFFFF`).
   - Redimensionamento máximo otimizado (`--max-dim 1000`) e conversão para `.webp` leve (< 100-150KB) mantendo alta nitidez.
   - Upload para o Supabase Storage (`produtos-imagens`), atualizando a `imagem_url` para o status `aprovado` e movendo o arquivo para `images/archived/`.

---

## ✅ 4. O Que Já Foi Feito

- [x] **Estrutura Base do Repositório**: Diretórios `scrapers/`, `core/`, `images/`, `staging/`, `db_sync/`.
- [x] **Esquema de Validação Rigoroso**: Manifesto JSON Schema em [`core/manifest/schema_manifest.json`](file:///root/paletscan-etl/core/manifest/schema_manifest.json).
- [x] **Integridade Estrita de EAN-13 e DUN-14**: Modulus 10 GS1 em [`core/normalizers/text_parser.ts`](file:///root/paletscan-etl/core/normalizers/text_parser.ts).
- [x] **Algoritmo de Validação de Imagens de Produtos**: Rejeição de receitas, banners e placeholders em [`scrapers/friboi/index.ts`](file:///root/paletscan-etl/scrapers/friboi/index.ts).
- [x] **Padronização de Fundo Branco e Otimização WebP**: Pipeline Python em [`images/ai_pipeline/process_image.py`](file:///root/paletscan-etl/images/ai_pipeline/process_image.py).
- [x] **Módulo Normalizador de Texto e Pesos**: [`core/normalizers/text_parser.ts`](file:///root/paletscan-etl/core/normalizers/text_parser.ts).
- [x] **Heurísticas de Marca e Categoria**: [`core/heuristics/brand_classifier.ts`](file:///root/paletscan-etl/core/heuristics/brand_classifier.ts) e [`category_classifier.ts`](file:///root/paletscan-etl/core/heuristics/category_classifier.ts).
- [x] **Web Scraper Friboi B2B em Tempo Real**: [`scrapers/friboi/index.ts`](file:///root/paletscan-etl/scrapers/friboi/index.ts).
- [x] **Pipeline de Sincronização Resiliente Supabase (UUIDv5 & Fail-safe Conflitos EAN)**: [`db_sync/sync.ts`](file:///root/paletscan-etl/db_sync/sync.ts) com salvamento automático de log em `staging/conflicts_log.json`.
- [x] **Pipeline de Carga de Mídia e Arquivamento**: [`db_sync/sync_images.ts`](file:///root/paletscan-etl/db_sync/sync_images.ts).

---

## 🎯 5. Próximos Passos (Next Steps)

1. **Integração Backend Supabase com Frontend PWA**: Conectar o novo banco relacional PostgreSQL/Supabase à aplicação PWA em produção, substituindo a integração legada via Google Sheets.
2. **Painel ADM de Aprovação de Imagens Pendentes**: Desenvolver a interface administrativa para revisão das imagens marcadas como `pendente_aprovacao`.
3. **Busca Unificada Fuzzy no PWA**: Implementar busca rápida por SKU, EAN-13, DUN-14 e termos aproximados de produtos diretamente no scanner do operador.
