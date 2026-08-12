import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function updateSupabaseLocalImageUrls() {
  console.log('🔄 === INICIANDO PADRONIZAÇÃO COMPLETA DE URLs DE IMAGEM NO SUPABASE ===\n');

  const publicImgDir = '/root/repo_pwa/public/imagens_produtos';
  const auroraPreparedDir = '/root/projetos-scraping/scraping-aurora/imagens_preparadas';

  // 1. Carregar TODOS os EANs da tabela codigos_barras sem filtro restritivo de tipo
  let from = 0;
  const pageSize = 1000;
  const prodEanMap = new Map<string, string>();

  while (true) {
    const { data: cods, error } = await supabase
      .from('codigos_barras')
      .select('produto_id, codigo, tipo')
      .range(from, from + pageSize - 1);

    if (error || !cods || cods.length === 0) break;
    cods.forEach(c => {
      const clean = String(c.codigo || '').trim();
      if (clean && /^\d+$/.test(clean)) {
        // Se ainda não tiver EAN mapeado ou se for EAN-13 (13 dígitos), prioriza
        if (!prodEanMap.has(c.produto_id) || clean.length === 13) {
          prodEanMap.set(c.produto_id, clean);
        }
      }
    });
    if (cods.length < pageSize) break;
    from += pageSize;
  }

  console.log(`[+] Mapeados ${prodEanMap.size} produtos com código numérico EAN.`);

  // 2. Buscar todos os produtos do Supabase
  from = 0;
  let allProds: any[] = [];

  while (true) {
    const { data: prods, error } = await supabase
      .from('produtos')
      .select('id, descricao_padronizada, imagem_url, status_imagem')
      .range(from, from + pageSize - 1);

    if (error || !prods || prods.length === 0) break;
    allProds = allProds.concat(prods);
    if (prods.length < pageSize) break;
    from += pageSize;
  }

  const updates: { id: string; targetUrl: string }[] = [];

  for (const p of allProds) {
    const ean = prodEanMap.get(p.id);
    if (!ean) continue;

    const fileWebp = `${ean}.webp`;
    const localPathPublic = path.join(publicImgDir, fileWebp);
    const localPathAurora = path.join(auroraPreparedDir, fileWebp);

    if (fs.existsSync(localPathPublic) || fs.existsSync(localPathAurora)) {
      // Se estiver na pasta preparada da Aurora e não na pública, copia
      if (!fs.existsSync(localPathPublic) && fs.existsSync(localPathAurora)) {
        fs.copyFileSync(localPathAurora, localPathPublic);
      }

      const targetUrl = `/imagens_produtos/${fileWebp}`;
      const currentUrl = (p.imagem_url || '').trim();

      if (currentUrl !== targetUrl) {
        updates.push({ id: p.id, targetUrl });
      }
    }
  }

  console.log(`[+] Identificados ${updates.length} produtos para atualização para WebP local (/imagens_produtos/<EAN>.webp).`);

  // Executar atualizações em lotes paralelos de 50
  let updatedCount = 0;
  const chunkSize = 50;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async item => {
      const { error } = await supabase
        .from('produtos')
        .update({
          imagem_url: item.targetUrl,
          status_imagem: 'VALIDATED'
        })
        .eq('id', item.id);
      if (!error) updatedCount++;
    }));
  }

  console.log('\n==================================================');
  console.log('✅ PADRONIZAÇÃO NO SUPABASE CONCLUÍDA COM SUCESSO!');
  console.log(`📊 Produtos atualizados com imagem local WebP (/imagens_produtos/<EAN>.webp): ${updatedCount}`);
  console.log('==================================================\n');
}

updateSupabaseLocalImageUrls();
