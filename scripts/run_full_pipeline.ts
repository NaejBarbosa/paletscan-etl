import { execSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

interface StageResult {
  id: string;
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  durationSeconds: string;
  status: "SUCESSO" | "ERRO";
  details: string;
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}h ${mm}min ${ss}s`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = (totalSec % 60).toFixed(2);

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}min`);
  parts.push(`${s}s`);

  return parts.join(" ");
}

async function runPipeline() {
  const globalStart = new Date();
  const stages: StageResult[] = [];

  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;32m🚀 PALETSCAN ETL ── PIPELINE FULL\x1b[0m");
  console.log(` 📅 Data: ${formatDate(globalStart)}`);
  console.log(` ⏰ Horário Inicial: ${formatTime(globalStart)}`);
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m\n");

  const pipelineStages = [
    {
      id: "scrape_all",
      name: "1. Scrapers Multi-Fornecedores",
      description: "Extração B2B (Friboi, Seara, BRF, Aurora, Lar)",
      command: "npx tsx scrapers/friboi/index.ts && npx tsx scrapers/seara/index.ts && npx tsx scrapers/brf/index.ts && npx tsx scrapers/aurora/index.ts && npx tsx scrapers/lar/index.ts",
    },
    {
      id: "sync_supabase",
      name: "2. Sincronização Supabase",
      description: "Carga relacional UUIDv5 & tratamento de EAN/DUN",
      command: "npx tsx db_sync/sync.ts",
    },
    {
      id: "sanitize_db",
      name: "3. Sanitização PostgreSQL",
      description: "Normalização Title Case & Modulus 10 EAN-13",
      command: "npx tsx db_sync/sanitize_supabase_db.ts",
    },
    {
      id: "export_pwa",
      name: "4. Publicação PWA",
      description: "Geração de produtos.json purificado para o PWA",
      command: "npx tsx scripts/generate_pwa_produtos_json.ts",
    },
    {
      id: "audit_db",
      name: "5. Auditoria de Integridade",
      description: "Auditoria exaustiva contra anomalias e órfãos",
      command: "npx tsx scripts/audit_database.ts",
    },
  ];

  for (const stg of pipelineStages) {
    const sStart = new Date();
    console.log(`\x1b[1;34m▶ [${formatTime(sStart)}]\x1b[0m \x1b[1;33m${stg.name}\x1b[0m`);
    console.log(`  \x1b[0;36mDesc:\x1b[0m ${stg.description}`);

    let status: "SUCESSO" | "ERRO" = "SUCESSO";
    let details = "";

    try {
      execSync(stg.command, { stdio: "inherit" });
      details = "Executado sem erros.";
    } catch (err: any) {
      status = "ERRO";
      details = err.message || "Erro durante a execução do comando.";
    }

    const sEnd = new Date();
    const durationNum = (sEnd.getTime() - sStart.getTime()) / 1000;
    const durationStr = formatDuration(durationNum);

    stages.push({
      id: stg.id,
      name: stg.name,
      description: stg.description,
      startTime: formatTime(sStart),
      endTime: formatTime(sEnd),
      durationSeconds: durationStr,
      status,
      details,
    });

    console.log(`\x1b[1;32m✔ [${formatTime(sEnd)}]\x1b[0m Status: ${status} (Duração: ${durationStr})\n`);

    if (status === "ERRO") {
      console.error(`\x1b[1;31m❌ Pipeline interrompido na etapa: ${stg.name}\x1b[0m`);
      break;
    }
  }

  const globalEnd = new Date();
  const totalDurationNum = (globalEnd.getTime() - globalStart.getTime()) / 1000;
  const totalDurationStr = formatDuration(totalDurationNum);

  // Consulta do Supabase em Tempo Real
  let supabaseStats = { fabCount: 0, marcaCount: 0, prodCount: 0, codCount: 0 };
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { count: fab } = await supabase.from("fabricantes").select("*", { count: "exact", head: true });
      const { count: marca } = await supabase.from("marcas").select("*", { count: "exact", head: true });
      const { count: prod } = await supabase.from("produtos").select("*", { count: "exact", head: true });
      const { count: cod } = await supabase.from("codigos_barras").select("*", { count: "exact", head: true });

      supabaseStats = {
        fabCount: fab ?? 0,
        marcaCount: marca ?? 0,
        prodCount: prod ?? 0,
        codCount: cod ?? 0,
      };
    } catch {
      // Ignore error for stats fallback
    }
  }

  // IMPRESSÃO DO RELATÓRIO FINAL DE EXECUÇÃO
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;32m📋 RELATÓRIO DE EXECUÇÃO DO ETL\x1b[0m");
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log(` 📅 Data:           ${formatDate(globalStart)}`);
  console.log(` ⏰ Horário Início: ${formatTime(globalStart)}`);
  console.log(` 🏁 Horário Fim:    ${formatTime(globalEnd)}`);
  console.log(` ⏱️  Tempo Total:    ${totalDurationStr}`);
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;33m📌 DETALHAMENTO DE CADA ETAPA:\x1b[0m\n");

  for (const stg of stages) {
    const icon = stg.status === "SUCESSO" ? "✅" : "❌";
    console.log(`${icon} \x1b[1m${stg.name}\x1b[0m`);
    console.log(`   ├─ Início  : ${stg.startTime}`);
    console.log(`   ├─ Término : ${stg.endTime} (Duração: ${stg.durationSeconds})`);
    console.log(`   └─ Detalhes: ${stg.description}`);
  }

  // Leitura de novos produtos em staging/novos_produtos_log.json
  let novosCount = 0;
  let novosItems: any[] = [];
  const novosLogPath = require("path").join(process.cwd(), "staging", "novos_produtos_log.json");
  if (require("fs").existsSync(novosLogPath)) {
    try {
      const rawNovos = require("fs").readFileSync(novosLogPath, "utf-8");
      const parsedNovos = JSON.parse(rawNovos);
      if (Array.isArray(parsedNovos)) {
        novosItems = parsedNovos;
        novosCount = parsedNovos.length;
      }
    } catch {
      novosCount = 0;
    }
  }

  // Leitura de produtos alterados em staging/produtos_atualizados_log.json
  let atualizadosCount = 0;
  let atualizadosItems: any[] = [];
  const atualizadosLogPath = require("path").join(process.cwd(), "staging", "produtos_atualizados_log.json");
  if (require("fs").existsSync(atualizadosLogPath)) {
    try {
      const rawAlt = require("fs").readFileSync(atualizadosLogPath, "utf-8");
      const parsedAlt = JSON.parse(rawAlt);
      if (Array.isArray(parsedAlt)) {
        atualizadosItems = parsedAlt;
        atualizadosCount = parsedAlt.length;
      }
    } catch {
      atualizadosCount = 0;
    }
  }

  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;33m📊 BASE DE DADOS SUPABASE (AO VIVO):\x1b[0m");
  console.log(` 🏢 Fabricantes:       ${supabaseStats.fabCount}`);
  console.log(` 🏷️  Marcas:            ${supabaseStats.marcaCount}`);
  console.log(` 🥩 Produtos Totais:   ${supabaseStats.prodCount}`);
  console.log(` 📊 Códigos de Barras: ${supabaseStats.codCount}`);
  if (novosCount > 0) {
    console.log(` ✨ Novos Produtos:    \x1b[1;32m${novosCount} recém-incluídos nesta execução\x1b[0m`);
    console.log("\x1b[1;33m📌 RESUMO DOS NOVOS PRODUTOS:\x1b[0m");
    novosItems.slice(0, 8).forEach((item: any, idx: number) => {
      console.log(`   ${idx + 1}. \x1b[1m${item.marca || 'N/D'}\x1b[0m - EAN: ${item.ean || 'N/D'} | ${item.descricao}`);
    });
    if (novosItems.length > 8) {
      console.log(`   ... e mais ${novosItems.length - 8} novos produtos (\x1b[1;36metl-novos\x1b[0m).`);
    }
  } else {
    console.log(` ✨ Novos Produtos:    0 recém-incluídos nesta execução`);
  }

  if (atualizadosCount > 0) {
    console.log(` 🔄 Alterados/Atualiz.: \x1b[1;33m${atualizadosCount} produtos modificados nesta execução\x1b[0m`);
    console.log("\x1b[1;33m📌 RESUMO DAS ALTERAÇÕES/ATUALIZAÇÕES:\x1b[0m");
    atualizadosItems.slice(0, 8).forEach((item: any, idx: number) => {
      const camposStr = item.alteracoes?.map((a: any) => a.campo).join(', ') || '';
      console.log(`   ${idx + 1}. \x1b[1m${item.marca || 'N/D'}\x1b[0m - EAN: ${item.ean || 'N/D'} | ${item.descricao}`);
      console.log(`      └─ Campos: ${camposStr}`);
    });
    if (atualizadosItems.length > 8) {
      console.log(`   ... e mais ${atualizadosItems.length - 8} produtos alterados (\x1b[1;36metl-atualizados\x1b[0m).`);
    }
  } else {
    console.log(` 🔄 Alterados/Atualiz.: 0 produtos modificados nesta execução`);
  }
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;32m✔ PIPELINE FINALIZADO COM SUCESSO!\x1b[0m");
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
}

runPipeline().catch((err) => {
  console.error("❌ Falha crítica no pipeline:", err);
  process.exit(1);
});
