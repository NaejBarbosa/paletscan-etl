/**
 * Heurística de Classificação de Marcas - PaletScan ETL
 * Mapeia marcas brutas do catálogo para marcas normalizadas e vinculadas à holding Friboi (JBS) ou fabricantes parceiros.
 */

export interface BrandInfo {
  id: string;
  nome: string;
  slug: string;
  fabricante_id: string;
}

export const FABRICANTE_FRIBOI_ID = 'fab_friboi_jbs';
export const FABRICANTE_FRIBOI_NOME = 'Friboi / JBS S.A.';

// Dicionário de Marcas Conhecidas vinculadas à holding Friboi / JBS
export const FRIBOI_BRANDS: Record<string, { nome: string; slug: string }> = {
  'friboi': { nome: 'Friboi', slug: 'friboi' },
  'friboi black': { nome: 'Friboi Black', slug: 'friboi-black' },
  'black friboi': { nome: 'Friboi Black', slug: 'friboi-black' },
  'maturatta': { nome: 'Maturatta', slug: 'maturatta' },
  'do chef': { nome: 'Do Chef', slug: 'do-chef' },
  'do chef - friboi': { nome: 'Do Chef', slug: 'do-chef' },
  '1953': { nome: '1953 Friboi', slug: '1953-friboi' },
  '1953 friboi': { nome: '1953 Friboi', slug: '1953-friboi' },
  'swift': { nome: 'Swift', slug: 'swift' },
  'reserva friboi': { nome: 'Reserva Friboi', slug: 'reserva-friboi' },
  'bordon': { nome: 'Bordon', slug: 'bordon' },
  'anglo': { nome: 'Anglo', slug: 'anglo' },
  'bertin': { nome: 'Bertin', slug: 'bertin' },
  'seara': { nome: 'Seara', slug: 'seara' },
  'seara gourmet': { nome: 'Seara Gourmet', slug: 'seara-gourmet' },
};

/**
 * Normaliza e classifica a marca a partir do campo bruto do catálogo ou título do produto.
 */
export function classifyBrand(rawBrand: string, productTitle: string): BrandInfo {
  const brandLower = (rawBrand || '').toLowerCase().trim();
  const titleLower = (productTitle || '').toLowerCase().trim();

  // Verifica marca informada no campo da API
  if (brandLower && FRIBOI_BRANDS[brandLower]) {
    const brandData = FRIBOI_BRANDS[brandLower];
    return {
      id: `marca_${brandData.slug}`,
      nome: brandData.nome,
      slug: brandData.slug,
      fabricante_id: FABRICANTE_FRIBOI_ID
    };
  }

  // Tenta identificar marcas secundárias ou sub-marcas através do título do produto
  if (titleLower.includes('maturatta')) {
    return { id: 'marca_maturatta', nome: 'Maturatta', slug: 'maturatta', fabricante_id: FABRICANTE_FRIBOI_ID };
  }
  if (titleLower.includes('black') || titleLower.includes('friboi black')) {
    return { id: 'marca_friboi-black', nome: 'Friboi Black', slug: 'friboi-black', fabricante_id: FABRICANTE_FRIBOI_ID };
  }
  if (titleLower.includes('1953')) {
    return { id: 'marca_1953-friboi', nome: '1953 Friboi', slug: '1953-friboi', fabricante_id: FABRICANTE_FRIBOI_ID };
  }
  if (titleLower.includes('do chef') || titleLower.includes('dochef')) {
    return { id: 'marca_do-chef', nome: 'Do Chef', slug: 'do-chef', fabricante_id: FABRICANTE_FRIBOI_ID };
  }

  // Marca padrão Friboi
  const fallbackSlug = rawBrand ? rawBrand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'friboi';
  const fallbackNome = rawBrand ? rawBrand : 'Friboi';

  return {
    id: `marca_${fallbackSlug}`,
    nome: fallbackNome,
    slug: fallbackSlug,
    fabricante_id: FABRICANTE_FRIBOI_ID
  };
}
