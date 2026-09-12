# ⚡ Integração Supabase (Database, Storage & PostgreSQL RLS)

O módulo de integração ([`db_sync/sync.ts`](file:///root/paletscan-etl/db_sync/sync.ts) e [`db_sync/sync_images.ts`](file:///root/paletscan-etl/db_sync/sync_images.ts)) realiza a carga dos dados sanitizados e mídias tratadas diretamente nas instâncias do Supabase PostgreSQL e Supabase Storage, enquanto as políticas nativas de **Row Level Security (RLS)** blindam o banco relacional contra acessos indevidos de operadores e terceiros.

---

## 🔄 1. Pipeline de Sincronização Relacional (`db_sync/sync.ts`)

O script `sync.ts` lê o staging sanitizado, gera as chaves determinísticas UUIDv5 e executa as chamadas de gravação relacional no Supabase em um fluxo vertical de alta resiliência:

```mermaid
flowchart TD
    S1["1. Leitura do Staging JSON dos Fornecedores"] --> S2["2. Geração Determinística de UUIDv5"]
    S2 --> S3["3. UPSERT em Lote nas Tabelas Mestres"]

    S3 --> S4["4. Inserção Relacional em Códigos de Barras"]

    S4 --> OK["Gravação Normal Concluída"]
    S4 --> ERR["Detecção de Conflito de Chave Única"]

    ERR --> S6["Ativa Fallback Item por Item"]
    S6 --> S7["Isola Código Conflitante e Mantém o Lote"]
    S7 --> S8["Registra Detalhes em Log de Auditoria"]
```

---

## 🛡️ 2. Tratamento Resiliente de Conflitos de EAN (`Erro 23505`)

Como fornecedores diferentes podem comercializar o mesmo produto com o mesmo EAN-13, a tentativa de inserção pode disparar uma exceção de violação de chave única no PostgreSQL (`error code 23505` - `unique_violation`).

### A. Algoritmo de Fallback Item-por-Item
Em vez de abortar o lote inteiro de sincronização, o `sync.ts` captura a exceção de conflito, isola o código de barras conflitante e continua a execução dos demais itens do lote.

### B. Registro de Auditoria (`conflicts_log.json`)
Todas as tentativas de inserção duplicada são registradas no arquivo `staging/conflicts_log.json`, permitindo auditorias posteriores para identificar tentativas de re-cadastramento de EANs por múltiplos scrapers:

```json
[
  {
    "timestamp": "2026-07-28T10:15:30.123Z",
    "codigo": "7891515432101",
    "tipo": "EAN-13",
    "produto_id": "8d3e91b4-5f21-5a9e-b811-123456789abc",
    "mensagem": "Código de barras já existente na base relacional. Inserção duplicada ignorada."
  }
]
```

---

## 🔒 3. Alinhamento Relacional Estrito & Política Zero Data Loss

Para garantir que nenhuma alteração manual realizada pelo operador no chão de fábrica do PWA seja sobrescrita ou perdida em rotinas automáticas de ETL:

1. **Separação Canônica de Entidades**:
   - `produtos`: ID determinístico UUIDv5, `marca_id`, `descricao_padronizada`, `descricao_original`, `classe`, `conservacao`, `status_imagem`.
   - `codigos_barras`: Associação 1:N com `produto_id` e tipos estritos (`EAN`, `DUN`, `PESAR`).
   - `produtos_atributos_manuais`: Armazena com prioridade absoluta qualquer ajuste manual feito no PWA (edição de nome, conservação, classe ou vínculos de DUN).
   - `vw_produtos_com_marcas`: View relacional consolidada consumida pelo PWA durante a sincronização delta.
2. **Suíte de Testes de Imunidade a Perda de Dados**:
   - O script [`scripts/test_pwa_crud_and_sync_safety.ts`](file:///root/paletscan-etl/scripts/test_pwa_crud_and_sync_safety.ts) valida o ciclo CRUD completo e garante 100% de preservação de dados após operações de wipe ou sincronizações globais.

---

## 🖼️ 4. Sincronização de Mídias e Upload CDN (`db_sync/sync_images.ts`)

O script [`db_sync/sync_images.ts`](file:///root/paletscan-etl/db_sync/sync_images.ts) gerencia o upload das imagens WebP tratadas para o bucket público do Supabase Storage:

1. **Leitura dos Arquivos Processados**: Lê os ativos WebP em `images/processed/`.
2. **Upload para o Storage Bucket**:
   - Bucket: `produtos-imagens`
   - Parâmetro: `upsert: true` (permite atualizar fotos quando a indústria muda o layout da embalagem).
3. **Atualização da Tabela de Produtos**:
   - `imagem_url`: Define a URL pública do CDN Supabase.
   - `status_imagem`: Atualiza para `aprovado`.
   - `updated_at`: Atualiza o timestamp da última mutação para orientar a sincronização delta do PWA.

---

## 🔐 5. Governança PostgreSQL Row Level Security (RLS) Nativas por Marca

Para assegurar o isolamento dos dados diretamente na autoridade máxima (o banco relacional PostgreSQL), o Supabase utiliza **Row Level Security (RLS)** ativo nas tabelas mestres de catálogo:

```mermaid
flowchart TD
    CLIENT_REQ["🌐 Requisição HTTP do Cliente (PWA ou cURL)\nHeader: Authorization: Bearer <ps_supabase_token>"]
    
    CLIENT_REQ --> POSTGREST["⚙️ Supabase PostgREST Gateway"]
    
    POSTGREST --> VERIFY_JWT["Validação Criptográfica do JWT com SUPABASE_JWT_SECRET (HS256)"]
    
    VERIFY_JWT --> IS_VALID{"Assinatura Válida?"}
    
    IS_VALID -->|Não - Sem Token| ROLE_ANON["Role: anon\nPolíticas RLS negam leitura/gravação (Retorna 0 linhas)"]
    
    IS_VALID -->|Sim| ROLE_AUTH["Role: authenticated\nPostgreSQL popula auth.jwt()"]
    
    ROLE_AUTH --> EVAL_RLS["Execução da Função auth.get_user_marcas():\nExtrai marcas_permitidas do app_metadata"]
    
    EVAL_RLS --> CHECK_FULL{"auth.has_full_brand_access() == true?"}
    
    CHECK_FULL -->|Sim - Admin ou Geral| ALLOW_ALL["✅ Retorna Todas as Linhas do Catálogo"]
    
    CHECK_FULL -->|Não - Promotor Restrito| FILTER_BRANDS["🔒 WHERE marca_id IN (\n  SELECT id FROM marcas WHERE lower(nome) = ANY(auth.get_user_marcas())\n)"]
    
    FILTER_BRANDS --> RETURN_RESTRICTED["✅ Retorna Apenas Linhas das Marcas Autorizadas (~250 SKUs)"]
```

### Políticas RLS Aplicadas ([`scripts/aplicar_rls_marcas_supabase.sql`](file:///root/repo_pwa/scripts/aplicar_rls_marcas_supabase.sql)):

| Tabela | Política | Operação | Escopo / Regra de Avaliação |
| :--- | :--- | :---: | :--- |
| `public.produtos` | `produtos_select_policy` | `SELECT` | `auth.has_full_brand_access() OR marca_id IN (marcas autorizadas)` |
| `public.produtos` | `produtos_insert_policy` | `INSERT` | Exige `pode_cadastrar_produto == true` E marca autorizada |
| `public.produtos` | `produtos_update_policy` | `UPDATE` | Exige que o produto atual pertença à marca autorizada |
| `public.produtos` | `produtos_delete_policy` | `DELETE` | Exclusivo para administradores (`has_full_brand_access()`) |
| `public.codigos_barras` | `codigos_barras_select_policy` | `SELECT` | Apenas códigos vinculados a produtos de marcas autorizadas |
| `public.codigos_barras` | `codigos_barras_insert_policy` | `INSERT` | Apenas para produtos de marcas autorizadas |
| `public.codigos_barras` | `codigos_barras_update_policy` | `UPDATE` | Apenas para produtos de marcas autorizadas |

### Coexistência com `service_role` (Bypass RLS):
As rotas de backend do Next.js que utilizam `supabaseAdmin` com a chave `SUPABASE_SERVICE_ROLE_KEY` operam com o atributo PostgreSQL `BYPASSRLS`. Isso assegura que tarefas administrativas centrais (como moderação de reportes e rotinas de expurgo automatizado) operem sem bloqueios, mantendo as requisições diretas de clientes sob isolamento hermético.

---

## 💻 6. Comandos de Sincronização & Teste

```bash
# Sincronizar dados relacionais de todas as indústrias para o Supabase
npm run sync:supabase

# Sincronizar apenas imagens tratadas para o Supabase Storage
npm run sync:images

# Validar imunidade a perda de dados e integridade relacional do PWA
npx tsx scripts/test_pwa_crud_and_sync_safety.ts

# Aplicar o script SQL de Row Level Security no Supabase SQL Editor
# Arquivo: scripts/aplicar_rls_marcas_supabase.sql
```
