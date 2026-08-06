import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { syncStagingToSupabase } from './sync';

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
  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('id')
      .limit(100);

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
      console.warn(`Aviso ao deletar lote em ${tableName}:`, delErr.message);
      break;
    }

    totalDeleted += ids.length;
    process.stdout.write(`  \r🗑️ ${tableName}: ${totalDeleted} registros deletados...`);

    if (data.length < 100) break;
  }
  console.log('');
  return totalDeleted;
}

async function runFullPipelineReset() {
  console.log('💥 === INICIANDO LIMPEZA TOTAL E COMPLETA DE TODAS AS BASES ===\n');

  console.log('1️⃣ Deletando todos os registros de codigos_barras...');
  await wipeTable('codigos_barras');

  console.log('2️⃣ Deletando todos os registros de produtos...');
  await wipeTable('produtos');

  console.log('3️⃣ Deletando todas as marcas...');
  await wipeTable('marcas');

  console.log('4️⃣ Deletando todos os fabricantes...');
  await wipeTable('fabricantes');

  console.log('\n✨ Todas as bases do Supabase foram 100% zeradas!');
  console.log('🚀 Iniciando pipeline de re-sincronização relacional estrita (UUIDv5)...\n');

  // Re-sincronizar todos os staging files
  await syncStagingToSupabase();

  console.log('\n🎉 Pipeline completo e higienização finalizados com sucesso!');
}

runFullPipelineReset().catch(console.error);
