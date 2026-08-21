import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ ERRO: SUPABASE_URL ou SUPABASE_KEY não configurados no .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

import fs from "fs";
import path from "path";

function formatDateTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aaaa = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${aaaa} ${hh}:${min}:${ss}`;
}

async function verify() {
  const now = new Date();
  const { count: prodCount } = await supabase.from("produtos").select("*", { count: "exact", head: true });
  const { count: codCount } = await supabase.from("codigos_barras").select("*", { count: "exact", head: true });
  const { count: marcaCount } = await supabase.from("marcas").select("*", { count: "exact", head: true });
  const { count: fabCount } = await supabase.from("fabricantes").select("*", { count: "exact", head: true });

  // Leitura do PWA produtos.json
  let pwaCount = 0;
  const pwaIds = new Set<string>();
  const pwaPath = "/root/repo_pwa/produtos.json";
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

  // Detalhamento por fabricante
  interface FabDetail {
    id: string;
    nome: string;
    cnpj?: string;
    total: number;
    pwa: number;
    marcas: string[];
  }
  let fabDetails: FabDetail[] = [];

  try {
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
    // fallback
  }

  let novosCount = 0;
  const novosLogPath = path.join(process.cwd(), "staging", "novos_produtos_log.json");
  if (fs.existsSync(novosLogPath)) {
    try {
      const rawNovos = fs.readFileSync(novosLogPath, "utf-8");
      const parsedNovos = JSON.parse(rawNovos);
      if (Array.isArray(parsedNovos)) novosCount = parsedNovos.length;
    } catch {
      novosCount = 0;
    }
  }

  let atualizadosCount = 0;
  const atualizadosLogPath = path.join(process.cwd(), "staging", "produtos_atualizados_log.json");
  if (fs.existsSync(atualizadosLogPath)) {
    try {
      const rawAlt = fs.readFileSync(atualizadosLogPath, "utf-8");
      const parsedAlt = JSON.parse(rawAlt);
      if (Array.isArray(parsedAlt)) atualizadosCount = parsedAlt.length;
    } catch {
      atualizadosCount = 0;
    }
  }

  const totalBase = prodCount ?? (fabDetails.reduce((acc, f) => acc + f.total, 0));
  const pwaApproved = pwaCount;
  const pwaApprovedPct = totalBase > 0 ? ((pwaApproved / totalBase) * 100).toFixed(2) : "0.00";
  const pwaPending = Math.max(0, totalBase - pwaApproved);
  const pwaPendingPct = totalBase > 0 ? ((pwaPending / totalBase) * 100).toFixed(2) : "0.00";

  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log("\x1b[1;32m📊 STATUS ATUAL DA BASE (SUPABASE & PWA)\x1b[0m");
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  console.log(` 📅 Momento da Consulta:       \x1b[1m${formatDateTime(now)}\x1b[0m`);
  console.log(` 🥩 Total de Produtos na Base: \x1b[1m${totalBase}\x1b[0m (100.00%)`);
  console.log(` 📲 Aprovados para o PWA:      \x1b[1;32m${pwaApproved} (${pwaApprovedPct}%)\x1b[0m [com EAN-13 válido]`);
  console.log(` ⏳ Pendentes / Sem EAN-13:    \x1b[1;33m${pwaPending} (${pwaPendingPct}%)\x1b[0m [apenas SKU/DUN interno]`);
  console.log(` 🏢 Fabricantes:               ${fabCount ?? 0}`);
  console.log(` 🏷️  Marcas:                    ${marcaCount ?? 0}`);
  console.log(` 📊 Códigos de Barras:         ${codCount ?? 0}`);

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

  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
  if (novosCount > 0) {
    console.log(` ✨ Novos Produtos:    \x1b[1;32m${novosCount} recém-incluídos nesta execução\x1b[0m`);
  } else {
    console.log(` ✨ Novos Produtos:    0 recém-incluídos`);
  }
  if (atualizadosCount > 0) {
    console.log(` 🔄 Alterados/Atualiz.: \x1b[1;33m${atualizadosCount} produtos modificados\x1b[0m`);
  }
  console.log("\x1b[1;36m────────────────────────────────────\x1b[0m");
}

verify().catch((err) => {
  console.error("❌ Erro ao consultar Supabase:", err.message);
  process.exit(1);
});
