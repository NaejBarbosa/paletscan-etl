# 🛠️ Guia Prático de Operações, CLI e Manutenção de Dados

Este guia fornece os procedimentos operacionais padrão para administradores e engenheiros de dados executarem a **suíte de aliases Linux (Mobile CLI UX)**, **execução completa do pipeline com relatório de timestamps**, **sincronização dinâmica via manifesto**, **acompanhamento de logs** e **agendamento via Crontab** no ecossistema PaletScan.

---

## ⚡ 1. Instalação e Ativação dos Aliases no Terminal Linux (1 Passo)

A suíte de aliases foi otimizada para o ambiente **Linux / Termux em smartphones Android**, com suporte a telas de 36 colunas de largura sem quebras serrilhadas (*line wrapping*).

Para ativar os aliases na sessão atual do seu terminal:

```bash
source ~/.paletscan_aliases.sh
```

> 💡 **Carregamento Automático:** O arquivo `~/.bashrc` está configurado para carregar automaticamente a suíte `~/.paletscan_aliases.sh` a cada nova janela de terminal aberta.

---

## 🚀 2. O Comando All-in-One: `etl-run` / `etl-pipeline`

Para rodar todo o pipeline de ponta a ponta, sincronizar o Supabase, sanitizar o banco, exportar para o PWA, auditar e **exibir o relatório completo de timestamps e logs na tela**, utilize o comando:

```bash
etl-run
# ou o atalho equivalente:
etl-pipeline
```

### 📋 Estrutura do Relatório de Timestamps Exibido na CLI:

```text
────────────────────────────────────
🚀 PALETSCAN ETL ── PIPELINE FULL
 📅 Data: 12/08/2026
 ⏰ Horário Inicial: 10:49:15
────────────────────────────────────

▶ [10:49:15] 1. Scrapers Multi-Fornecedores
  Desc: Extração B2B (Friboi, Seara, BRF, Aurora, Lar)
... [Logs ao vivo da extração] ...
✔ [10:50:35] Status: SUCESSO (Duração: 80.12s)

▶ [10:50:35] 2. Sincronização Supabase
  Desc: Carga relacional UUIDv5 & tratamento de EAN/DUN
✔ [10:51:10] Status: SUCESSO (Duração: 35.40s)

▶ [10:51:10] 3. Sanitização PostgreSQL
  Desc: Normalização Title Case & Modulus 10 EAN-13
✔ [10:51:18] Status: SUCESSO (Duração: 7.82s)

▶ [10:51:18] 4. Publicação PWA
  Desc: Geração de produtos.json purificado para o PWA
✔ [10:51:23] Status: SUCESSO (Duração: 4.91s)

▶ [10:51:23] 5. Auditoria de Integridade
  Desc: Auditoria exaustiva contra anomalias e órfãos
✔ [10:51:28] Status: SUCESSO (Duração: 4.85s)

────────────────────────────────────
📋 RELATÓRIO DE EXECUÇÃO DO ETL
────────────────────────────────────
 📅 Data:           12/08/2026
 ⏰ Horário Início: 10:49:15
 🏁 Horário Fim:    10:51:28
 ⏱️  Tempo Total:    133.10s
────────────────────────────────────
📌 DETALHAMENTO DE CADA ETAPA:

✅ 1. Scrapers Multi-Fornecedores
   ├─ Início  : 10:49:15
   ├─ Término : 10:50:35 (80.12s)
   └─ Detalhes: Extração B2B (Friboi, Seara, BRF, Aurora, Lar)
✅ 2. Sincronização Supabase
   ├─ Início  : 10:50:35
   ├─ Término : 10:51:10 (35.40s)
   └─ Detalhes: Carga relacional UUIDv5 & tratamento de EAN/DUN
✅ 3. Sanitização PostgreSQL
   ├─ Início  : 10:51:10
   ├─ Término : 10:51:18 (7.82s)
   └─ Detalhes: Normalização Title Case & Modulus 10 EAN-13
✅ 4. Publicação PWA
   ├─ Início  : 10:51:18
   ├─ Término : 10:51:23 (4.91s)
   └─ Detalhes: Geração de produtos.json purificado para o PWA
✅ 5. Auditoria de Integridade
   ├─ Início  : 10:51:23
   ├─ Término : 10:51:28 (4.85s)
   └─ Detalhes: Auditoria exaustiva contra anomalias e órfãos
────────────────────────────────────
📊 BASE DE DADOS SUPABASE (AO VIVO):
 🏢 Fabricantes:       4
 🏷️  Marcas:            143
 🥩 Produtos:          3.386
 📊 Códigos de Barras: 9.310
────────────────────────────────────
✔ PIPELINE FINALIZADO COM SUCESSO!
────────────────────────────────────
```

---

## 📖 3. Compatibilidade Dinâmica com o Manifesto do Projeto (`schema_manifest.json`)

