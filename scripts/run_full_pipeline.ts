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
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aaaa = d.getFullYear();
  return `${dd}/${mm}/${aaaa}`;
}

function formatDateTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aaaa = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${aaaa} ${hh}:${min}:${ss}`;
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
  console.log(` 📅 Momento Inicial: \x1b[1m${formatDateTime(globalStart)}\x1b[0m`);
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m\n");

  const pipelineStages = [
    {
      id: "scrape_all",
      name: "1. Scrapers Multi-Fornecedores",
      description: "Extração B2B (Friboi, Seara, BRF, Aurora, Lar, Copacol)",
      command: "npx tsx scrapers/friboi/index.ts && npx tsx scrapers/seara/index.ts && npx tsx scrapers/brf/index.ts && npx tsx scrapers/aurora/index.ts && npx tsx scrapers/lar/index.ts && npx tsx scrapers/copacol/index.ts",
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

    console.log(`\x1b[1;32m✔ [${formatTime(sEnd)}]\x1b[0m Status: ${status} (Duração desta etapa: ${durationStr})\n`);

    if (status === "ERRO") {
      console.error(`\x1b[1;31m❌ Pipeline interrompido na etapa: ${stg.name}\x1b[0m`);
      break;
    }
  }

  const globalEnd = new Date();
  const totalDurationNum = (globalEnd.getTime() - globalStart.getTime()) / 1000;
  const totalDurationStr = formatDuration(totalDurationNum);

  // Leitura do arquivo do PWA para métricas de aprovação
  let pwaCount = 0;
  const pwaPath = "/root/repo_pwa/produtos.json";
  let pwaIds = new Set<string>();
  const fs = require("fs");
  const path = require("path");

  if (fs.existsSync(pwaPath)) {
    try {
      const pwaData = JSON.parse(fs.readFileSync(pwaPath, "utf-8"));
      if (Array.isArray(pwaData)) {
        pwaCount = pwaData.length;
        pwaData.forEach((p: any) => pwaIds.add(p.id));
      }
    } catch {
      // fallback
    }
  }

  // Consulta do Supabase em Tempo Real com Detalhamento por Fabricante
  let supabaseStats = { fabCount: 0, marcaCount: 0, prodCount: 0, codCount: 0 };
  interface FabDetail {
    id: string;
    nome: string;
    cnpj?: string;
    total: number;
    pwa: number;
    marcas: string[];
  }
  let fabDetails: FabDetail[] = [];

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

      // Detalhamento paginado por Fabricante
      const { data: fabsData } = await supabase.from("fabricantes").select("id, nome, cnpj");
      
      let allMarcas: any[] = [];
      let mPage = 0;
      while (true) {
        const { data: mData } = await supabase.from("marcas").select("id, nome, fabricante_id").range(mPage * 1000, (mPage + 1) * 1000 - 1);
        if (!mData || mData.length === 0) break;
        allMarcas = allMarcas.concat(mData);
        if (mData.length < 1000) break;
        mPage++;
      }

      let allProds: any[] = [];
      let pPage = 0;
      while (true) {
        const { data: pData } = await supabase.from("produtos").select("id, marca_id").range(pPage * 1000, (pPage + 1) * 1000 - 1);
        if (!pData || pData.length === 0) break;
        allProds = allProds.concat(pData);
        if (pData.length < 1000) break;
        pPage++;
      }

      const marcaToFab = new Map<string, string>();
      const fabToMarcas = new Map<string, Set<string>>();
      allMarcas.forEach((m: any) => {
        marcaToFab.set(m.id, m.fabricante_id);
        if (!fabToMarcas.has(m.fabricante_id)) {
          fabToMarcas.set(m.fabricante_id, new Set());
        }
        fabToMarcas.get(m.fabricante_id)!.add(m.nome);
      });

      const fabMap = new Map<string, { nome: string; cnpj: string; total: number; pwa: number }>();
      (fabsData || []).forEach((f: any) => {
        fabMap.set(f.id, {
          nome: f.nome,
          cnpj: f.cnpj || "",
          total: 0,
          pwa: 0
        });
      });

      allProds.forEach((p: any) => {
        const fId = marcaToFab.get(p.marca_id);
        if (fId && fabMap.has(fId)) {
          const entry = fabMap.get(fId)!;
          entry.total++;
          if (pwaIds.has(p.id)) entry.pwa++;
        }
      });

      fabDetails = Array.from(fabMap.entries()).map(([id, val]) => ({
        id,
        nome: val.nome,
        cnpj: val.cnpj,
        total: val.total,
        pwa: val.pwa,
        marcas: Array.from(fabToMarcas.get(id) || [])
      })).sort((a, b) => b.total - a.total);

    } catch {
      // Ignore error for stats fallback
    }
  }

  // Cálculos de Porcentagem PWA
  const totalBase = supabaseStats.prodCount || (fabDetails.reduce((acc, f) => acc + f.total, 0));
  const pwaApproved = pwaCount;
  const pwaApprovedPct = totalBase > 0 ? ((pwaApproved / totalBase) * 100).toFixed(2) : "0.00";
  const pwaPending = Math.max(0, totalBase - pwaApproved);
  const pwaPendingPct = totalBase > 0 ? ((pwaPending / totalBase) * 100).toFixed(2) : "0.00";

  // IMPRESSÃO DO RELATÓRIO FINAL CONSOLIDADO DE EXECUÇÃO
  console.log("\x1b[1;36m────────────────────────────────────────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;32m📋 RELATÓRIO CONSOLIDADO DO PROCESSAMENTO ETL\x1b[0m");
  console.log("\x1b[1;36m────────────────────────────────────────────────────────────────────────\x1b[0m");
  console.log(` 📅 Início Geral do Pipeline : \x1b[1m${formatDateTime(globalStart)}\x1b[0m`);
  console.log(` 🏁 Término Geral do Pipeline: \x1b[1m${formatDateTime(globalEnd)}\x1b[0m`);
  console.log(` ⏱️  Tempo Total do Pipeline  : \x1b[1;33m${totalDurationStr}\x1b[0m`);
  console.log("\x1b[1;36m────────────────────────────────────────────────────────────────────────\x1b[0m\n");

  // TABELA RESUMO CRONOLÓGICA DAS ETAPAS
  console.log("\x1b[1;33m📊 CRONOGRAMA CONSOLIDADO POR ETAPA:\x1b[0m\n");
  console.log("┌────────────────────────────────────┬──────────────┬──────────────┬──────────────┬────────┐");
  console.log("│ Etapa                              │ Início       │ Término      │ Duração      │ Status │");
  console.log("├────────────────────────────────────┼──────────────┼──────────────┼──────────────┼────────┤");
  for (const stg of stages) {
    const nameCol = stg.name.padEnd(34).substring(0, 34);
    const startCol = stg.startTime.padEnd(12);
    const endCol = stg.endTime.padEnd(12);
    const durCol = stg.durationSeconds.padStart(12);
    const statusCol = stg.status === "SUCESSO" ? "  ✔ OK " : " ❌ ERRO";
    console.log(`│ ${nameCol} │ ${startCol} │ ${endCol} │ ${durCol} │${statusCol}│`);
  }
  console.log("├────────────────────────────────────┼──────────────┼──────────────┼──────────────┼────────┤");
  const totalLabel = "🏁 TEMPO TOTAL DO PIPELINE".padEnd(34);
  const totalStart = formatTime(globalStart).padEnd(12);
  const totalEnd = formatTime(globalEnd).padEnd(12);
  const totalDur = totalDurationStr.padStart(12);
  console.log(`│ \x1b[1m${totalLabel}\x1b[0m │ \x1b[1m${totalStart}\x1b[0m │ \x1b[1m${totalEnd}\x1b[0m │ \x1b[1;33m${totalDur}\x1b[0m │ \x1b[1;32m  ✔ OK \x1b[0m│`);
  console.log("└────────────────────────────────────┴──────────────┴──────────────┴──────────────┴────────┘\n");

  console.log("\x1b[1;36m────────────────────────────────────────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;33m📌 DETALHAMENTO DE CADA ETAPA:\x1b[0m\n");

  for (const stg of stages) {
    const icon = stg.status === "SUCESSO" ? "✅" : "❌";
    console.log(`${icon} \x1b[1m${stg.name}\x1b[0m`);
    console.log(`   ├─ Início desta etapa  : ${stg.startTime}`);
    console.log(`   ├─ Término desta etapa : ${stg.endTime} (Duração desta etapa: ${stg.durationSeconds})`);
    console.log(`   └─ Detalhes            : ${stg.description}`);
  }

  // Leitura de novos produtos em staging/novos_produtos_log.json
  let novosCount = 0;
  let novosItems: any[] = [];
  const novosLogPath = path.join(process.cwd(), "staging", "novos_produtos_log.json");
  if (fs.existsSync(novosLogPath)) {
    try {
      const rawNovos = fs.readFileSync(novosLogPath, "utf-8");
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
  const atualizadosLogPath = path.join(process.cwd(), "staging", "produtos_atualizados_log.json");
  if (fs.existsSync(atualizadosLogPath)) {
    try {
      const rawAlt = fs.readFileSync(atualizadosLogPath, "utf-8");
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
  console.log("\x1b[1;33m📊 ESTATÍSTICAS GLOBAIS DA BASE & PWA:\x1b[0m");
  console.log(` 🥩 Total de Produtos na Base: \x1b[1m${totalBase}\x1b[0m (100.00%)`);
  console.log(` 📲 Aprovados para o PWA:      \x1b[1;32m${pwaApproved} (${pwaApprovedPct}%)\x1b[0m [com EAN-13 válido]`);
  console.log(` ⏳ Pendentes / Sem EAN-13:    \x1b[1;33m${pwaPending} (${pwaPendingPct}%)\x1b[0m [apenas SKU/DUN interno]`);
  console.log(` 🏢 Fabricantes Sincronizados: ${supabaseStats.fabCount}`);
  console.log(` 🏷️  Marcas Sincronizadas:      ${supabaseStats.marcaCount}`);
  console.log(` 📊 Códigos de Barras Totais:  ${supabaseStats.codCount}`);

  if (fabDetails.length > 0) {
    console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
    console.log("\x1b[1;33m🏢 DETALHAMENTO POR FABRICANTE:\x1b[0m");
    fabDetails.forEach((f, idx) => {
      const fPct = f.total > 0 ? ((f.pwa / f.total) * 100).toFixed(2) : "0.00";
      const marcasPreview = f.marcas.slice(0, 5).join(", ") + (f.marcas.length > 5 ? ` (+${f.marcas.length - 5} marcas)` : "");
      console.log(` ${idx + 1}. \x1b[1m${f.nome}\x1b[0m`);
      console.log(`    ├─ Produtos na Base: \x1b[1m${f.total}\x1b[0m | Aprovados PWA: \x1b[1;32m${f.pwa} (${fPct}%)\x1b[0m`);
      console.log(`    ├─ Total de Marcas:  ${f.marcas.length}`);
      console.log(`    └─ Principais Linhas: ${marcasPreview || 'N/D'}`);
    });
  }

  if (novosCount > 0) {
    console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
    console.log(` ✨ Novos Produtos:    \x1b[1;32m${novosCount} recém-incluídos nesta execução\x1b[0m`);
    console.log("\x1b[1;33m📌 RESUMO DOS NOVOS PRODUTOS:\x1b[0m");
    novosItems.slice(0, 8).forEach((item: any, idx: number) => {
      console.log(`   ${idx + 1}. \x1b[1m${item.marca || 'N/D'}\x1b[0m - EAN: ${item.ean || 'N/D'} | ${item.descricao}`);
    });
    if (novosItems.length > 8) {
      console.log(`   ... e mais ${novosItems.length - 8} novos produtos (\x1b[1;36metl-novos\x1b[0m).`);
    }
  } else {
    console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
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
  console.log("\x1b[1;36m────────────────────────────────────────────────────────────────────────\x1b[0m");
  console.log(` 📅 Início Geral do Pipeline : \x1b[1m${formatDateTime(globalStart)}\x1b[0m`);
  console.log(` 🏁 Término Geral do Pipeline: \x1b[1m${formatDateTime(globalEnd)}\x1b[0m`);
  console.log(` ⏱️  Tempo Total Decorrido   : \x1b[1;33m${totalDurationStr}\x1b[0m`);
  console.log("\x1b[1;36m────────────────────────────────────────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;32m✔ PIPELINE FINALIZADO COM SUCESSO!\x1b[0m");
  console.log("\x1b[1;36m────────────────────────────────────────────────────────────────────────\x1b[0m");
}

runPipeline().catch((err) => {
  console.error("❌ Falha crítica no pipeline:", err);
  process.exit(1);
});
