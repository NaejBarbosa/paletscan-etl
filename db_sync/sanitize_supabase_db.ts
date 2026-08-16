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
      console.error('❌ Erro ao buscar produtos:', error.message);
      throw new Error(`Falha ao buscar produtos durante higienização: ${error.message}`);
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
      console.error('❌ Erro ao buscar códigos de barras:', error.message);
      throw new Error(`Falha ao buscar códigos de barras durante higienização: ${error.message}`);
    }
    if (!cods || cods.length === 0) break;
    allCodigos = allCodigos.concat(cods);
    if (cods.length < pageSize) break;
    from += pageSize;
  }
  console.log(`📊 Total de códigos de barras na base: ${allCodigos.length}`);

  // Indexar códigos numéricos válidos (EAN/DUN) por produto_id
  const productValidBarcodeSet = new Set<string>();
  const nonNumericBarcodeIds: string[] = [];

  for (const c of allCodigos) {
    const isNumeric = c.codigo && /^\d+$/.test(String(c.codigo).trim());
    if (isNumeric) {
      productValidBarcodeSet.add(c.produto_id);
    } else {
      nonNumericBarcodeIds.push(c.id);
    }
  }

  // Identificar produtos inválidos (sem ao menos 1 código de barras numérico EAN/DUN)
  const invalidProductIds: string[] = [];
  for (const p of allProdutos) {
    if (!productValidBarcodeSet.has(p.id)) {
      invalidProductIds.push(p.id);
    }
  }

  // Deletar códigos de barras não-numéricos (sujeiras textuais residuais)
  if (nonNumericBarcodeIds.length > 0) {
    console.log(`🧹 Removendo ${nonNumericBarcodeIds.length} códigos de barras não-numéricos...`);
    for (let i = 0; i < nonNumericBarcodeIds.length; i += 100) {
      const chunk = nonNumericBarcodeIds.slice(i, i + 100);
      await supabase.from('codigos_barras').delete().in('id', chunk);
    }
  }

  console.log(`\n🚨 Produtos sem nenhum código de barras numérico identificados para remoção: ${invalidProductIds.length}`);

  if (invalidProductIds.length === 0) {
    console.log('✅ A base já está 100% limpa e todos os produtos possuem EAN/DUN numérico!');
    return;
  }

  // 3. Remover códigos de barras de produtos inválidos
  console.log('🗑️  Removendo códigos de barras associados a produtos sem EAN/DUN...');
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
  // 5. Higienizar URLs de imagens (limpar placeholders e fallbacks quebrados)
  console.log('🖼️  Higienizando URLs de imagens no Supabase (removendo placeholders e links quebrados)...');
  let imgPage = 0;
  let totalImgsCleaned = 0;
  while (true) {
    const { data: imgProds, error: imgErr } = await supabase
      .from('produtos')
      .select('id, imagem_url')
      .range(imgPage * pageSize, (imgPage + 1) * pageSize - 1);
    if (imgErr || !imgProds || imgProds.length === 0) break;

    const badImgIds = imgProds
      .filter((p: any) => p.imagem_url && (
        p.imagem_url.includes('default-product-image') ||
        p.imagem_url.includes('placeholder') ||
        p.imagem_url.includes('blob.core.windows.net') ||
        p.imagem_url.includes('force.com') ||
        p.imagem_url.includes('salesforce.com')
      ))
      .map((p: any) => p.id);

    if (badImgIds.length > 0) {
      for (let i = 0; i < badImgIds.length; i += 50) {
        const batch = badImgIds.slice(i, i + 50);
        await supabase
          .from('produtos')
          .update({ imagem_url: null, status_imagem: 'sem_imagem' })
          .in('id', batch);
        totalImgsCleaned += batch.length;
      }
    }
    if (imgProds.length < pageSize) break;
    imgPage++;
  }
  if (totalImgsCleaned > 0) {
    console.log(`🧹 ${totalImgsCleaned} produtos com imagens placeholder foram redefinidos para sem_imagem.`);
  }

  console.log(`\n🎉 === HIGIENIZAÇÃO CONCLUÍDA ===`);
  console.log(`✅ ${totalDeleted} produtos sem EAN foram removidos do Supabase.`);
  console.log(`🥩 Sobraram ${allProdutos.length - totalDeleted} produtos 100% respaldados por EAN no banco de dados!`);
}

sanitizeDatabase().catch(console.error);

