#!/usr/bin/env bash
# ==============================================================================
# 📦 PALETSCAN ETL - SUITE DE ALIASES E COMANDOS (MOBILE TERMINAL UX)
# Autor: PaletScan Data Engineering Team
# Arquivo: /root/paletscan-etl/paletscan_aliases.sh
# ==============================================================================

PALETSCAN_ETL_DIR="/root/paletscan-etl"
PALETSCAN_LOG_DIR="${PALETSCAN_ETL_DIR}/logs"

# Garante que a pasta de logs existe
mkdir -p "$PALETSCAN_LOG_DIR"

# Core Runner Helper: Executa o comando com log automático
_paletscan_run() {
  local cmd_name="$1"
  shift
  local timestamp
  timestamp=$(date +"%Y%m%d_%H%M%S")
  local log_file="${PALETSCAN_LOG_DIR}/etl_${cmd_name}_${timestamp}.log"
  local latest_link="${PALETSCAN_LOG_DIR}/latest.log"

  echo -e "\033[1;36m────────────────────────────────────\033[0m"
  echo -e "\033[1;34m[PaletScan ETL]\033[0m Rodando: \033[1;33m${cmd_name}\033[0m"
  echo -e "\033[0;36m📄 Log: ${log_file}\033[0m"
  echo -e "\033[1;36m────────────────────────────────────\033[0m"

  cd "$PALETSCAN_ETL_DIR" || return 1
  
  # Executa o comando, exibindo no terminal e gravando no arquivo de log
  ("$@" 2>&1) | tee "$log_file"

  ln -sf "$log_file" "$latest_link"
  echo -e "\033[1;36m────────────────────────────────────\033[0m"
  echo -e "\033[1;32m✔ [PaletScan] Concluído: ${cmd_name}\033[0m"
  echo -e "\033[1;36m────────────────────────────────────\033[0m"
}

# ==============================================================================
# 🚀 COMANDO COMPLETO: EXECUTA TUDO + SINCRONIZA + EXIBE LOGS NA CLI
# ==============================================================================
etl-run() {
  echo -e "\033[1;36m────────────────────────────────────\033[0m"
  echo -e "\033[1;32m🚀 PALETSCAN ETL ── PIPELINE COMPLETO\033[0m"
  echo -e "\033[1;36m────────────────────────────────────\033[0m"
  echo -e " 1. Scrapers (Friboi, Seara, BRF, Aurora, Lar)"
  echo -e " 2. Carga Relacional UUIDv5 no Supabase"
  echo -e " 3. Sanitização Title Case & Modulus 10"
  echo -e " 4. Exportação produtos.json PWA"
  echo -e " 5. Auditoria de Banco & Exibição de Logs"
  echo -e "\033[1;36m────────────────────────────────────\033[0m"

  # Executa o pipeline completo (npm run full) gravando logs
  _paletscan_run full npm run full

  local latest="${PALETSCAN_LOG_DIR}/latest.log"

  echo ""
  echo -e "\033[1;36m────────────────────────────────────\033[0m"
  echo -e "\033[1;33m📊 STATUS ATUAL DAS BASES (SUPABASE)\033[0m"
  cd "$PALETSCAN_ETL_DIR" || return 1
  npm run status

  echo ""
  echo -e "\033[1;36m────────────────────────────────────\033[0m"
  echo -e "\033[1;32m📄 RESUMO DOS LOGS DE EXECUÇÃO (CLI)\033[0m"
  echo -e "\033[0;36mArquivo: ${latest}\033[0m"
  echo -e "\033[1;36m────────────────────────────────────\033[0m"
  
  if [ -f "$latest" ]; then
    tail -n 35 "$latest"
  else
    echo -e "\033[1;31mNenhum log encontrado.\033[0m"
  fi

  echo -e "\033[1;36m────────────────────────────────────\033[0m"
  echo -e "\033[1;32m✔ PIPELINE & SINCRONIZAÇÃO FINALIZADOS!\033[0m"
  echo -e "\033[1;36m────────────────────────────────────\033[0m"
}

alias etl-pipeline="etl-run"

# ==============================================================================
# 📋 HELPER & MENU DE COMANDOS (etl-help / paletscan) - MOBILE TERMINAL FIT
# ==============================================================================
paletscan-help() {
  cd "$PALETSCAN_ETL_DIR" || return 1
  npm run help:manifest
}

alias paletscan="paletscan-help"
alias etl-help="paletscan-help"

# ==============================================================================
# 🚀 ALIASES DE EXTRAÇÃO INDIVIDUAL (SCRAPERS)
# ==============================================================================
alias etl-friboi='_paletscan_run friboi npx tsx scrapers/friboi/index.ts'
alias etl-seara='_paletscan_run seara npx tsx scrapers/seara/index.ts'
alias etl-brf='_paletscan_run brf npx tsx scrapers/brf/index.ts'
alias etl-aurora='_paletscan_run aurora npx tsx scrapers/aurora/index.ts'
alias etl-lar='_paletscan_run lar npx tsx scrapers/lar/index.ts'

alias etl-scrape-all='_paletscan_run scrape_all npm run scrape:all'

