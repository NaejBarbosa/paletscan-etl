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

async function verify() {
  const { count: prodCount } = await supabase.from("produtos").select("*", { count: "exact", head: true });
  const { count: codCount } = await supabase.from("codigos_barras").select("*", { count: "exact", head: true });
  const { count: marcaCount } = await supabase.from("marcas").select("*", { count: "exact", head: true });
  const { count: fabCount } = await supabase.from("fabricantes").select("*", { count: "exact", head: true });

  let novosCount = 0;
  const novosLogPath = require("path").join(process.cwd(), "staging", "novos_produtos_log.json");
  if (require("fs").existsSync(novosLogPath)) {
    try {
      const rawNovos = require("fs").readFileSync(novosLogPath, "utf-8");
      const parsedNovos = JSON.parse(rawNovos);
      if (Array.isArray(parsedNovos)) novosCount = parsedNovos.length;
    } catch {
      novosCount = 0;
    }
  }

  let atualizadosCount = 0;
  const atualizadosLogPath = require("path").join(process.cwd(), "staging", "produtos_atualizados_log.json");
  if (require("fs").existsSync(atualizadosLogPath)) {
    try {
      const rawAlt = require("fs").readFileSync(atualizadosLogPath, "utf-8");
      const parsedAlt = JSON.parse(rawAlt);
      if (Array.isArray(parsedAlt)) atualizadosCount = parsedAlt.length;
    } catch {
      atualizadosCount = 0;
    }
  }

  console.log("────────────────────────────────────");
  console.log("📊 STATUS SUPABASE (AO VIVO)");
  console.log("────────────────────────────────────");
  console.log(` 🏢 Fabricantes:       ${fabCount ?? 0}`);
  console.log(` 🏷️  Marcas:            ${marcaCount ?? 0}`);
  console.log(` 🥩 Produtos:          ${prodCount ?? 0}`);
  console.log(` 📊 Códigos de Barras: ${codCount ?? 0}`);
  if (novosCount > 0) {
    console.log(` ✨ Novos Produtos:    ${novosCount} recém-incluídos nesta execução`);
  } else {
    console.log(` ✨ Novos Produtos:    0 recém-incluídos`);
  }
  if (atualizadosCount > 0) {
    console.log(` 🔄 Alterados/Atualiz.: ${atualizadosCount} produtos modificados`);
  }
  console.log("────────────────────────────────────");
}

verify().catch((err) => {
  console.error("❌ Erro ao consultar Supabase:", err.message);
  process.exit(1);
});
