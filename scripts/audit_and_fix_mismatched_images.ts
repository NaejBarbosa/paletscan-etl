import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function auditAndFix() {
  console.log('🔍 === AUDITORIA DE IMAGENS LOCAIS INCOMPATÍVEIS / LEGADAS ===\n');

  // Buscar todos os produtos do Supabase com status sem_imagem ou imagem_url nula
  let allNoImageProds: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('vw_produtos_com_marcas')
      .select('*')
      .or('status_imagem.eq.sem_imagem,status_imagem.is.null,imagem_url.is.null')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('❌ Erro ao consultar Supabase:', error.message);
      process.exit(1);
    }

    if (data && data.length > 0) {
      allNoImageProds = allNoImageProds.concat(data);
      page++;
      if (data.length < pageSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  console.log(`📊 Produtos sem imagem aprovada no Supabase: ${allNoImageProds.length}`);

  const publicDirs = [
    '/root/repo_pwa/public/imagens_produtos',
    '/root/meus-repos/PaletScan/public/imagens_produtos'
  ];

  let removedCount = 0;
  allNoImageProds.forEach(row => {
    const candidateEan = String(row.ean || row.produto_ean || row.codigo || '');
    const eanVal = /^\d+$/.test(candidateEan.trim()) ? candidateEan.trim() : '';
    if (!eanVal) return;

    const imgFileName = `${eanVal}.webp`;

    publicDirs.forEach(dir => {
      const filePath = path.join(dir, imgFileName);
      if (fs.existsSync(filePath)) {
        console.log(`🗑️ Removendo imagem legada incompatível: ${filePath} (${row.descricao_padronizada || row.descricao_original})`);
        try {
          fs.unlinkSync(filePath);
          removedCount++;
        } catch (e: any) {
          console.warn(`Aviso ao remover ${filePath}:`, e.message);
        }
      }
    });
  });

  console.log(`\n✅ Total de imagens legadas incompatíveis removidas dos repositórios: ${removedCount}`);
}

auditAndFix().catch(console.error);
