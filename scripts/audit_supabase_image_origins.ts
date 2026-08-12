import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, serviceKey);

async function auditSupabaseImageOrigins() {
  let from = 0;
  const pageSize = 1000;
  let allProds: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from('produtos')
      .select('id, descricao_padronizada, imagem_url, status_imagem')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Erro na consulta Supabase:', error.message);
      break;
    }

    if (!data || data.length === 0) break;
    allProds = allProds.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  let countThirdPartyWeb = 0;
  let countSupabaseStorage = 0;
  let countRelativeWebp = 0;
  let countFilenameWebp = 0;
  let countNullOrEmpty = 0;

  const thirdPartyDomains: Record<string, number> = {};

  allProds.forEach(p => {
    const url = (p.imagem_url || '').trim();
    if (!url) {
      countNullOrEmpty++;
      return;
    }

    if (url.includes('supabase.co/storage') || url.includes('supabase.in/storage')) {
      countSupabaseStorage++;
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      countThirdPartyWeb++;
      try {
        const domain = new URL(url).hostname;
        thirdPartyDomains[domain] = (thirdPartyDomains[domain] || 0) + 1;
      } catch {}
    } else if (url.startsWith('/')) {
      countRelativeWebp++;
    } else {
      countFilenameWebp++;
    }
  });

  console.log('=== AUDITORIA DE ORIGEM DAS IMAGENS NO SUPABASE (BANCO MESTRE) ===');
  console.log('Total de produtos no banco Supabase:', allProds.length);
  console.log('1. URLs no Supabase Storage (supabase.co):', countSupabaseStorage);
  console.log('2. URLs de Sites de Terceiros (Aurora, Friboi, Seara, Perdigão, Sadia, Lar):', countThirdPartyWeb);
  console.log('3. Caminhos Relativos WebP (/imagens_produtos/<EAN>.webp):', countRelativeWebp);
  console.log('4. Apenas Nome do Arquivo WebP (<EAN>.webp):', countFilenameWebp);
  console.log('5. Sem URL (null/vazio):', countNullOrEmpty);

  if (Object.keys(thirdPartyDomains).length > 0) {
    console.log('\nDomínios de Terceiros Encontrados no Banco Supabase:');
    Object.keys(thirdPartyDomains).forEach(dom => {
      console.log(` * ${dom}: ${thirdPartyDomains[dom]} produtos`);
    });
  }
}

auditSupabaseImageOrigins();
