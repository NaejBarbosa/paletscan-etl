/**
 * Scraper ETL Copacol - Ingestão, Normalização e Staging Relacional (Novo Padrão)
 * Autor: Engenheiro de Dados Sênior / Arquiteto PaletScan
 * 
 * Este módulo realiza:
 * 1. Leitura e enriquecimento da base auditada de produtos Copacol (SQLite / PDF / Web).
 * 2. Normalização de texto, pesagem e formatação Title Case via core/normalizers/text_parser.ts.
 * 3. Sanitização de EAN-13 e DUN-14 completos (GS1 Modulus 10).
 * 4. Classificação heurística de fabricante (Copacol Cooperativa Agroindustrial Consolata), marca e categorias.
 * 5. Associação de imagens validadas e tratamento de mídia.
 * 6. Geração dos payloads relacionais staging/copacol_staging.json e staging/copacol_staging_uuid.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { v5 as uuidv5 } from 'uuid';
import {
  formatProductDescription,
  sanitizeDescriptionAnomalies,
  normalizeEAN13,
  normalizeDUN14
} from '../../core/normalizers/text_parser';
import {
  classifyBrand,
  FABRICANTE_COPACOL_ID,
  FABRICANTE_COPACOL_NOME
} from '../../core/heuristics/brand_classifier';
import { classifyProduct } from '../../core/heuristics/category_classifier';

const PALETSCAN_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function toUUID5(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error(`Entrada inválida para conversão UUIDv5: ${input}`);
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(input)) {
    return input;
  }
  return uuidv5(input, PALETSCAN_NAMESPACE);
}

const BASE_DIR = path.resolve(process.cwd());
const STAGING_DIR = path.join(BASE_DIR, 'staging');
const STAGING_FILE = path.join(STAGING_DIR, 'copacol_staging.json');
const STAGING_UUID_FILE = path.join(STAGING_DIR, 'copacol_staging_uuid.json');

export interface RawCopacolProduct {
  sku: string;
  title?: string;
  descricao?: string;
  descrFiscal?: string;
  ean?: string;
  dun?: string;
  marca?: string;
  classe?: string;
  conservacao?: string;
  pesoLiquido?: string;
  url?: string;
  image_url?: string;
  image_status?: string;
}

export function readLegacyCopacolDatabase(): RawCopacolProduct[] {
  if (!fs.existsSync(STAGING_FILE)) {
    console.error(`[!] Staging da Copacol não encontrado em: ${STAGING_FILE}`);
    return [];
  }

  try {
    const rawContent = fs.readFileSync(STAGING_FILE, 'utf-8');
    const staging = JSON.parse(rawContent);
    if (!staging.produtos || !Array.isArray(staging.produtos)) return [];

    const cbsByProduct = new Map<string, { sku?: string; ean?: string; dun?: string }>();
    if (Array.isArray(staging.codigos_barras)) {
      for (const cb of staging.codigos_barras) {
        const pId = cb.produto_id;
        if (!cbsByProduct.has(pId)) cbsByProduct.set(pId, {});
        const group = cbsByProduct.get(pId)!;
        const tipo = (cb.tipo || '').toUpperCase();
        if (tipo === 'SKU') group.sku = cb.codigo;
        else if (tipo === 'EAN') group.ean = cb.codigo;
        else if (tipo === 'DUN') group.dun = cb.codigo;
      }
    }

    const marcasMap = new Map<string, string>();
    if (Array.isArray(staging.marcas)) {
      for (const m of staging.marcas) {
        marcasMap.set(m.id, m.nome);
      }
    }

    const products: RawCopacolProduct[] = [];
    for (const p of staging.produtos) {
      const cbs = cbsByProduct.get(p.id) || {};
      const sku = cbs.sku || (p.id ? p.id.replace('prod_copacol_', '') : '');
      products.push({
        sku,
        title: p.descricao_original || p.descricao_padronizada || '',
        descricao: p.descricao_original || p.descricao_padronizada || '',
        descrFiscal: p.descricao_original || '',
        ean: cbs.ean || '',
        dun: cbs.dun || '',
        marca: marcasMap.get(p.marca_id) || 'Copacol',
        classe: p.classe || '',
        conservacao: p.conservacao || '',
        pesoLiquido: p.peso_gramas ? `${p.peso_gramas}g` : '',
        image_url: p.imagem_url || ''
      });
    }

    console.log(`[+] Lidos ${products.length} produtos da base consolidada da Copacol (Staging).`);
    return products;
  } catch (err: any) {
    console.error(`[!] Erro ao ler base interna Copacol: ${err.message}`);
    return [];
  }
}

/**
 * Dicionário de correções de OCR / Glifos de PDF para garantir nomes impecáveis
 */
