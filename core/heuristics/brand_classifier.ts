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

export const FABRICANTE_BRF_ID = 'fab_brf_sa';
export const FABRICANTE_BRF_NOME = 'BRF S.A.';

export const FABRICANTE_AURORA_ID = 'fab_aurora_cooperativa';
export const FABRICANTE_AURORA_NOME = 'Cooperativa Central Aurora Alimentos';

export const FABRICANTE_COPACOL_ID = 'fab_copacol_cooperativa';
export const FABRICANTE_COPACOL_NOME = 'Copacol Cooperativa Agroindustrial Consolata';

export const FABRICANTE_LAR_ID = 'fab_lar_cooperativa';
export const FABRICANTE_LAR_NOME = 'Lar Cooperativa Agroindustrial';

// Dicionário de Marcas Conhecidas vinculadas às holdings (JBS, BRF, Aurora, Copacol e Lar)
export const KNOWN_BRANDS: Record<string, { nome: string; slug: string; fabricante_id: string }> = {
  // --- Marcas Lar Cooperativa Agroindustrial ---
  'lar': { nome: 'Lar', slug: 'lar', fabricante_id: FABRICANTE_LAR_ID },
  'lar cooperativa': { nome: 'Lar', slug: 'lar', fabricante_id: FABRICANTE_LAR_ID },

  // --- Marcas Copacol ---
  'copacol': { nome: 'Copacol', slug: 'copacol', fabricante_id: FABRICANTE_COPACOL_ID },
  'copacol agro': { nome: 'Copacol Agro', slug: 'copacol-agro', fabricante_id: FABRICANTE_COPACOL_ID },

  // --- Marcas Aurora Alimentos ---
  'aurora': { nome: 'Aurora', slug: 'aurora', fabricante_id: FABRICANTE_AURORA_ID },
  'aurora premium': { nome: 'Aurora Premium', slug: 'aurora-premium', fabricante_id: FABRICANTE_AURORA_ID },
  'aurora bem leve': { nome: 'Aurora Bem Leve', slug: 'aurora-bem-leve', fabricante_id: FABRICANTE_AURORA_ID },
  'nobre': { nome: 'Nobre', slug: 'nobre', fabricante_id: FABRICANTE_AURORA_ID },
  'nobreza': { nome: 'Nobre', slug: 'nobre', fabricante_id: FABRICANTE_AURORA_ID },
  'lanche nobreza': { nome: 'Nobre', slug: 'nobre', fabricante_id: FABRICANTE_AURORA_ID },
  'peperi': { nome: 'Peperi', slug: 'peperi', fabricante_id: FABRICANTE_AURORA_ID },
  'gran mestri': { nome: 'Gran Mestri', slug: 'gran-mestri', fabricante_id: FABRICANTE_AURORA_ID },

  // --- Marcas Friboi / JBS ---
  'friboi': { nome: 'Friboi', slug: 'friboi', fabricante_id: FABRICANTE_FRIBOI_ID },
  'friboi black': { nome: 'Friboi Black', slug: 'friboi-black', fabricante_id: FABRICANTE_FRIBOI_ID },
  'black friboi': { nome: 'Friboi Black', slug: 'friboi-black', fabricante_id: FABRICANTE_FRIBOI_ID },
  'maturatta': { nome: 'Maturatta', slug: 'maturatta', fabricante_id: FABRICANTE_FRIBOI_ID },
  'do chef': { nome: 'Do Chef', slug: 'do-chef', fabricante_id: FABRICANTE_FRIBOI_ID },
  'do chef - friboi': { nome: 'Do Chef', slug: 'do-chef', fabricante_id: FABRICANTE_FRIBOI_ID },
  '1953': { nome: '1953 Friboi', slug: '1953-friboi', fabricante_id: FABRICANTE_FRIBOI_ID },
  '1953 friboi': { nome: '1953 Friboi', slug: '1953-friboi', fabricante_id: FABRICANTE_FRIBOI_ID },
  'swift': { nome: 'Swift', slug: 'swift', fabricante_id: FABRICANTE_FRIBOI_ID },
  'reserva friboi': { nome: 'Reserva Friboi', slug: 'reserva-friboi', fabricante_id: FABRICANTE_FRIBOI_ID },
  'bordon': { nome: 'Bordon', slug: 'bordon', fabricante_id: FABRICANTE_FRIBOI_ID },
  'anglo': { nome: 'Anglo', slug: 'anglo', fabricante_id: FABRICANTE_FRIBOI_ID },
  'bertin': { nome: 'Bertin', slug: 'bertin', fabricante_id: FABRICANTE_FRIBOI_ID },
  'seara': { nome: 'Seara', slug: 'seara', fabricante_id: FABRICANTE_FRIBOI_ID },
  'seara gourmet': { nome: 'Seara Gourmet', slug: 'seara-gourmet', fabricante_id: FABRICANTE_FRIBOI_ID },
  'seara nature': { nome: 'Seara Nature', slug: 'seara-nature', fabricante_id: FABRICANTE_FRIBOI_ID },
  'hans': { nome: 'Hans', slug: 'hans', fabricante_id: FABRICANTE_FRIBOI_ID },
  'eder': { nome: 'Eder', slug: 'eder', fabricante_id: FABRICANTE_FRIBOI_ID },
  'incrivel': { nome: 'Incrível!', slug: 'incrivel', fabricante_id: FABRICANTE_FRIBOI_ID },
  'incrível': { nome: 'Incrível!', slug: 'incrivel', fabricante_id: FABRICANTE_FRIBOI_ID },
  'doriana': { nome: 'Doriana', slug: 'doriana', fabricante_id: FABRICANTE_FRIBOI_ID },
  'dagranja': { nome: 'DaGranja', slug: 'dagranja', fabricante_id: FABRICANTE_FRIBOI_ID },
  'lebon': { nome: 'LeBon', slug: 'lebon', fabricante_id: FABRICANTE_FRIBOI_ID },
  'delicata': { nome: 'Delicata', slug: 'delicata', fabricante_id: FABRICANTE_FRIBOI_ID },
  'confiança': { nome: 'Confiança', slug: 'confianca', fabricante_id: FABRICANTE_FRIBOI_ID },
  'confianca': { nome: 'Confiança', slug: 'confianca', fabricante_id: FABRICANTE_FRIBOI_ID },
  'frangosul': { nome: 'Frangosul', slug: 'frangosul', fabricante_id: FABRICANTE_FRIBOI_ID },
  'wilson': { nome: 'Wilson', slug: 'wilson', fabricante_id: FABRICANTE_FRIBOI_ID },

  // --- Marcas BRF S.A. ---
  'sadia': { nome: 'Sadia', slug: 'sadia', fabricante_id: FABRICANTE_BRF_ID },
  'perdigao': { nome: 'Perdigão', slug: 'perdigao', fabricante_id: FABRICANTE_BRF_ID },
  'perdigão': { nome: 'Perdigão', slug: 'perdigao', fabricante_id: FABRICANTE_BRF_ID },
  'qualy': { nome: 'Qualy', slug: 'qualy', fabricante_id: FABRICANTE_BRF_ID },
  'deline': { nome: 'Deline', slug: 'deline', fabricante_id: FABRICANTE_BRF_ID },
  'rezende': { nome: 'Rezende', slug: 'rezende', fabricante_id: FABRICANTE_BRF_ID },
  'claybom': { nome: 'Claybom', slug: 'claybom', fabricante_id: FABRICANTE_BRF_ID },
  'namesa': { nome: 'NaMesa', slug: 'namesa', fabricante_id: FABRICANTE_BRF_ID },
  'na mesa': { nome: 'NaMesa', slug: 'namesa', fabricante_id: FABRICANTE_BRF_ID },
  'chester': { nome: 'Chester', slug: 'chester', fabricante_id: FABRICANTE_BRF_ID },
  'brf': { nome: 'BRF', slug: 'brf', fabricante_id: FABRICANTE_BRF_ID },
};

