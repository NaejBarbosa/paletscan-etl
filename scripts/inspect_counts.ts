import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspect() {
  const { count: prodCount } = await supabase.from('produtos').select('id', { count: 'exact', head: true });
  const { count: cbCount } = await supabase.from('codigos_barras').select('id', { count: 'exact', head: true });
  const { count: viewCount } = await supabase.from('vw_produtos_com_marcas').select('*', { count: 'exact', head: true });

  console.log('--- SUPABASE EXACT COUNTS ---');
  console.log('Tabela produtos (IDs únicos de produtos):', prodCount);
  console.log('Tabela codigos_barras (Variações EAN/DUN):', cbCount);
  console.log('View vw_produtos_com_marcas:', viewCount);

  let page = 0;
  let allViewData: any[] = [];
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase.from('vw_produtos_com_marcas').select('*').range(page * 1000, (page + 1) * 1000 - 1);
    if (error) {
      console.error(error);
      break;
    }
    if (data && data.length > 0) {
      allViewData = allViewData.concat(data);
      page++;
      if (data.length < 1000) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  console.log('Total registros na View:', allViewData.length);

  const uniqueProdIds = new Set(allViewData.map(r => r.produto_id || r.id));
  console.log('IDs únicos de PRODUTOS na View:', uniqueProdIds.size);

  const validEanProdIds = new Set<string>();
  const validEanSet = new Set<string>();

  allViewData.forEach(r => {
    const eanClean = String(r.ean || r.produto_ean || r.codigo || '').trim();
    if (eanClean && /^\d+$/.test(eanClean)) {
      validEanSet.add(eanClean);
      validEanProdIds.add(r.produto_id || r.id);
    }
  });

  console.log('EANs válidos numéricos únicos na View:', validEanSet.size);
  console.log('IDs únicos de PRODUTOS com ao menos 1 EAN válido:', validEanProdIds.size);
}

inspect();