const TYPO_CORRECTIONS: Record<string, string> = {
  'vilápia': 'tilápia',
  'vilapia': 'tilapia',
  'vradicional': 'tradicional',
  'sesfriada': 'resfriada',
  'sesfriado': 'resfriado',
  'talsicha': 'salsicha',
  'vemperos': 'temperos',
  'voucino': 'toucinho',
  'xannamei': 'vannamei',
  'tteak': 'steak',
  'ttick': 'stick',
  'fisggets': 'fishggets',
  'fisburger': 'fishburger',
  'talmo': 'salmao',
  'tardina': 'sardinha',
  'xegetais': 'vegetais',
  'toerecoxa': 'sobrecoxa',
  'cickenggets': 'chickenggets',
  'coxin': 'coxinha',
  'coida': 'cozida',
  'erila': 'ervilha',
  'milo': 'milho',
  'xerde': 'verde',
  'teleta': 'seleta',
  'talsic': 'salsicha',
  'sustica': 'rústica',
  'conga': 'congelada',
  'soosso': 'sem osso'
};

function sanitizeTitle(rawText: string): string {
  if (!rawText) return '';
  let cleaned = sanitizeDescriptionAnomalies(rawText.trim());
  for (const [typo, fix] of Object.entries(TYPO_CORRECTIONS)) {
    const escaped = typo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reg = new RegExp(`\\b${escaped}\\b`, 'gi');
    cleaned = cleaned.replace(reg, fix);
  }
  return sanitizeDescriptionAnomalies(cleaned);
}

const COPACOL_BASE_URL = 'https://www.copacol.com.br';
const COPACOL_CATEGORIES = [
  'produtos/aves',
  'produtos/pescados',
  'produtos/air-fryer',
  'produtos/pratos-prontos',
  'produtos/empanados',
  'produtos/vegetais',
  'produtos/linguicas',
  'produtos/frios',
  'produtos/temperados',
  'produtos/salsichas',
  'produtos/mestre-da-grelha',
  'produtos/lanches'
];

const COPACOL_HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
};