/**
 * Normaliza e classifica a marca a partir do campo bruto do catálogo ou título do produto.
 */
export function classifyBrand(rawBrand: string, productTitle: string, defaultFabricanteId = FABRICANTE_FRIBOI_ID): BrandInfo {
  const brandLower = (rawBrand || '').toLowerCase().trim();
  const titleLower = (productTitle || '').toLowerCase().trim();

  // 1. Verifica marca informada no campo bruto
  if (brandLower && KNOWN_BRANDS[brandLower]) {
    const brandData = KNOWN_BRANDS[brandLower];
    return {
      id: `marca_${brandData.slug}`,
      nome: brandData.nome,
      slug: brandData.slug,
      fabricante_id: brandData.fabricante_id
    };
  }

  // 2. Tenta identificar no título do produto
  for (const [key, brandData] of Object.entries(KNOWN_BRANDS)) {
    if (titleLower.includes(key)) {
      return {
        id: `marca_${brandData.slug}`,
        nome: brandData.nome,
        slug: brandData.slug,
        fabricante_id: brandData.fabricante_id
      };
    }
  }

  // Fallback de Marca
  const fallbackSlug = rawBrand ? rawBrand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'brf';
  const fallbackNome = rawBrand ? rawBrand : 'BRF';

  return {
    id: `marca_${fallbackSlug}`,
    nome: fallbackNome,
    slug: fallbackSlug,
    fabricante_id: defaultFabricanteId
  };
}

/**
 * Verifica se duas marcas pertencem ao mesmo fabricante / holding (ex: 'Nobre' e 'Aurora').
 */
export function areBrandsCompatible(brandA: string, brandB: string): boolean {
  if (!brandA || !brandB) return false;
  const brandAInfo = classifyBrand(brandA, '');
  const brandBInfo = classifyBrand(brandB, '');
  return brandAInfo.fabricante_id === brandBInfo.fabricante_id;
}

