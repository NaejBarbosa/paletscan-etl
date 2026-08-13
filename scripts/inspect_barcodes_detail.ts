import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectDetail() {
  const { count: prodCount } = await supabase.from('produtos').select('id', { count: 'exact', head: true });
  console.log('1. Total produtos em Supabase (produtos.id únicos):', prodCount);

  let page = 0;
  let allCbs: any[] = [];
  let hasMore = true;
  while (hasMore) {
    const { data } = await supabase.from('codigos_barras').select('id, produto_id, codigo, tipo').range(page * 1000, (page + 1) * 1000 - 1);
    if (data && data.length > 0) {
      allCbs = allCbs.concat(data);
      page++;
      if (data.length < 1000) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  console.log('2. Total registros em codigos_barras:', allCbs.length);

  const eanMap = new Map<string, string>();
  const dunMap = new Map<string, string>();
  const allCodesMap = new Map<string, string>();

  allCbs.forEach(c => {
    const clean = String(c.codigo || '').trim();
    if (!clean || !/^\d+$/.test(clean)) return;

    allCodesMap.set(c.produto_id, clean);
    const tipoUpper = (c.tipo || '').toUpperCase();
    if (tipoUpper.includes('DUN')) {
      dunMap.set(c.produto_id, clean);
    } else {
      eanMap.set(c.produto_id, clean);
    }
  });

  console.log('3. Produtos com ao menos 1 EAN:', eanMap.size);
  console.log('4. Produtos com ao menos 1 DUN:', dunMap.size);
  console.log('5. Produtos com ao menos 1 EAN ou DUN:', allCodesMap.size);

  let pPage = 0;
  let allProds: any[] = [];
  pPage = 0;
  hasMore = true;
  while (hasMore) {
    const { data } = await supabase.from('produtos').select('id').range(pPage * 1000, (pPage + 1) * 1000 - 1);
    if (data && data.length > 0) {
      allProds = allProds.concat(data);
      pPage++;
      if (data.length < 1000) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  const prodsWithoutAnyBarcode = allProds.filter(p => !allCodesMap.has(p.id));
  console.log('6. Produtos na tabela `produtos` SEM nenhum EAN ou DUN em `codigos_barras`:', prodsWithoutAnyBarcode.length);
}

inspectDetail();
