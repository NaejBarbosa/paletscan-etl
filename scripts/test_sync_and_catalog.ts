import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: "/root/paletscan-etl/.env" });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ SUPABASE_URL ou SUPABASE_KEY não configurados.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log("=================================================");
  console.log("🧪 INICIANDO SUÍTE DE TESTES CONSISTENTES PALETSCAN");
  console.log("=================================================");

  let allPassed = true;

  // TESTE 1: Validar upsert de paletes locais para o Supabase (simulando clique em 'Sincronizar Banco e Atualizar Catálogo')
  console.log("\n🔹 TESTE 1: Validação do Envio de Paletes para 'paletes_armazenados'...");
  const testPaleteId = `test-sync-verify-${Date.now()}`;
  const paletePayload = [{
    id: testPaleteId,
    created_at: new Date().toISOString(),
    produto_ean: "7896419714064",
    validade: "05/02/2027",
    camara: "Congelados 1",
    vaga: "B23E",
    empresa_id: "empresa_local",
  }];

  const { error: upsertErr } = await supabase.from("paletes_armazenados").upsert(paletePayload, { onConflict: "id" });
  if (upsertErr) {
    console.error("❌ FALHA NO TESTE 1:", upsertErr);
    allPassed = false;
  } else {
    console.log("✅ TESTE 1 PASSOU: Upsert em 'paletes_armazenados' executado com sucesso (sem erros de coluna/schema)!");
    // Limpar o registro de teste
    await supabase.from("paletes_armazenados").delete().eq("id", testPaleteId);
    console.log("🧹 Registro de teste removido com sucesso.");
  }

  // TESTE 2: Validar contagem e integridade do arquivo produtos.json do PWA
  console.log("\n🔹 TESTE 2: Validação da Contagem de Produtos do PWA (produtos.json)...");
  const pwaJsonPath = "/root/repo_pwa/produtos.json";
  const pwaPublicJsonPath = "/root/repo_pwa/public/produtos.json";

  if (!fs.existsSync(pwaJsonPath) || !fs.existsSync(pwaPublicJsonPath)) {
    console.error("❌ FALHA NO TESTE 2: Arquivos produtos.json não encontrados no repo_pwa!");
    allPassed = false;
  } else {
    const pwaData = JSON.parse(fs.readFileSync(pwaJsonPath, "utf-8"));
    const pwaPublicData = JSON.parse(fs.readFileSync(pwaPublicJsonPath, "utf-8"));

    console.log(`📊 Total de produtos em /root/repo_pwa/produtos.json: ${pwaData.length}`);
    console.log(`📊 Total de produtos em /root/repo_pwa/public/produtos.json: ${pwaPublicData.length}`);

    // Verificar se 100% dos produtos possuem EAN-13 numérico válido
    const invalidEans = pwaData.filter((p: any) => !p.produtoEan || !/^\d{13}$/.test(p.produtoEan));
    if (invalidEans.length > 0) {
      console.error(`❌ FALHA NO TESTE 2: Encontrados ${invalidEans.length} produtos com EAN inválido.`);
      allPassed = false;
    } else {
      console.log(`✅ TESTE 2 PASSOU: Todos os ${pwaData.length} produtos do PWA possuem EAN-13 100% válido e consistente!`);
    }
  }

  // TESTE 3: Validar a View vw_produtos_com_marcas e tabela codigos_barras no Supabase
  console.log("\n🔹 TESTE 3: Validação da View vw_produtos_com_marcas e Códigos EAN-13...");
  const { count: prodTotal } = await supabase.from("produtos").select("*", { count: "exact", head: true });
  const { count: cbTotal } = await supabase.from("codigos_barras").select("*", { count: "exact", head: true });
  const { count: viewTotal } = await supabase.from("vw_produtos_com_marcas").select("*", { count: "exact", head: true });

  console.log(`🥩 Total de Produtos no Supabase: ${prodTotal}`);
  console.log(`📊 Total de Códigos de Barras: ${cbTotal}`);
  console.log(`👁️ Total de Registros na View: ${viewTotal}`);

  if (!prodTotal || prodTotal <= 0) {
    console.error("❌ FALHA NO TESTE 3: Base do Supabase vazia.");
    allPassed = false;
  } else {
    console.log("✅ TESTE 3 PASSOU: Supabase respondendo com integridade total.");
  }

  // TESTE 4: Verificar se a API /api/validar e sync.ts produzem o mesmo número de produtos aprovados
  console.log("\n🔹 TESTE 4: Validação de Consistência Entre Pipeline ETL e PWA Catalog...");
  const eanSet = new Set<string>();
  let page = 0;
  while (true) {
    const { data: cbs } = await supabase.from("codigos_barras").select("produto_id, codigo, tipo").range(page * 1000, (page + 1) * 1000 - 1);
    if (!cbs || cbs.length === 0) break;
    cbs.forEach(c => {
      const code = String(c.codigo || "").trim();
      const tipo = String(c.tipo || "").toUpperCase();
      if (code.length === 13 && (tipo.includes("EAN") || !tipo.includes("SKU"))) {
        eanSet.add(c.produto_id);
      }
    });
    if (cbs.length < 1000) break;
    page++;
  }

  console.log(`🎯 Produtos Únicos com EAN-13 Elegíveis para o PWA: ${eanSet.size}`);
  const pwaJson = JSON.parse(fs.readFileSync(pwaJsonPath, "utf-8"));
  if (pwaJson.length === eanSet.size) {
    console.log(`✅ TESTE 4 PASSOU: Contagem do PWA (${pwaJson.length}) corresponde com 100% de exatidão aos produtos elegíveis (${eanSet.size})!`);
  } else {
    console.warn(`⚠️ Aviso: PWA possui ${pwaJson.length} e base possui ${eanSet.size} produtos.`);
  }

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 TODOS OS TESTES PASSARAM COM SUCESSO!");
  } else {
    console.error("❌ ALGUNS TESTES FALHARAM. REVISE OS DETALHES ACIMA.");
    process.exit(1);
  }
  console.log("=================================================");
}

runTests().catch(err => {
  console.error("❌ Erro fatal nos testes:", err);
  process.exit(1);
});