# ==============================================================================
# 🔄 ALIASES DE PROCESSAMENTO & PIPELINE
# ==============================================================================
alias etl-sync='_paletscan_run sync npm run sync:supabase'
alias etl-images='_paletscan_run images npm run sync:images'
alias etl-sanitize='_paletscan_run sanitize npm run sanitize'
alias etl-export='_paletscan_run export npm run export:pwa'
alias etl-export-excel='_paletscan_run export_excel npm run export:excel'
alias etl-audit='_paletscan_run audit npm run audit'
alias etl-wipe='_paletscan_run wipe npm run wipe'

alias etl-full='etl-run'

# ==============================================================================
# 📊 ALIASES DE MONITORAMENTO DE LOGS & SAÚDE
# ==============================================================================
etl-logs() {
  local latest="${PALETSCAN_LOG_DIR}/latest.log"
  if [ -f "$latest" ]; then
    echo -e "\033[1;34m[PaletScan Logs]\033[0m Exibindo logs ao vivo (\033[1;33mCtrl+C para sair\033[0m):"
    echo -e "\033[1;36m────────────────────────────────────\033[0m"
    tail -n 40 -f "$latest"
  else
    echo -e "\033[1;31m[PaletScan Logs]\033[0m Nenhum log recente em ${PALETSCAN_LOG_DIR}."
  fi
}

etl-conflicts() {
  local conflicts_file="${PALETSCAN_ETL_DIR}/staging/conflicts_log.json"
  if [ -f "$conflicts_file" ]; then
    echo -e "\033[1;34m[PaletScan Conflitos]\033[0m Log de conflitos EAN/DUN:"
    echo -e "\033[1;36m────────────────────────────────────\033[0m"
    cat "$conflicts_file" | tail -n 30
  else
    echo -e "\033[1;32m✔ Nenhum conflito em staging.\033[0m"
  fi
}

etl-status() {
  cd "$PALETSCAN_ETL_DIR" || return 1
  npm run status
}

etl-novos() {
  cd "$PALETSCAN_ETL_DIR" || return 1
  npx tsx scripts/show_new_products.ts
}

alias etl-novos-produtos="etl-novos"

etl-atualizados() {
  cd "$PALETSCAN_ETL_DIR" || return 1
  npx tsx scripts/show_updated_products.ts
}

alias etl-alteracoes="etl-atualizados"

# ==============================================================================
# ⏰ GERENCIAMENTO DE AGENDAMENTO (CRONTAB LINUX)
# ==============================================================================
etl-schedule() {
  echo -e "\033[1;36m────────────────────────────────────\033[0m"
  echo -e "\033[1;32m ⏰ AGENDAMENTO LINUX (CRONTAB)\033[0m"
  echo -e "\033[1;36m────────────────────────────────────\033[0m"
  echo "Frequência para etl-run:"
  echo " 1) Diariamente às 03:00"
  echo " 2) De 12 em 12 horas"
  echo " 3) De 6 em 6 horas"
  echo " 4) Personalizado (Cron)"
  echo " 5) Cancelar"
  echo -n "Opção [1-5]: "
  read -r opt

  local cron_expr=""
  case $opt in
    1) cron_expr="0 3 * * *" ;;
    2) cron_expr="0 3,15 * * *" ;;
    3) cron_expr="0 */6 * * *" ;;
    4)
      echo -n "Cron expr (ex: '30 2 * * *'): "
      read -r cron_expr
      ;;
    5)
      echo "Cancelado."
      return 0
      ;;
    *)
      echo "Opção inválida."
      return 1
      ;;
  esac

  if [ -n "$cron_expr" ]; then
    local cron_cmd="cd ${PALETSCAN_ETL_DIR} && ./paletscan_aliases.sh etl-full-cron >> ${PALETSCAN_LOG_DIR}/cron_output.log 2>&1"
    
    (crontab -l 2>/dev/null | grep -v "PALETSCAN_ETL_FULL_JOB" ; echo "${cron_expr} ${cron_cmd} # PALETSCAN_ETL_FULL_JOB") | crontab -
    
    echo -e "\033[1;32m✔ Agendado com sucesso!\033[0m (${cron_expr})"
  fi
}

etl-cron-list() {
  echo -e "\033[1;34m[PaletScan Crontab]\033[0m Agendamento ativo:"
  echo -e "\033[1;36m────────────────────────────────────\033[0m"
  crontab -l 2>/dev/null | grep "PALETSCAN_ETL_FULL_JOB" || echo "Nenhum agendamento ativo."
}

etl-cron-remove() {
  crontab -l 2>/dev/null | grep -v "PALETSCAN_ETL_FULL_JOB" | crontab -
  echo -e "\033[1;32m✔ Agendamentos removidos do crontab.\033[0m"
}

# Suporte interno para chamada via cron
if [ "$1" = "etl-full-cron" ]; then
  _paletscan_run full_cron npm run full
fi

# Mensagem amigável de carregamento do alias
if [ -t 1 ]; then
  echo -e "\033[1;32m✔ PaletScan Aliases carregados!\033[0m Digite \033[1;36mpaletscan\033[0m para ajuda."
fi
