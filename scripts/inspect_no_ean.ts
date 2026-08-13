import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectNoEan() {
  let allView: any[] = [];
  let page = 0;
  let hasMore = true;
  while (hasMore) {
    const { data } = await supabase.from('vw_produtos_com_marcas').select('*').range(page * 1000, (page + 1) * 1000 - 1);
    if (data && data.length > 0) {
      allView = allView.concat(data);
      page++;
      if (data.length < 1000) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  let allCbs: any[] = [];
  page = 0;
  hasMore = true;
  while (hasMore) {
    const { data } = await supabase.from('codigos_barras').select('produto_id, codigo, tipo').range(page * 1000, (page + 1) * 1000 - 1);
    if (data && data.length > 0) {
      allCbs = allCbs.concat(data);
      page++;
      if (data.length < 1000) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  const validEanProdIds = new Set(allCbs.filter(c => c.codigo && /^\d+$/.test(String(c.codigo).trim())).map(c => c.produto_id));

  const noEanProducts = allView.filter(r => !validEanProdIds.has(r.produto_id || r.id));
  console.log('Total products in database without valid EAN in codigos_barras:', noEanProducts.length);

  const byBrand: Record<string, number> = {};
  noEanProducts.forEach(r => {
    const brand = r.marca_nome || r.marca || 'N/D';
    byBrand[brand] = (byBrand[brand] || 0) + 1;
  });

  console.log('Products without EAN by Brand:', byBrand);
  if (noEanProducts.length > 0) {
    console.log('Sample 10 products without EAN:', noEanProducts.slice(0, 10).map(r => ({ id: r.id || r.produto_id, title: r.descricao_padronizada || r.descricao_original, brand: r.marca_nome })));
  }
}

inspectNoEan();
