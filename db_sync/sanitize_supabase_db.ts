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

export async function sanitizeDatabase() {
  console.log('🧹 === INICIANDO HIGIENIZAÇÃO DE PRODUTOS ÓRFÃOS E SEM EAN NO SUPABASE ===\n');

  // 1. Buscar todos os produtos
  let allProdutos: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data: prods, error } = await supabase
      .from('produtos')
      .select('id, descricao_original')
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('Erro ao buscar produtos:', error.message);
      break;
    }
    if (!prods || prods.length === 0) break;
    allProdutos = allProdutos.concat(prods);
    if (prods.length < pageSize) break;
    from += pageSize;
  }
  console.log(`🥩 Total de produtos na base: ${allProdutos.length}`);

  // 2. Buscar todos os códigos de barras
  let allCodigos: any[] = [];
  from = 0;
  while (true) {
    const { data: cods, error } = await supabase
      .from('codigos_barras')
      .select('id, produto_id, tipo, codigo')
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('Erro ao buscar códigos de barras:', error.message);
      break;
    }
    if (!cods || cods.length === 0) break;
    allCodigos = allCodigos.concat(cods);
    if (cods.length < pageSize) break;
    from += pageSize;
  }
  console.log(`📊 Total de códigos de barras na base: ${allCodigos.length}`);

  // Indexar EANs por produto_id
  const productEanSet = new Set<string>();
  for (const c of allCodigos) {
    const isEANType = c.tipo && c.tipo.toUpperCase().includes('EAN');
    const isEANNumeric = c.codigo && /^\d{8,13}$/.test(String(c.codigo).trim());
    if (isEANType && isEANNumeric) {
      productEanSet.add(c.produto_id);
    }
  }

  // Identificar produtos inválidos (sem ao menos 1 EAN numérico)
  const invalidProductIds: string[] = [];
  for (const p of allProdutos) {
    if (!productEanSet.has(p.id)) {
      invalidProductIds.push(p.id);
    }
  }

  console.log(`\n🚨 Produtos sem EAN numérico identificados para remoção: ${invalidProductIds.length}`);

  if (invalidProductIds.length === 0) {
    console.log('✅ A base já está 100% limpa e todos os produtos possuem EAN!');
    return;
  }

  // 3. Remover códigos de barras de produtos inválidos
  console.log('🗑️  Removendo códigos de barras associados a produtos sem EAN...');
  for (let i = 0; i < invalidProductIds.length; i += 50) {
    const batch = invalidProductIds.slice(i, i + 50);
    const { error: errDelCod } = await supabase
      .from('codigos_barras')
      .delete()
      .in('produto_id', batch);
    if (errDelCod) {
      console.error('Erro ao deletar códigos:', errDelCod.message);
    }
  }

  // 4. Remover produtos da tabela produtos
  console.log('🗑️  Removendo produtos sem EAN da tabela produtos...');
  let totalDeleted = 0;
  for (let i = 0; i < invalidProductIds.length; i += 50) {
    const batch = invalidProductIds.slice(i, i + 50);
    const { error: errDelProd } = await supabase
      .from('produtos')
      .delete()
      .in('id', batch);
    if (errDelProd) {
      console.error('Erro ao deletar produtos:', errDelProd.message);
    } else {
      totalDeleted += batch.length;
    }
  }

  console.log(`\n🎉 === HIGIENIZAÇÃO CONCLUÍDA ===`);
  console.log(`✅ ${totalDeleted} produtos sem EAN foram removidos do Supabase.`);
  console.log(`🥩 Sobraram ${allProdutos.length - totalDeleted} produtos 100% respaldados por EAN no banco de dados!`);
}

sanitizeDatabase().catch(console.error);
