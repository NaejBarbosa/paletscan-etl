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

  console.log("────────────────────────────────────");
  console.log("📊 STATUS SUPABASE (AO VIVO)");
  console.log("────────────────────────────────────");
  console.log(` 🏢 Fabricantes:       ${fabCount ?? 0}`);
  console.log(` 🏷️  Marcas:            ${marcaCount ?? 0}`);
  console.log(` 🥩 Produtos:          ${prodCount ?? 0}`);
  console.log(` 📊 Códigos de Barras: ${codCount ?? 0}`);
  console.log("────────────────────────────────────");
}

verify().catch((err) => {
  console.error("❌ Erro ao consultar Supabase:", err.message);
  process.exit(1);
});
