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
 ⏰ Horário Inicial: 10h 49min 15s
────────────────────────────────────

▶ [10h 49min 15s] 1. Scrapers Multi-Fornecedores
  Desc: Extração B2B (Friboi, Seara, BRF, Aurora, Lar)
... [Logs ao vivo da extração] ...
✔ [10h 50min 35s] Status: SUCESSO (Duração: 1min 20.12s)

▶ [10h 50min 35s] 2. Sincronização Supabase
  Desc: Carga relacional UUIDv5 & tratamento de EAN/DUN
✔ [10h 51min 10s] Status: SUCESSO (Duração: 35.40s)

▶ [10h 51min 10s] 3. Sanitização PostgreSQL
  Desc: Normalização Title Case & Modulus 10 EAN-13
✔ [10h 51min 18s] Status: SUCESSO (Duração desta etapa: 7.82s)

▶ [10h 51min 18s] 4. Publicação PWA
  Desc: Geração de produtos.json purificado para o PWA
✔ [10h 51min 23s] Status: SUCESSO (Duração desta etapa: 4.91s)

▶ [10h 51min 23s] 5. Auditoria de Integridade
  Desc: Auditoria exaustiva contra anomalias e órfãos
✔ [10h 51min 28s] Status: SUCESSO (Duração desta etapa: 4.85s)

────────────────────────────────────────────────────────────────────────
📋 RELATÓRIO CONSOLIDADO DO PROCESSAMENTO ETL
────────────────────────────────────────────────────────────────────────
 📅 Início Geral do Pipeline : 12/08/2026 10:49:15
 🏁 Término Geral do Pipeline: 12/08/2026 10:51:28
 ⏱️  Tempo Total do Pipeline  : 2min 13.10s
────────────────────────────────────────────────────────────────────────

📊 CRONOGRAMA CONSOLIDADO POR ETAPA:

┌────────────────────────────────────┬──────────────┬──────────────┬──────────────┬────────┐
│ Etapa                              │ Início       │ Término      │ Duração      │ Status │
├────────────────────────────────────┼──────────────┼──────────────┼──────────────┼────────┤
│ 1. Scrapers Multi-Fornecedores     │ 10h 49min 15s│ 10h 50min 35s│  1min 20.12s │  ✔ OK  │
│ 2. Sincronização Supabase          │ 10h 50min 35s│ 10h 51min 10s│       35.40s │  ✔ OK  │
│ 3. Sanitização PostgreSQL          │ 10h 51min 10s│ 10h 51min 18s│        7.82s │  ✔ OK  │
│ 4. Publicação PWA                  │ 10h 51min 18s│ 10h 51min 23s│        4.91s │  ✔ OK  │
│ 5. Auditoria de Integridade        │ 10h 51min 23s│ 10h 51min 28s│        4.85s │  ✔ OK  │
├────────────────────────────────────┼──────────────┼──────────────┼──────────────┼────────┤
│ 🏁 TEMPO TOTAL DO PIPELINE         │ 10h 49min 15s│ 10h 51min 28s│  2min 13.10s │  ✔ OK  │
└────────────────────────────────────┴──────────────┴──────────────┴──────────────┴────────┘

────────────────────────────────────────────────────────────────────────
📌 DETALHAMENTO DE CADA ETAPA:

✅ 1. Scrapers Multi-Fornecedores
   ├─ Início desta etapa  : 10h 49min 15s
   ├─ Término desta etapa : 10h 50min 35s (Duração desta etapa: 1min 20.12s)
   └─ Detalhes            : Extração B2B (Friboi, Seara, BRF, Aurora, Lar, Copacol)
✅ 2. Sincronização Supabase
   ├─ Início desta etapa  : 10h 50min 35s
   ├─ Término desta etapa : 10h 51min 10s (Duração desta etapa: 35.40s)
   └─ Detalhes            : Carga relacional UUIDv5 & tratamento de EAN/DUN
✅ 3. Sanitização PostgreSQL
   ├─ Início desta etapa  : 10h 51min 10s
   ├─ Término desta etapa : 10h 51min 18s (Duração desta etapa: 7.82s)
   └─ Detalhes            : Normalização Title Case & Modulus 10 EAN-13
✅ 4. Publicação PWA
   ├─ Início desta etapa  : 10h 51min 18s
   ├─ Término desta etapa : 10h 51min 23s (Duração desta etapa: 4.91s)
   └─ Detalhes            : Geração de produtos.json purificado para o PWA
✅ 5. Auditoria de Integridade
   ├─ Início desta etapa  : 10h 51min 23s
   ├─ Término desta etapa : 10h 51min 28s (Duração desta etapa: 4.85s)
   └─ Detalhes            : Auditoria exaustiva contra anomalias e órfãos