Para evitar inconsistências caso uma marca ou holding entre ou saia do projeto, os aliases e a central de ajuda CLI (`paletscan` ou `etl-help`) consomem dinamicamente as seções `manifesto_holdings` e `manifesto_aliases` registradas em [`core/manifest/schema_manifest.json`](file:///root/paletscan-etl/core/manifest/schema_manifest.json).

### Dicionário Completo de Aliases Disponíveis:

| Alias Linux | Comando NPM Subjacente | Descrição Operacional |
| :--- | :--- | :--- |
| `etl-run` | `npm run full` | Executa o pipeline completo (Scrape All $\rightarrow$ Sync $\rightarrow$ Sanitize $\rightarrow$ Export PWA $\rightarrow$ Audit) com relatório de timestamps. |
| `etl-pipeline` | `npm run full` | Atalho idêntico ao `etl-run`. |
| `etl-friboi` | `npm run scrape:friboi` | Extrai catálogo B2B Friboi / JBS (Friboi, Maturatta, 1953, Swift, Do Chef). |
| `etl-seara` | `npm run scrape:seara` | Extrai catálogo B2B Seara Alimentos (Seara, Gourmet, Incrível!). |
| `etl-brf` | `npm run scrape:brf` | Extrai catálogo BRF S.A. (Sadia, Perdigão, Qualy, Chester). |
| `etl-aurora` | `npm run scrape:aurora` | Extrai catálogo Cooperativa Central Aurora Alimentos (Aurora, Nobre, Gran Mestri). |
| `etl-lar` | `npm run scrape:lar` | Extrai catálogo Cooperativa Agroindustrial Lar (Aves e Suínos). |
| `etl-scrape-all` | `npm run scrape:all` | Extrai dados de todos os 5 scrapers em lote sequencial. |
| `etl-sync` | `npm run sync:supabase` | Carga relacional com identificadores UUIDv5 no Supabase. |
| `etl-images` | `npm run sync:images` | Processamento de fundo branco via IA local (`rembg`) e upload no Storage. |
| `etl-sanitize` | `npm run sanitize` | Sanitização pós-sync (Title Case, Modulus 10 EAN-13 GS1). |
| `etl-export` | `npm run export:pwa` | Gera e publica `produtos.json` para o PWA. |
| `etl-export-excel`| `npm run export:excel` | Gera relatório comercial em formato Excel (.xlsx). |
| `etl-audit` | `npm run audit` | Executa auditoria de integridade de banco de dados. |
| `etl-wipe` | `npm run wipe` | Reset estrito / Limpeza do Supabase (sem deletar arquivos brutos em staging). |
| `etl-logs` | `tail -n 40 -f logs/latest.log` | Transmissão de logs em tempo real na CLI. |
| `etl-novos` | `npx tsx scripts/show_new_products.ts` | Exibe os novos produtos incluídos na base (ou atalho `etl-novos-produtos`). |
| `etl-conflicts` | `cat staging/conflicts_log.json` | Exibe conflitos de códigos de barras EAN/DUN em staging. |
| `etl-status` | `npm run status` | Exibe contagem de registros no Supabase ao vivo em formato 36 colunas. |
| `etl-schedule` | CLI Interativo | Menu para cadastrar agendamentos no Crontab do Linux. |
| `etl-cron-list` | `crontab -l` | Lista os agendamentos ativos do PaletScan no Crontab. |
| `etl-cron-remove`| `crontab -r` | Remove os agendamentos do PaletScan no Crontab. |

---

## 🆕 6. Monitoramento de Novos Produtos Incluídos

Quando novas cargas de scrapers ou ingestões de fornecedores são executadas, o pipeline detecta automaticamente quais produtos foram recentemente incorporados ao banco relacional.

Os novos produtos são destacados no relatório final do `etl-run`, registrados em `staging/novos_produtos_log.json` e exportados com timestamp de inclusão (`criado_em`) para a aplicação PWA.

Para inspecionar rapidamente os novos produtos no terminal:

```bash
etl-novos
# ou o atalho equivalente:
etl-novos-produtos
```


## ⏰ 4. Agendamento Automático de Execução no Linux (Crontab)

Para manter o catálogo permanentemente atualizado sem intervenção manual, utilize o agendador nativo:

1. Digite **`etl-schedule`** no terminal.
2. Selecione a frequência desejada (ex: `1` para diariamente às 03:00 da manhã).
3. O comando cadastra a tarefa no Crontab redirecionando a saída para `logs/cron_output.log`.

---

## 🧹 5. Limpeza Total de Bases de Dados e Caches Multi-Camadas

Quando for necessário resetar o ambiente ou zerar completamente o catálogo antes de um novo ciclo de ingestão de dados, siga o protocolo de limpeza em 3 níveis (Banco Remoto, Fallbacks Estáticos e Cache PWA):

### A. Limpeza no Supabase (Remoto via CLI)
```bash
etl-wipe
```

### B. Limpeza dos Arquivos Estáticos de Fallback (PWA)
```bash
echo "[]" > /root/repo_pwa/produtos.json
echo "[]" > /root/repo_pwa/public/produtos.json
```

### C. Execução via Console SQL no Supabase
```sql
TRUNCATE TABLE codigos_barras, paletes_armazenados, produtos, marcas, fabricantes CASCADE;
```
