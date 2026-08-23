import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { classifyProduct } from '../core/heuristics/category_classifier';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function syncTaxonomy() {
  console.log('🚀 === INICIANDO SINCRONIZAÇÃO DA TAXONOMIA CANÔNICA NO PALETSCAN ===\n');

  // 1. Atualizar Arquivos de Staging
  const stagingDir = path.join(process.cwd(), 'staging');
  const stagingFiles = [
    'aurora_staging.json',
    'aurora_staging_uuid.json',
    'brf_staging.json',
    'brf_staging_uuid.json',
    'copacol_staging.json',
    'copacol_staging_uuid.json',
    'friboi_staging.json',
    'friboi_staging_uuid.json',
    'lar_staging.json',
    'lar_staging_uuid.json',
    'seara_staging.json',
    'seara_staging_uuid.json'
  ];

  console.log('📁 1. Atualizando arquivos de staging locais...');
  for (const file of stagingFiles) {
    const filePath = path.join(stagingDir, file);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(data.produtos)) {
        let updatedCount = 0;
        data.produtos.forEach((prod: any) => {
          const rawTitle = prod.descricao_original || prod.descricao_padronizada || '';
          const rawClasse = file.includes('seara') && prod.classe === 'Aves' ? '' : (file.includes('brf') && prod.classe === 'Outros' ? '' : prod.classe);
          const classification = classifyProduct(rawTitle, rawClasse, prod.conservacao);
          if (prod.classe !== classification.classe || prod.conservacao !== classification.conservacao) {
            prod.classe = classification.classe;
            prod.conservacao = classification.conservacao;
            updatedCount++;
          }
        });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`   ✅ [${file}]: ${data.produtos.length} produtos processados (${updatedCount} reclassificados).`);
      }
    }
  }

  // 2. Atualizar Produtos no Supabase
  console.log('\n🗄️  2. Consultando produtos na base do Supabase...');
  let page = 0;
  let allProducts: any[] = [];
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('produtos')
      .select('id, descricao_original, descricao_padronizada, classe, conservacao')
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (error) {
      console.error('Erro ao consultar tabela produtos:', error);
      break;
    }

    if (data && data.length > 0) {
      allProducts = allProducts.concat(data);
      page++;
      if (data.length < 1000) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  console.log(`   📦 Total de produtos no banco de dados: ${allProducts.length}`);

  const updatesToApply: { id: string; classe: string; conservacao: string; old_classe: string }[] = [];

  allProducts.forEach(p => {
    const title = p.descricao_original || p.descricao_padronizada || '';
    const rawClasse = (p.classe === 'Aves' && (title.toLowerCase().includes('seara') || title.toLowerCase().includes('nature') || title.toLowerCase().includes('veget') || title.toLowerCase().includes('legume') || title.toLowerCase().includes('margarina') || title.toLowerCase().includes('tilapia') || title.toLowerCase().includes('polaca') || title.toLowerCase().includes('bovino') || title.toLowerCase().includes('suino') || title.toLowerCase().includes('suíno')))
      ? ''
      : (p.classe === 'Outros' ? '' : p.classe);

    const classification = classifyProduct(title, rawClasse, p.conservacao);

    if (p.classe !== classification.classe || p.conservacao !== classification.conservacao) {
      updatesToApply.push({
        id: p.id,
        classe: classification.classe,
        conservacao: classification.conservacao,
        old_classe: p.classe
      });
    }
  });

  console.log(`   🔄 Total de produtos que necessitam de atualização de classe/conservação: ${updatesToApply.length}`);

  // Aplicar updates no Supabase em lotes de 100
  const batchSize = 100;
  for (let i = 0; i < updatesToApply.length; i += batchSize) {
    const batch = updatesToApply.slice(i, i + batchSize);
    process.stdout.write(`   ⏳ Atualizando Supabase: ${Math.min(i + batchSize, updatesToApply.length)}/${updatesToApply.length}...\r`);

    await Promise.all(
      batch.map(item =>
        supabase
          .from('produtos')
          .update({
            classe: item.classe,
            conservacao: item.conservacao
          })
          .eq('id', item.id)
      )
    );
  }
  console.log(`\n   ✅ ${updatesToApply.length} produtos atualizados no Supabase com sucesso!`);

  // 3. Auditoria Final da Base de Dados
  console.log('\n📊 3. Auditoria Final pós-atualização no Supabase...');
  page = 0;
  let finalProducts: any[] = [];
  hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from('vw_produtos_com_marcas')
      .select('*')
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (data && data.length > 0) {
      finalProducts = finalProducts.concat(data);
      page++;
      if (data.length < 1000) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  // Deduplicar produtos
  const finalMap = new Map<string, any>();
  finalProducts.forEach(p => finalMap.set(p.produto_id || p.id, p));
  const uniqueFinal = Array.from(finalMap.values());

  const finalDistribution: Record<string, number> = {};
  uniqueFinal.forEach(p => {
    const c = p.classe || '(SEM CLASSE)';
    finalDistribution[c] = (finalDistribution[c] || 0) + 1;
  });

  console.log('\n=== DISTRIBUIÇÃO CONSOLIDADA DAS CLASSES CANÔNICAS NO BANCO ===');
  Object.entries(finalDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cls, count]) => {
      console.log(`🏷️  [${cls}]: ${count} produtos (${((count / uniqueFinal.length) * 100).toFixed(2)}%)`);
    });

  // Salvar relatório consolidado
  fs.writeFileSync(
    path.join(stagingDir, 'nova_taxonomia_relatorio_final.json'),
    JSON.stringify({
      total_produtos: uniqueFinal.length,
      distribuicao_classes: finalDistribution,
      atualizacoes_executadas: updatesToApply.length
    }, null, 2),
    'utf-8'
  );

  console.log('\n🎉 === SINCRONIZAÇÃO E TAXONOMIA CANÔNICA CONCLUÍDA COM SUCESSO! ===');
}

syncTaxonomy().catch(console.error);