────────────────────────────────────────────────────────────────────────
📊 BASE DE DADOS SUPABASE (AO VIVO):
 🏢 Fabricantes:       4
 🏷️  Marcas:            143
 🥩 Produtos Totais:   3.415
 📊 Códigos de Barras: 9.310
 ✨ Novos Produtos:    20 recém-incluídos
📌 RESUMO DOS NOVOS PRODUTOS:
   1. AURORA - EAN: 47891164004246 | Linguiça Toscana 800g Cx. de 16kg
   2. FRIBOI - EAN: 17898302298313 | Alcatra com Maminha (3 Partes) - Friboi
   ... e mais 12 novos produtos (etl-novos).
────────────────────────────────────────────────────────────────────────
 📅 Início Geral do Pipeline : 12/08/2026 10:49:15
 🏁 Término Geral do Pipeline: 12/08/2026 10:51:28
 ⏱️  Tempo Total Decorrido   : 2min 13.10s
────────────────────────────────────────────────────────────────────────
✔ PIPELINE FINALIZADO COM SUCESSO!
────────────────────────────────────────────────────────────────────────
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
| `etl-copacol` | `npm run scrape:copacol` | Extrai catálogo Cooperativa Copacol (Aves, Peixes, Tilápia, Suínos). |
| `etl-lar` | `npm run scrape:lar` | Extrai catálogo Cooperativa Agroindustrial Lar (Aves e Suínos). |
| `etl-scrape-all` | `npm run scrape:all` | Extrai dados de todos os 6 scrapers em lote sequencial. |
| `etl-sync` | `npm run sync:supabase` | Carga relacional com identificadores UUIDv5 no Supabase. |
| `etl-images` | `npm run sync:images` | Processamento de fundo branco via IA local (`rembg`) e upload no Storage. |
| `etl-sanitize` | `npm run sanitize` | Sanitização pós-sync (Title Case, Modulus 10 EAN-13 GS1). |
| `etl-export` | `npm run export:pwa` | Gera e publica `produtos.json` para o PWA. |
| `etl-export-excel`| `npm run export:excel` | Gera relatório comercial em formato Excel (.xlsx). |
| `etl-audit` | `npm run audit` | Executa auditoria de integridade de banco de dados. |
| `etl-wipe` | `npm run wipe` | Reset estrito / Limpeza do Supabase (sem deletar arquivos brutos em staging). |
| `etl-logs` | `tail -n 40 -f logs/latest.log` | Transmissão de logs em tempo real na CLI. |
| `etl-novos` | `npx tsx scripts/show_new_products.ts` | Exibe os novos produtos incluídos na base na última execução (ou atalho `etl-novos-produtos`). |
| `etl-atualizados` | `npx tsx scripts/show_updated_products.ts` | Exibe as alterações e atualizações de dados registradas na base (ou atalho `etl-alteracoes`). |
| `etl-conflicts` | `cat staging/conflicts_log.json` | Exibe conflitos de códigos de barras EAN/DUN em staging. |
| `etl-status` | `npm run status` | Exibe contagem de registros no Supabase ao vivo em formato 36 colunas. |
| `etl-schedule` | CLI Interativo | Menu para cadastrar agendamentos no Crontab do Linux. |
| `etl-cron-list` | `crontab -l` | Lista os agendamentos ativos do PaletScan no Crontab. |
| `etl-cron-remove`| `crontab -r` | Remove os agendamentos do PaletScan no Crontab. |

---

## 🆕 6. Monitoramento de Novos Produtos Incluídos

Quando novas cargas de scrapers ou ingestões de fornecedores são executadas, o pipeline detecta automaticamente quais produtos foram incorporados pela primeira vez ao banco relacional.

- **Regra de Status de Novo Produto**: O produto é considerado **novo** exclusivamente no momento em que é inserido no Supabase. Na execução subsequente, por já constar na base, ele perde o status de novo.
- **Relatório CLI**: Os novos produtos são registrados em `staging/novos_produtos_log.json` e destacados no relatório final do `etl-run`.

Para inspecionar rapidamente os novos produtos no terminal:

```bash
etl-novos
# ou o atalho equivalente:
etl-novos-produtos
```

---

## 📝 7. Monitoramento de Produtos Alterados e Atualizados

Quando dados de produtos pré-existentes sofrem modificação no staging (como atualização de foto, descrição padronizada, classe, conservação, peso ou marca):

- **Diffing de Campos**: O pipeline compara os dados anteriores com os dados novos e registra a alteração em `staging/produtos_atualizados_log.json`.
- **Relatório CLI**: Para verificar quais produtos sofreram alterações e visualizar o comparativo de valores antigos x novos:

```bash
etl-atualizados
# ou o atalho equivalente:
etl-alteracoes
```



## ⏰ 8. Agendamento Automático e Gestão de Tarefas Recorrentes (Linux / Crontab)

