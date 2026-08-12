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
  return d.toLocaleTimeString("pt-BR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("pt-BR");
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
    const duration = ((sEnd.getTime() - sStart.getTime()) / 1000).toFixed(2);

    stages.push({
      id: stg.id,
      name: stg.name,
      description: stg.description,
      startTime: formatTime(sStart),
      endTime: formatTime(sEnd),
      durationSeconds: `${duration}s`,
      status,
      details,
    });

    console.log(`\x1b[1;32m✔ [${formatTime(sEnd)}]\x1b[0m Status: ${status} (Duração: ${duration}s)\n`);

    if (status === "ERRO") {
      console.error(`\x1b[1;31m❌ Pipeline interrompido na etapa: ${stg.name}\x1b[0m`);
      break;
    }
  }

  const globalEnd = new Date();
  const totalDuration = ((globalEnd.getTime() - globalStart.getTime()) / 1000).toFixed(2);

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
  console.log(` ⏱️  Tempo Total:    ${totalDuration}s`);
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;33m📌 DETALHAMENTO DE CADA ETAPA:\x1b[0m\n");

  for (const stg of stages) {
    const icon = stg.status === "SUCESSO" ? "✅" : "❌";
    console.log(`${icon} \x1b[1m${stg.name}\x1b[0m`);
    console.log(`   ├─ Início  : ${stg.startTime}`);
    console.log(`   ├─ Término : ${stg.endTime} (${stg.durationSeconds})`);
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

  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;33m📊 BASE DE DADOS SUPABASE (AO VIVO):\x1b[0m");
  console.log(` 🏢 Fabricantes:       ${supabaseStats.fabCount}`);
  console.log(` 🏷️  Marcas:            ${supabaseStats.marcaCount}`);
  console.log(` 🥩 Produtos Totais:   ${supabaseStats.prodCount}`);
  console.log(` 📊 Códigos de Barras: ${supabaseStats.codCount}`);
  if (novosCount > 0) {
    console.log(` ✨ Novos Produtos:    \x1b[1;32m${novosCount} recém-incluídos\x1b[0m`);
    console.log("\x1b[1;33m📌 RESUMO DOS NOVOS PRODUTOS:\x1b[0m");
    novosItems.slice(0, 8).forEach((item: any, idx: number) => {
      console.log(`   ${idx + 1}. \x1b[1m${item.marca || 'N/D'}\x1b[0m - EAN: ${item.ean || 'N/D'} | ${item.descricao}`);
    });
    if (novosItems.length > 8) {
      console.log(`   ... e mais ${novosItems.length - 8} novos produtos (\x1b[1;36metl-novos\x1b[0m).`);
    }
  }
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;32m✔ PIPELINE FINALIZADO COM SUCESSO!\x1b[0m");
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
}

runPipeline().catch((err) => {
  console.error("❌ Falha crítica no pipeline:", err);
  process.exit(1);
});
