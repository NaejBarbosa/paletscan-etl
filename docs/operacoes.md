# 🛠️ Guia Prático de Operações, CLI e Manutenção de Dados

Este guia fornece os procedimentos operacionais padrão para administradores e engenheiros de dados executarem **limpeza de bases**, **execução de pipelines**, **acompanhamento de logs** e **verificação de saúde do sistema** no ecossistema PaletScan.

---

## 🧹 1. Limpeza de Bases de Dados (Supabase & WatermelonDB)

Quando for necessário resetar o ambiente antes de um novo ciclo de ingestão de dados, siga as instruções abaixo:

### A. Limpeza no Supabase (Remoto)
Existem duas formas seguras de excluir todos os dados das tabelas do Supabase mantendo a estrutura relacional pronta para novos inserts:

#### Opção 1: Via Script CLI (TypeScript / Node.js)
Execute o comando a partir do diretório raiz do `paletscan-etl`:

```bash
npx tsx -e '
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function wipeAll() {
  console.log("🧹 Limpando todas as tabelas do Supabase...");

  const { error: e1 } = await supabase.from("codigos_barras").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("codigos_barras limpo:", e1?.message || "OK");

  const { error: e2 } = await supabase.from("produtos").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("produtos limpo:", e2?.message || "OK");

  const { error: e3 } = await supabase.from("marcas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("marcas limpo:", e3?.message || "OK");

  const { error: e4 } = await supabase.from("fabricantes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("fabricantes limpo:", e4?.message || "OK");

  console.log("✅ Limpeza concluída!");
}

wipeAll();
'
```

#### Opção 2: Via Console SQL no Supabase
Caso prefira executar via interface administrativa do Supabase SQL Editor:

```sql
-- Exclusão rápida e segura em cascata
TRUNCATE TABLE codigos_barras, produtos, marcas, fabricantes CASCADE;
```

---

### B. Limpeza no WatermelonDB (Dispositivos / PWA)
Para limpar a base de dados local SQLite / IndexedDB no aplicativo do coletor / navegador:

1. Abra o aplicativo PaletScan PWA.
2. Acesse a aba **Configurações** $\rightarrow$ clique no botão **"Limpar Banco Local & Sincronizar"**.
3. O WatermelonDB executará internamente o método `unsafeResetDatabase()` e forçará o `pull` limpo da nuvem.

---

## 🚀 2. Execução do Pipeline de Ingestão e Carga ETL

### A. Execução dos Scrapers Primários
Para re-extrair dados brutos dos portais institucionais B2B:

```bash
# Scraper Friboi / JBS / Swift
npm run scrape:friboi

# Scraper Seara (Multi-Site 100% Live: B2B, B2C, E-Com)
npm run scrape:seara

# Scraper BRF (Sadia, Perdigão, Qualy, Central MBRF, Catalogo PDF)
npx tsx scrapers/brf/index.ts
```

### B. Carga Relacional Otimizada no Supabase (UUIDv5)
Para transformar os arquivos em `staging/` em UUIDv5 determinísticos e realizar o upsert no Supabase:

```bash
npm run sync:supabase
```

> ℹ️ **O que este comando faz**:
> 1. Lê `staging/brf_staging.json`, `staging/friboi_staging.json` e `staging/seara_staging.json`.
> 2. **Aplica Validação Estrita de EAN**: Mantém exclusivamente produtos com ao menos 1 código de barras EAN válido (rejeitando itens puramente SKU), reduzindo a base tratada para **2.988 produtos com EAN** (1.025 BRF, 1.542 Friboi, 421 Seara).
> 3. Converte IDs em UUIDv5 e gera os arquivos `*_uuid.json`.
> 4. Envia os lotes em ordem de dependência: `fabricantes` $\rightarrow$ `marcas` $\rightarrow$ `produtos` $\rightarrow$ `codigos_barras`.
> 5. Ativa fallback item-por-item se houver colisões de código de barras.

### C. Publicação e Upload de Imagens HD no Supabase Storage
Para publicar imagens tratadas no formato `.webp` para o bucket CDN:

```bash
npm run sync:images
```

---

## 📊 3. Acompanhamento de Logs e Auditoria

### A. Monitoramento de Conflitos de EAN / DUN (`conflicts_log.json`)
Códigos de barras duplicados ou com colisões cross-scraper são registrados em `staging/conflicts_log.json`:

```bash
# Exibir últimos conflitos registrados no staging
cat staging/conflicts_log.json | tail -n 40
```

### B. Acompanhamento de Execução de Tarefas
Para visualizar o progresso de tarefas executadas em background:

```bash
# Exibir log de saída da tarefa ativa
cat .system_generated/tasks/<task-id>.log
```

---

## 🔍 4. Verificação de Saúde das Bases

Para consultar a contagem exata de registros salvos no Supabase a qualquer momento:

```bash
npx tsx -e '
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function verify() {
  const { count: prodCount } = await supabase.from("produtos").select("*", { count: "exact", head: true });
  const { count: codCount } = await supabase.from("codigos_barras").select("*", { count: "exact", head: true });
  const { count: marcaCount } = await supabase.from("marcas").select("*", { count: "exact", head: true });
  const { count: fabCount } = await supabase.from("fabricantes").select("*", { count: "exact", head: true });

  console.log("📊 STATUS ATUAL DAS BASES (SUPABASE):");
  console.log(` 🏢 Fabricantes:        ${fabCount}`);
  console.log(` 🏷️  Marcas:             ${marcaCount}`);
  console.log(` 🥩 Produtos:           ${prodCount}`);
  console.log(` 📊 Códigos de Barras:  ${codCount}`);
}

verify();
'
```