Para manter a base de dados permanentemente atualizada sem intervenção manual, o ecossistema PaletScan dispõe de integração nativa com o **Crontab do Linux**, permitindo agendamentos flexíveis com logs e relatórios automáticos.

---

### A. Agendamento Interativo via CLI (`etl-schedule`)

Execute no terminal:

```bash
etl-schedule
```

A CLI exibirá um menu interativo com os perfis mais comuns:

```text
────────────────────────────────────
 ⏰ AGENDAMENTO LINUX (CRONTAB)
────────────────────────────────────
Frequência para etl-run:
 1) Diariamente às 03:00
 2) De 12 em 12 horas
 3) De 6 em 6 horas
 4) Personalizado (Cron)
 5) Cancelar
Opção [1-5]:
```

---

### B. Sintaxe e Expressões Cron Personalizadas

Caso selecione a **Opção 4 (Personalizado)**, você pode definir qualquer regra de execução utilizando a estrutura padrão de 5 campos do Cron:

$$\begin{matrix} \text{Minuto} & \text{Hora} & \text{Dia-do-Mês} & \text{Mês} & \text{Dia-da-Semana} \\ \text{(0-59)} & \text{(0-23)} & \text{(1-31)} & \text{(1-12)} & \text{(0-6, Dom=0)} \end{matrix}$$

#### 📋 Guia de Exemplos Práticos de Agendamento:

| Objetivo de Agendamento | Expressão Cron | Descrição Operacional |
| :--- | :--- | :--- |
| **Diário na Madrugada** | `0 3 * * *` | Roda diariamente às 03:00 da manhã. |
| **A cada 12 horas** | `0 3,15 * * *` | Roda duas vezes ao dia: às 03:00 e às 15:00. |
| **A cada 6 horas** | `0 */6 * * *` | Roda de 6 em 6 horas (00:00, 06:00, 12:00, 18:00). |
| **Horários de Pico (3x ao dia)** | `0 6,12,18 * * *` | Roda exatamente às 06:00, 12:00 e 18:00. |
| **A cada 30 minutos em Horário Comercial** | `*/30 8-18 * * 1-5` | Roda a cada 30 min, entre 08:00 e 18:00, de segunda a sexta. |
| **A cada 15 minutos (Alta Frequência)** | `*/15 * * * *` | Roda a cada 15 minutos, 24h por dia. |
| **Executar 4 vezes ao dia (a cada 3h)** | `0 0,6,12,18 * * *` | Roda a cada 6 horas marcadas no relógio. |
| **Apenas aos Finais de Semana** | `0 4 * * 0,6` | Roda às 04:00 da manhã aos sábados e domingos. |

---

### C. Listar e Auditar Agendamentos Ativos

Para inspecionar as tarefas agendadas e verificar se a suíte PaletScan está ativa no sistema:

#### 1. Via Alias PaletScan (Recomendado):
```bash
etl-cron-list
```
*Retorna a linha exata do comando agendado com os parâmetros de diretório e arquivo de log.*

#### 2. Via Comando Nativo Linux:
```bash
crontab -l
```

#### 3. Acompanhamento dos Logs de Execução Automática:
Toda execução do agendador redireciona o output em tempo real para `logs/cron_output.log`. Para visualizar a transmissão dos logs ao vivo:

```bash
tail -f logs/cron_output.log
```

---

### D. Cancelar e Remover Agendamentos

#### 1. Remoção Rápida via CLI:
```bash
etl-cron-remove
```
*Limpa todos os agendamentos registrados no Crontab.*

#### 2. Edição Manual do Crontab:
Para alterar ou remover uma linha específica manualmente:
```bash
crontab -e
```
*(Utilize o editor para remover a linha da tarefa `PALETSCAN_ETL_FULL_JOB` e salve o arquivo).*

---

### E. Garantias de Execução em Segundo Plano no Android / Termux

Para agendamentos executados no **Termux (Android)**, garanta as seguintes diretrizes para evitar que o sistema operacional interrompa a rotina quando a tela estiver apagada:

1. **Ativar Wake-Lock do Termux (Impede o Deep Sleep da CPU)**:
   ```bash
   termux-wake-lock
   ```
   *(Cria uma notificação persistente na barra do Android mantendo a CPU desperta no horário agendado).*

2. **Remover Otimização de Bateria do Android**:
   - Vá em **Configurações do Android** $\rightarrow$ **Aplicativos** $\rightarrow$ **Termux** $\rightarrow$ **Bateria**.
   - Altere para a opção **Sem Restrições** (*Unrestricted*).

3. **Início do Serviço Daemon Pós-Reboot**:
   - Se o celular for reiniciado, basta abrir o aplicativo Termux uma vez para ativar automaticamente o daemon do `crond` e o `termux-wake-lock`.

---

## 🧹 9. Limpeza Total de Bases de Dados e Caches Multi-Camadas

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
