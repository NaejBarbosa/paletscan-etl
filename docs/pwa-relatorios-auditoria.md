# 📊 Relatórios, Conferência & Auditoria

Os módulos de relatórios e auditoria do **PaletScan PWA** centralizam o controle de estoque, acompanhamento de validades, conferência física de paletes e auditoria de inventário.

---

## 📈 1. Relatório Geral de Paletes ([`Relatorio.tsx`](file:///root/repo_pwa/components/Relatorio.tsx))

* **Cards de Métricas Operacionais**: Total de paletes, SKUs únicos, câmaras em uso e divisão Congelados/Resfriados.
* **Filtro Multi-Seleção de Marcas em Estoque Físico**: O seletor de marcas calcula dinamicamente as opções disponíveis a partir dos paletes reais armazenados nas câmaras frias, permitindo seleção múltipla sem poluir a lista com marcas sem estoque.
* **Cabeçalho Adaptativo e Responsivo**:
  - **Desktop / Tablet**: Exibição completa de colunas (Recebimento, Código, Descrição, Marca, Vaga, Validade e Dias Restantes).
  - **Smartphone**: Layout compacto e verticalizado, otimizando o espaço da tela para visualização rápida da posição física da carga.
* **Padronização de Contêiner**: Largura simétrica fixa (`min-w-[92px] sm:min-w-[100px]`) para exibição consistente de contadores de itens em smartphones.

---

## 📋 2. Modo de Conferência Física de Paletes & Checklist

O fluxo de auditoria física de estoque opera com checklist reativo e ações em massa:

```mermaid
flowchart TD
    AUDIT["📋 Operador Inicia Conferência Física"]

    AUDIT --> CHK["1. Ativa Checklist Tátil no Palete"]

    CHK --> V1["Entrada via Bipagem com Scanner"]
    CHK --> V2["Entrada via Toque Tátil na Tela"]

    V1 --> CONF["✅ Marcação Automática do Item Confirmado"]
    V2 --> CONF

    CONF --> RES1["Palete 100% Conferido: Mantido em Estoque"]
    CONF --> RES2["Divergência ou Item Ausente: Destaque em Vermelho"]

    RES2 --> EXP["🗑️ Ação de Expurgo em Massa (API Serverless)"]
```

---

## 🧬 3. Motor de Histórico & Ciclos de Vida (`paleteHistoricoEngine.ts`)

Para garantir rastreabilidade total sem poluir a interface do usuário com dezenas de linhas individuais para o mesmo palete, o componente de histórico processa os eventos brutos em **Grupos Semânticos e Ciclos de Vida**:

```mermaid
flowchart TD
    RAW["📜 Leitura de Eventos Brutos do Supabase\n(Tabela paletes_historico)"]
    
    RAW --> SORT["1. Ordenação Cronológica Estrita\n(Mais recente para o mais antigo)"]
    
    SORT --> SPLIT["2. Segmentação de Ciclos de Vida\n(Novo ciclo a cada mudança de palete_id ou intervalo superior a 5 minutos)"]
    
    SPLIT --> C_ATIVO["Ciclo 0: Palete Ativo Atual\n(status: ativo - Carga física presente na vaga)"]
    SPLIT --> C_HIST["Ciclos 1..N: Paletes Históricos\n(status: excluido - Cargas passadas já expedidas)"]
    
    C_ATIVO --> GROUP["3. Agrupamento Semântico de Ações"]
    C_HIST --> GROUP
    
    GROUP --> G1["Criação Consolidada (N itens agrupados)"]
    GROUP --> G2["Conferência Física (Confirmados vs Removidos)"]
    GROUP --> G3["Edição de Validades e Dados"]
    GROUP --> G4["Exclusão ou Baixa Total"]
    GROUP --> G5["Restauração de Palete"]
```

### Tipos Canônicos de Eventos de Ciclo de Vida:
* `CRIACAO_PALETE` / `CRIACAO`: Criação de um novo palete físico na vaga. Eventos ocorridos na mesma janela temporal são agrupados sob um único card visual (*"Criação do Palete: X itens"*).
* `ADICAO_PRODUTO`: Adição de novo SKU a um palete já existente na câmara fria.
* `CONFERENCIA_ITEM_CONFIRMADO`: Validação física de que a caixa/fardo está presente na câmara.
* `CONFERENCIA_AUSENTE_REMOVIDO`: Baixa de produto ausente durante o checklist.
* `EDICAO_VALIDADE`: Ajuste manual na data de validade de um produto já alocado.
* `EXCLUSAO_TOTAL_PALETE`: Baixa completa do palete da vaga, selando o ciclo de vida.
* `RESTAURACAO_PALETE`: Recuperação de palete ou produto excluído acidentalmente.

---

## 📡 4. Telemetria de Sessão e DevTools Remoto (Eruda & `logs_sessao`)

O chão de fábrica apresenta variáveis incontroláveis de rede e hardware (temperaturas extremas, lentes de câmera embaçadas por condensação térmica e dispositivos de diferentes marcas). 

Para permitir diagnósticos em tempo real sem necessidade de conectar cabos USB no interior das câmaras:

```mermaid
flowchart TD
    CONSOLE["📱 Evento no Cliente PWA ou Console Eruda\n(Log, Erro de Leitura ou Reporte ADM)"]
    
    CONSOLE --> BATCH["1. Fila de Telemetria em Memória\n(Agrupa mensagens e captura snapshot de viewport e rota)"]
    
    BATCH --> POST["2. Disparo Assíncrono para a rota de logs"]
    
    POST --> BD["3. Persistência em logs_sessao no Supabase\nIndexado por usuario_id, data e severidade"]
    
    POST --> FILE["4. Arquivo de Auditoria Local logs client.log\nAcessível imediatamente no backend para análise"]
    
    BD --> ADMIN["5. Painel Administrativo (/admin)\nVisualização instantânea de anomalias em tempo real"]
```

### Recursos de Telemetria Operacional:
* **Snapshot de Ambiente do Dispositivo**: Resolução de tela (ex: `1600x765` para Desktop vs `390x844` para mobile), User-Agent, rota ativa e tempo de resposta da rede.
* **Eruda DevTools Móvel**: Console flutuante integrado acionável em campo por administradores para ver logs locais do browser no celular.
* **Histórico de Auditoria**: Qualquer alteração em paletes, exclusões em massa ou bloqueios de marcas é auditada com o login do operador.

---

## 📄 5. Exportação de Relatórios (CSV CP1252 & PDF Executivo)

* **CSV Otimizado para Android (`CP1252`)**: Codificação Windows-1252 com delimitador ponto e vírgula (`;`), abrindo diretamente no Excel/Google Sheets do celular sem problemas de acentuação.
* **PDF Executivo (`jspdf` + `jspdf-autotable`)**: Relatório formatado com cabeçalho corporativo, divisão por câmara/vaga e badges de validade.
* **Android MediaScan**: Indexação imediata dos arquivos na biblioteca do dispositivo via `termux-media-scan`.