export async function fetchLiveCopacolProducts(): Promise<RawCopacolProduct[]> {
  console.log(`[*] Consultando portal oficial da Copacol ao vivo (${COPACOL_BASE_URL}/produtos)...`);
  const liveProducts: RawCopacolProduct[] = [];

  try {
    const prodUrls = new Set<string>();
    const subCatUrls = new Set<string>();

    await Promise.all(COPACOL_CATEGORIES.map(async (cat) => {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 12000);
        const res = await fetch(`${COPACOL_BASE_URL}/${cat}`, { signal: c.signal, headers: COPACOL_HTTP_HEADERS });
        clearTimeout(t);
        if (!res.ok) return;
        const html = await res.text();
        const matches = html.match(/href=["'](produtos\/[^"']+)["']/gi) || [];
        for (const m of matches) {
          const p = m.replace(/^href=["']|["']$/g, '').trim();
          const parts = p.split('/');
          if (parts.length >= 5 && /^\d+$/.test(parts[3])) {
            prodUrls.add(`${COPACOL_BASE_URL}/${p}`);
          } else if (parts.length === 3) {
            subCatUrls.add(`${COPACOL_BASE_URL}/${p}`);
          }
        }
      } catch {
        // continua
      }
    }));

    await Promise.all(Array.from(subCatUrls).map(async (subUrl) => {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 12000);
        const res = await fetch(subUrl, { signal: c.signal, headers: COPACOL_HTTP_HEADERS });
        clearTimeout(t);
        if (!res.ok) return;
        const html = await res.text();
        const matches = html.match(/href=["'](produtos\/[^"']+)["']/gi) || [];
        for (const m of matches) {
          const p = m.replace(/^href=["']|["']$/g, '').trim();
          const parts = p.split('/');
          if (parts.length >= 5 && /^\d+$/.test(parts[3])) {
            prodUrls.add(`${COPACOL_BASE_URL}/${p}`);
          }
        }
      } catch {
        // continua
      }
    }));

    const allUrls = Array.from(prodUrls);
    console.log(`[+] Portal oficial da Copacol mapeado: ${allUrls.length} URLs de produtos identificadas.`);

    const batchSize = 20;
    for (let i = 0; i < allUrls.length; i += batchSize) {
      const batch = allUrls.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(async (url): Promise<RawCopacolProduct | null> => {
        try {
          const c = new AbortController();
          const t = setTimeout(() => c.abort(), 12000);
          const res = await fetch(url, { signal: c.signal, headers: COPACOL_HTTP_HEADERS });
          clearTimeout(t);
          if (!res.ok) return null;

          const html = await res.text();
          const h1Match = html.match(/<h1[^>]*class=["'][^"']*product-produto-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
          const rawH1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
          if (!rawH1) return null;

          const imgMatch = html.match(/https:\/\/www\.copacol\.com\.br\/administrativo\/uploads\/Produto\/([^"'\s>]+)/i);
          const ondeMatch = html.match(/onde-encontrar\/(\d+)\//i);
          const skuFromImg = imgMatch ? (imgMatch[1].match(/^(\d+)___/) || [])[1] : '';
          const sku = (ondeMatch ? ondeMatch[1] : skuFromImg || '').trim();
          if (!sku) return null;

          const apresMatch = html.match(/Apresenta(?:ç|&ccedil;)ão:\s*<strong>([\s\S]*?)<\/strong>/i);
          const apres = apresMatch ? apresMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
          const eanMatch = html.match(/\b(789\d{10})\b/);
          const dunMatch = html.match(/\b([1-9]789\d{10})\b/);

          const fullLiveTitle = (apres && !/vari[aá]vel/i.test(apres) && !rawH1.toLowerCase().includes(apres.toLowerCase()))
            ? `${rawH1.replace(/\s+\d+(?:[.,]\d+)?\s*(?:kg|g)\b/i, '').trim()} ${apres}`
            : rawH1;

          return {
            sku,
            title: fullLiveTitle,
            descricao: fullLiveTitle,
            descrFiscal: fullLiveTitle,
            ean: eanMatch ? eanMatch[1] : '',
            dun: dunMatch ? dunMatch[1] : '',
            marca: 'Copacol',
            conservacao: /resfriad/i.test(rawH1) ? 'Resfriado' : 'Congelado',
            pesoLiquido: apres,
            url,
            image_url: imgMatch ? imgMatch[0].trim() : ''
          };
        } catch {
          return null;
        }
      }));

      for (const r of results) {
        if (r) liveProducts.push(r);
      }
    }

    console.log(`[+] Extraídos ${liveProducts.length} produtos ao vivo do portal oficial da Copacol.`);
  } catch (err: any) {
    console.warn(`[!] Aviso na extração ao vivo da Copacol: ${err.message}. Preservando base consolidada.`);
  }

  return liveProducts;
}

export async function runCopacolScraper() {
  console.log('[*] Iniciando ETL Scraper da Copacol Cooperativa Agroindustrial Consolata...');
  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
  }

  const baselineProducts = readLegacyCopacolDatabase();
  const liveProducts = await fetchLiveCopacolProducts();

  // Fusão Anti-Regressão por SKU: preserva 100% da base auditada de EAN/DUN e aplica enriquecimento ao vivo
  const mergedBySku = new Map<string, RawCopacolProduct>();
  const rawProducts: RawCopacolProduct[] = [];

  for (const bp of baselineProducts) {
    if (bp.sku) {
      mergedBySku.set(String(bp.sku).trim(), bp);
    }
    rawProducts.push(bp);
  }

  let liveUpdatedCount = 0;
  let liveAddedCount = 0;

  for (const lp of liveProducts) {
    const skuKey = String(lp.sku || '').trim();
    if (!skuKey) continue;

    const existing = mergedBySku.get(skuKey);
    if (existing) {
      if (lp.image_url && (!existing.image_url || !existing.image_url.startsWith('/imagens_produtos/'))) {
        existing.image_url = lp.image_url;
      }
      // Se o peso unitário oficial do produto mudou no portal da Copacol, atualiza o título e peso
      const liveParsed = formatProductDescription( sanitizeTitle(lp.title || '') );
      const exParsed = formatProductDescription( sanitizeTitle(existing.title || existing.descrFiscal || '') );
      if (liveParsed.peso_gramas && exParsed.peso_gramas && liveParsed.peso_gramas !== exParsed.peso_gramas) {
        existing.title = lp.title;
        existing.descricao = lp.title;
        existing.descrFiscal = lp.title;
        liveUpdatedCount++;
      }
    } else if (lp.ean && normalizeEAN13(lp.ean)) {
      mergedBySku.set(skuKey, lp);
      rawProducts.push(lp);
      liveAddedCount++;
    }
  }

  if (liveUpdatedCount > 0 || liveAddedCount > 0) {
    console.log(`[+] Fusão Ao Vivo Copacol: ${liveAddedCount} novos produtos e ${liveUpdatedCount} atualizados via portal oficial.`);
  }

  const now = new Date().toISOString();

  // 1. Fabricante Mestre Copacol
  const fabricanteObj = {
    id: FABRICANTE_COPACOL_ID,
    nome: FABRICANTE_COPACOL_NOME,
    cnpj: '76.092.736/0001-38',
    site_oficial: 'https://www.copacol.com.br',
    ativo: true,
    criado_em: now
  };

  // 2. Coleta de Marcas e Produtos
  const marcasMap = new Map<string, any>();
  const produtosList: any[] = [];
  const codigosBarrasList: any[] = [];
  const pendingImagesApprovalList: any[] = [];

  // Garante marca principal Copacol
  marcasMap.set('marca_copacol', {
    id: 'marca_copacol',
    fabricante_id: FABRICANTE_COPACOL_ID,
    nome: 'Copacol',
    slug: 'copacol',
    descricao: 'Produtos da Copacol Cooperativa Agroindustrial Consolata',
    ativo: true,
    criado_em: now
  });

  let imageValidatedCount = 0;
  let noImageCount = 0;

  for (const rawProd of rawProducts) {
    const fullDescr = (rawProd.descrFiscal && !rawProd.descrFiscal.includes('(pesar)'))
      ? rawProd.descrFiscal
      : (rawProd.pesoLiquido && rawProd.pesoLiquido.trim() !== '' && rawProd.pesoLiquido !== 'N/A' && !rawProd.pesoLiquido.toLowerCase().includes('variável')
          ? `${rawProd.title || rawProd.descricao || ''} ${rawProd.pesoLiquido}`
          : (rawProd.title || rawProd.descricao || rawProd.descrFiscal || ''));

    const rawTitle = sanitizeTitle(fullDescr);
    if (!rawTitle) continue;

    // Normalização de descrição e pesagens via text_parser.ts
    const parsedText = formatProductDescription(rawTitle);

    // Classificação da Marca
    const brandInfo = classifyBrand(rawProd.marca || 'Copacol', rawTitle, FABRICANTE_COPACOL_ID);
    if (!marcasMap.has(brandInfo.id)) {
      marcasMap.set(brandInfo.id, {
        id: brandInfo.id,
        fabricante_id: FABRICANTE_COPACOL_ID,
        nome: brandInfo.nome,
        slug: brandInfo.slug,
        descricao: `Linha de produtos ${brandInfo.nome} da Copacol`,
        ativo: true,
        criado_em: now
      });
    }

    // Classificação de Categoria/Conservação
    const categoryInfo = classifyProduct(rawTitle, rawProd.classe, rawProd.conservacao);

    // EAN-13 e DUN-14
    const eanClean = normalizeEAN13(rawProd.ean);
    const dunClean = normalizeDUN14(rawProd.dun, eanClean);

    if (!eanClean && !dunClean) {
      console.warn(`[!] Produto SKU ${rawProd.sku} sem EAN/DUN válido. Ignorando.`);
      continue;
    }

    const prodId = `prod_copacol_${rawProd.sku || eanClean}`;

    // Determina Mídia e Status de Imagem
    let finalImageUrl: string | null = null;
    let imageStatus: 'aprovado' | 'pendente_aprovacao' | 'sem_imagem' = 'sem_imagem';

    const primaryBarcode = eanClean || dunClean;
    const localPreparedPath = primaryBarcode ? path.join(BASE_DIR, 'images', 'processed', `${primaryBarcode}.webp`) : '';
    const localPwaPath = primaryBarcode ? path.join('/root/repo_pwa/public/imagens_produtos', `${primaryBarcode}.webp`) : '';

    if ((localPreparedPath && fs.existsSync(localPreparedPath)) || (localPwaPath && fs.existsSync(localPwaPath))) {
      finalImageUrl = `/imagens_produtos/${primaryBarcode}.webp`;
      imageStatus = 'aprovado';
      imageValidatedCount++;
    } else if (rawProd.image_url && rawProd.image_url.startsWith('http')) {
      finalImageUrl = rawProd.image_url;
      imageStatus = 'aprovado';
      imageValidatedCount++;
    } else {
      noImageCount++;
      pendingImagesApprovalList.push({
        produto_id: prodId,
        sku: rawProd.sku || primaryBarcode,
        descricao: parsedText.formatted_description,
        placeholder_url: '/imagens_produtos/placeholder.webp'
      });
    }

    produtosList.push({
      id: prodId,
      marca_id: brandInfo.id,
      descricao_padronizada: parsedText.formatted_description,
      descricao_original: rawTitle,
      classe: categoryInfo.classe,
      conservacao: categoryInfo.conservacao,
      peso_gramas: parsedText.peso_gramas,
      fracionado: parsedText.fracionado,
      imagem_url: finalImageUrl,
      status_imagem: imageStatus,
      criado_em: now
    });

    // Código SKU Interno
    if (rawProd.sku && rawProd.sku !== eanClean && rawProd.sku !== dunClean) {
      codigosBarrasList.push({
        id: `cb_copacol_sku_${rawProd.sku}`,
        produto_id: prodId,
        tipo: 'SKU',
        codigo: String(rawProd.sku).trim(),
        embalagem: null,
        quantidade_embalagem: null,
        criado_em: now
      });
    }

    // Código EAN-13
    if (eanClean) {
      codigosBarrasList.push({
        id: `cb_ean_${eanClean}`,
        produto_id: prodId,
        tipo: 'EAN',
        codigo: eanClean,
        embalagem: 'Unidade / Pacote',
        quantidade_embalagem: 1,
        criado_em: now
      });
    }

    // Código DUN-14
    if (dunClean && dunClean !== eanClean) {
      codigosBarrasList.push({
        id: `cb_dun_${dunClean}`,
        produto_id: prodId,
        tipo: 'DUN',
        codigo: dunClean,
        embalagem: 'Caixa Comercial',
        quantidade_embalagem: null,
        criado_em: now
      });
    }
  }

  console.log(`[+] Imagens Copacol: ${imageValidatedCount} validadas/aprovadas, ${noImageCount} sem imagem/pendentes.`);

  const stagingData = {
    fabricantes: [fabricanteObj],
    marcas: Array.from(marcasMap.values()),
    produtos: produtosList,
    codigos_barras: codigosBarrasList,
    pending_images_approval: pendingImagesApprovalList
  };

  // Proteção de integridade: nunca sobrescreve o staging se o total de produtos for zero
  if (produtosList.length === 0) {
    console.warn(`[!] Aviso de segurança: O scraper Copacol produziu 0 produtos. Staging preservado.`);
    return stagingData;
  }

  // Salva staging de IDs texto
  fs.writeFileSync(STAGING_FILE, JSON.stringify(stagingData, null, 2), 'utf-8');
  console.log(`[+] Staging textual Copacol gerado em ${STAGING_FILE}: ${produtosList.length} produtos, ${codigosBarrasList.length} códigos de barras.`);

  // Gera Staging UUIDv5 determinístico
  const uuidStagingData = {
    fabricantes: stagingData.fabricantes.map(f => ({ ...f, id: toUUID5(f.id) })),
    marcas: stagingData.marcas.map(m => ({
      ...m,
      id: toUUID5(m.id),
      fabricante_id: toUUID5(m.fabricante_id)
    })),
    produtos: stagingData.produtos.map(p => ({
      ...p,
      id: toUUID5(p.id),
      marca_id: toUUID5(p.marca_id)
    })),
    codigos_barras: stagingData.codigos_barras.map(cb => ({
      ...cb,
      id: toUUID5(cb.id),
      produto_id: toUUID5(cb.produto_id)
    })),
    pending_images_approval: stagingData.pending_images_approval.map(p => ({
      ...p,
      produto_id: toUUID5(p.produto_id)
    }))
  };

  fs.writeFileSync(STAGING_UUID_FILE, JSON.stringify(uuidStagingData, null, 2), 'utf-8');
  console.log(`[+] Staging UUIDv5 Copacol gerado em ${STAGING_UUID_FILE}`);

  return stagingData;
}

if (require.main === module) {
  runCopacolScraper().then(() => {
    console.log('[*] Processamento do Scraper da Copacol finalizado com sucesso!');
  }).catch(err => {
    console.error('[!] Falha ao executar Scraper da Copacol:', err);
  });
}
