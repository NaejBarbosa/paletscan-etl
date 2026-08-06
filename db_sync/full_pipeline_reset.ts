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

async function runFullPipelineReset() {
  console.log('💥 === INICIANDO LIMPEZA TOTAL DA BASE SUPABASE E RE-EXECUÇÃO DO PIPELINE ===\n');

  // 1. Deletar todos os registros de codigos_barras
  console.log('🗑️ 1/4. Deletando todos os registros de codigos_barras...');
  const { error: errCod } = await supabase.from('codigos_barras').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errCod) console.warn('Aviso ao limpar codigos_barras:', errCod.message);

  // 2. Deletar todos os produtos
  console.log('🗑️ 2/4. Deletando todos os registros de produtos...');
  const { error: errProd } = await supabase.from('produtos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errProd) console.warn('Aviso ao limpar produtos:', errProd.message);

  // 3. Deletar todas as marcas
  console.log('🗑️ 3/4. Deletando todas as marcas...');
  const { error: errMarca } = await supabase.from('marcas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errMarca) console.warn('Aviso ao limpar marcas:', errMarca.message);

  // 4. Deletar todos os fabricantes
  console.log('🗑️ 4/4. Deletando todos os fabricantes...');
  const { error: errFab } = await supabase.from('fabricantes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errFab) console.warn('Aviso ao limpar fabricantes:', errFab.message);

  console.log('\n✨ Base do Supabase completamente zerada!');
  console.log('🚀 Iniciando pipeline de re-sincronização relacional estrita (UUIDv5)...\n');

  // Re-sincronizar todos os staging files
  await syncStagingToSupabase();

  console.log('\n🎉 Pipeline completo finalizado com sucesso!');
}

runFullPipelineReset().catch(console.error);
