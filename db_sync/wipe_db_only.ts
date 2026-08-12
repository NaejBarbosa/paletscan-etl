import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY não configuradas.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function wipeTable(tableName: string) {
  let totalDeleted = 0;
  
  // Tenta primeiro deletar via filtro genérico (neq id = 0000...)
  const { count, error: bulkErr } = await supabase
    .from(tableName)
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (!bulkErr && count !== null) {
    totalDeleted = count;
    console.log(`✅ Tabela '${tableName}' limpa em bloco! (${totalDeleted} registros removidos)`);
    return totalDeleted;
  }

  // Fallback em lotes pequenos (50 itens por requisição) se o bulk delete falhar
  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('id')
      .limit(50);

    if (error) {
      console.warn(`Aviso ao consultar ${tableName}:`, error.message);
      break;
    }

    if (!data || data.length === 0) break;

    const ids = data.map(r => r.id);
    const { error: delErr } = await supabase
      .from(tableName)
      .delete()
      .in('id', ids);

    if (delErr) {
      console.error(`Erro ao deletar lote em ${tableName}:`, delErr.message);
      throw delErr;
    }

    totalDeleted += ids.length;
    process.stdout.write(`  \r🗑️ ${tableName}: ${totalDeleted} registros deletados...`);

    if (data.length < 50) break;
  }
  console.log(`\n✅ Tabela '${tableName}' totalmente limpa! (${totalDeleted} registros removidos)`);
  return totalDeleted;
}

async function runWipeOnly() {
  console.log('💥 === INICIANDO LIMPEZA DAS BASES DE DADOS (SEM RE-SINCRONIZAÇÃO) ===\n');

  console.log('1️⃣ Deletando todos os registros de codigos_barras...');
  await wipeTable('codigos_barras');

  console.log('2️⃣ Deletando todos os registros de produtos...');
  await wipeTable('produtos');

  console.log('3️⃣ Deletando todas as marcas...');
  await wipeTable('marcas');

  console.log('4️⃣ Deletando todos os fabricantes...');
  await wipeTable('fabricantes');

  console.log('\n✨ Todas as bases de dados do Supabase foram 100% limpas com sucesso!');
}

runWipeOnly().catch(console.error);
