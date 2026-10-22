/**
 * Scraper ETL Lar Cooperativa Agroindustrial - Ingestão, Normalização e Staging Relacional
 * Autor: Engenheiro de Dados Sênior / Arquiteto PaletScan
 * 
 * Este módulo realiza:
 * 1. Leitura e enriquecimento da base auditada de produtos Lar (SQLite / Catálogo Web Oficial).
 * 2. Normalização de texto, pesagem e formatação Title Case via core/normalizers/text_parser.ts.
 * 3. Sanitização de EAN-13 e DUN-14 completos (GS1 Modulus 10).
 * 4. Classificação heurística de fabricante (Lar Cooperativa Agroindustrial), marca e categorias.
 * 5. Associação de imagens validadas e tratamento de mídia.
 * 6. Geração dos payloads relacionais staging/lar_staging.json e staging/lar_staging_uuid.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { v5 as uuidv5 } from 'uuid';
import {
  formatProductDescription,
  normalizeEAN13,
  normalizeDUN14,
  toTitleCase
} from '../../core/normalizers/text_parser';
import {
  classifyBrand,
  FABRICANTE_LAR_ID,
  FABRICANTE_LAR_NOME
} from '../../core/heuristics/brand_classifier';
import { classifyProduct } from '../../core/heuristics/category_classifier';
import { getLarOfficialSpec, LAR_OFFICIAL_CATALOG } from './catalog_rules';

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
const STAGING_FILE = path.join(STAGING_DIR, 'lar_staging.json');
const STAGING_UUID_FILE = path.join(STAGING_DIR, 'lar_staging_uuid.json');

export interface RawLarProduct {
  sku: string;
  title: string;
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

export function readLegacyLarDatabase(): RawLarProduct[] {
  if (!fs.existsSync(STAGING_FILE)) {
    console.error(`[!] Staging da Lar não encontrado em: ${STAGING_FILE}`);
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

    const products: RawLarProduct[] = [];
    for (const p of staging.produtos) {
      const cbs = cbsByProduct.get(p.id) || {};
      const sku = cbs.sku || (p.id ? p.id.replace('prod_lar_', '') : '');
      products.push({
        sku,
        title: p.descricao_original || p.descricao_padronizada || '',
        descrFiscal: p.descricao_original || '',
        ean: cbs.ean || '',
        dun: cbs.dun || '',
        marca: marcasMap.get(p.marca_id) || 'Lar',
        classe: p.classe || '',
        conservacao: p.conservacao || '',
        pesoLiquido: p.peso_gramas ? `${p.peso_gramas}g` : '',
        image_url: p.imagem_url || ''
      });
    }

    console.log(`[+] Lidos ${products.length} produtos da base consolidada da Lar (Staging).`);
    return products;
  } catch (err: any) {
    console.error(`[!] Erro ao ler base interna Lar: ${err.message}`);
    return [];
  }
}

const LAR_SITEMAP_URL = 'https://www.lar.ind.br/produtos-sitemap.xml';
const LAR_HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
};

export async function fetchLiveLarProducts(): Promise<RawLarProduct[]> {
  console.log(`[*] Consultando sitemap oficial da Lar ao vivo (${LAR_SITEMAP_URL})...`);
  const liveProducts: RawLarProduct[] = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(LAR_SITEMAP_URL, { signal: controller.signal, headers: LAR_HTTP_HEADERS });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[!] Aviso ao consultar sitemap Lar: HTTP ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const urls = (xml.match(/<loc>([^<]+)<\/loc>/g) || [])
      .map(x => x.replace(/<\/?loc>/g, '').trim())
      .filter(u => u.includes('lar.ind.br/produtos/') && u !== 'https://www.lar.ind.br/produtos/');

    console.log(`[+] Sitemap oficial da Lar lido: ${urls.length} URLs de produtos PT-BR identificadas.`);

    const batchSize = 20;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(async (url): Promise<RawLarProduct | null> => {
        try {
          const c = new AbortController();
          const t = setTimeout(() => c.abort(), 12000);
          const pageRes = await fetch(url, { signal: c.signal, headers: LAR_HTTP_HEADERS });
          clearTimeout(t);
          if (!pageRes.ok) return null;

          const html = await pageRes.text();
          const titleTag = (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || '';
          const rawTitle = titleTag
            .replace(/\s*-\s*Lar Cooperativa Agroindustrial.*$/i, '')
            .replace(/&#8211;|&#8226;/g, '-')
            .trim();

          const eanMatch = html.match(/EAN:\s*(\d{13})/i);
          const dunMatch = html.match(/DUN:\s*(\d{14})/i);
          const pesoUnMatch = html.match(/Peso\s*Un:\s*([0-9.,]+\s*(?:kg|g))/i);
          const ogImgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);

          const ean = eanMatch ? eanMatch[1].trim() : '';
          const dun = dunMatch ? dunMatch[1].trim() : '';
          if (!rawTitle || (!ean && !dun)) return null;

          const pesoLiquido = pesoUnMatch ? pesoUnMatch[1].replace(/\s+/g, '').trim() : '';
          const ogImg = ogImgMatch && !ogImgMatch[1].includes('logo.png') ? ogImgMatch[1].trim() : '';
          const conservacao = /resfriad/i.test(rawTitle) ? 'Resfriado' : 'Congelado';

          return {
            sku: ean ? ean.slice(-6) : '',
            title: rawTitle,
            descrFiscal: rawTitle,
            ean,
            dun,
            marca: 'Lar',
            classe: '',
            conservacao,
            pesoLiquido,
            url,
            image_url: ogImg
          };
        } catch {
          return null;
        }
      }));

      for (const r of results) {
        if (r) liveProducts.push(r);
      }
    }

    console.log(`[+] Extraídos ${liveProducts.length} produtos ao vivo do portal oficial da Lar.`);
  } catch (err: any) {
    console.warn(`[!] Aviso na extração ao vivo da Lar: ${err.message}. Preservando base consolidada.`);
  }

  return liveProducts;
}

export async function runLarScraper() {
  console.log('[*] Iniciando ETL Scraper da Lar Cooperativa Agroindustrial...');
  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
  }

  const baselineProducts = readLegacyLarDatabase();
  const liveProducts = await fetchLiveLarProducts();

  // Fusão Anti-Regressão: preserva 100% da base consolidada e aplica atualizações/novos itens da web ao vivo
  const mergedByEan = new Map<string, RawLarProduct>();
  const rawProducts: RawLarProduct[] = [];

  for (const bp of baselineProducts) {
    const cleanEan = normalizeEAN13(bp.ean);
    if (cleanEan) {
      mergedByEan.set(cleanEan, bp);
    }
    rawProducts.push(bp);
  }

  let liveUpdatedCount = 0;
  let liveAddedCount = 0;

  for (const lp of liveProducts) {
    const cleanEan = normalizeEAN13(lp.ean);
    if (!cleanEan) continue;

    const existing = mergedByEan.get(cleanEan);
    if (existing) {
      if (lp.image_url && (!existing.image_url || !existing.image_url.startsWith('/imagens_produtos/'))) {
        existing.image_url = lp.image_url;
      }
      if (!existing.dun && lp.dun) {
        existing.dun = lp.dun;
      }
      // Se o site oficial da Lar informou um Peso Unitário diferente do que estava registrado, propaga a atualização
      if (lp.pesoLiquido) {
        const liveParsed = formatProductDescription(`${lp.title} ${lp.pesoLiquido}`);
        const exParsed = formatProductDescription(`${existing.title} ${existing.pesoLiquido || ''}`);
        if (liveParsed.peso_gramas && exParsed.peso_gramas && liveParsed.peso_gramas !== exParsed.peso_gramas) {
          existing.title = lp.title;
          existing.descrFiscal = `${lp.title} ${lp.pesoLiquido}`;
          existing.pesoLiquido = lp.pesoLiquido;
          (existing as any)._forceLiveOverride = true;
          liveUpdatedCount++;
        }
      }
    } else {
      // Ignora produtos suínos de peso variável na web quando colidem no mesmo EAN ou garante unicidade estrita de EAN
      mergedByEan.set(cleanEan, lp);
      rawProducts.push(lp);
      liveAddedCount++;
    }
  }

  if (liveUpdatedCount > 0 || liveAddedCount > 0) {
    console.log(`[+] Fusão Ao Vivo Lar: ${liveAddedCount} novos produtos descobertos no sitemap e ${liveUpdatedCount} atualizados.`);
  }

  // Inclusão de produtos do catálogo auditado que não estão na base legada nem no sitemap do consumidor
  let officialAddedCount = 0;
  const officialDuns: Record<string, string> = {
    '7896419732518': '17896419732515',
    '7896419732556': '17896419732553',
    '7896419732525': '17896419732522',
    '7896419732501': '17896419732508',
  };

  for (const [code, spec] of Object.entries(LAR_OFFICIAL_CATALOG)) {
    const cleanEan = normalizeEAN13(code);
    if (!cleanEan || mergedByEan.has(cleanEan)) continue;

    const newProd: RawLarProduct = {
      sku: cleanEan.slice(-6),
      title: spec.descr,
      descrFiscal: spec.descr,
      ean: cleanEan,
      dun: officialDuns[cleanEan] || '',
      marca: 'Lar',
      classe: 'Aves',
      conservacao: 'Congelado',
      pesoLiquido: spec.peso_gramas ? `${spec.peso_gramas}g` : '',
      image_url: ''
    };
    mergedByEan.set(cleanEan, newProd);
    rawProducts.push(newProd);
    officialAddedCount++;
  }

  if (officialAddedCount > 0) {
    console.log(`[+] Inclusão Catálogo Auditado Lar: ${officialAddedCount} produtos oficiais adicionados (incluindo linha Food Service).`);
  }

  const now = new Date().toISOString();

  // 1. Fabricante Mestre Lar
  const fabricanteObj = {
    id: FABRICANTE_LAR_ID,
    nome: FABRICANTE_LAR_NOME,
    cnpj: '76.879.878/0001-00',
    site_oficial: 'https://www.lar.ind.br',
    ativo: true,
    criado_em: now
  };

  // 2. Coleta de Marcas e Produtos
  const marcasMap = new Map<string, any>();
  const produtosList: any[] = [];
  const codigosBarrasList: any[] = [];
  const pendingImagesApprovalList: any[] = [];

  // Garante marca principal Lar
  marcasMap.set('marca_lar', {
    id: 'marca_lar',
    fabricante_id: FABRICANTE_LAR_ID,
    nome: 'Lar',
    slug: 'lar',
    descricao: 'Produtos da Lar Cooperativa Agroindustrial',
    ativo: true,
    criado_em: now
  });

  let imageValidatedCount = 0;
  let noImageCount = 0;

  for (const rawProd of rawProducts) {
    // EAN-13 e DUN-14
    const eanClean = normalizeEAN13(rawProd.ean);
    const dunClean = normalizeDUN14(rawProd.dun, eanClean);

    if (!eanClean && !dunClean) {
      console.warn(`[!] Produto SKU ${rawProd.sku} sem EAN/DUN válido. Ignorando.`);
      continue;
    }

    const prodId = `prod_lar_${rawProd.sku || eanClean}`;

    // Consulta se o produto possui especificação auditada no catálogo oficial Lar (a menos que o site ao vivo tenha atualizado o peso)
    const officialSpec = (rawProd as any)._forceLiveOverride ? null : getLarOfficialSpec(eanClean, rawProd.sku);
    let finalDescrPadronizada: string;
    let finalDescrOriginal: string;
    let finalPesoGramas: number | null;
    let finalFracionado: boolean;

    if (officialSpec) {
      finalDescrPadronizada = officialSpec.descr;
      finalDescrOriginal = officialSpec.descr;
      finalPesoGramas = officialSpec.peso_gramas;
      finalFracionado = officialSpec.fracionado;
    } else {
      // Monta texto com descrição completa e peso do catálogo
      let fullDescr = (rawProd.descrFiscal && !rawProd.descrFiscal.includes('(pesar)'))
        ? rawProd.descrFiscal
        : (rawProd.pesoLiquido && rawProd.pesoLiquido.trim() !== '' && rawProd.pesoLiquido !== 'N/A' && !rawProd.pesoLiquido.toLowerCase().includes('variável')
            ? `${rawProd.title} ${rawProd.pesoLiquido}`
            : (rawProd.title || ''));

      // Limpa conservação duplicada no título se houver e resquícios de (pesar)
      fullDescr = fullDescr
        .replace(/\s*\([Pp]esar\)/gi, '')
        .replace(/\s*[•\-\/,]?\s*(congeladas?|congelados?|resfriadas?|resfriados?)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Normalização de descrição e pesagens via text_parser.ts
      const parsedText = formatProductDescription(fullDescr);
      finalDescrPadronizada = parsedText.formatted_description;
      finalDescrOriginal = (rawProd.descrFiscal || rawProd.title || '').replace(/\s*\([Pp]esar\)/gi, '').trim();
      finalPesoGramas = parsedText.peso_gramas;
      finalFracionado = parsedText.fracionado;
    }

    // Classificação da Marca
    const brandInfo = classifyBrand(rawProd.marca || 'Lar', rawProd.title, FABRICANTE_LAR_ID);
    if (!marcasMap.has(brandInfo.id)) {
      marcasMap.set(brandInfo.id, {
        id: brandInfo.id,
        fabricante_id: FABRICANTE_LAR_ID,
        nome: brandInfo.nome,
        slug: brandInfo.slug,
        descricao: `Linha de produtos ${brandInfo.nome} da Lar`,
        ativo: true,
        criado_em: now
      });
    }

    // Classificação de Categoria/Conservação
    const categoryInfo = classifyProduct(rawProd.title, rawProd.classe, rawProd.conservacao);

    // Determina Mídia e Status de Imagem
    let finalImageUrl: string | null = null;
    let imageStatus: 'aprovado' | 'pendente_aprovacao' | 'sem_imagem' = 'sem_imagem';

    const primaryBarcode = eanClean || dunClean;
    const localPreparedPath = primaryBarcode ? path.join(BASE_DIR, 'images', 'processed', `${primaryBarcode}.webp`) : '';
    const localPwaPath = primaryBarcode ? path.join('/root/repo_pwa/public/imagens_produtos', `${primaryBarcode}.webp`) : '';

    const manualSemImagemEans = new Set(['7896419732518', '7896419732556', '7896419732525', '7896419732501']);
    if (eanClean && manualSemImagemEans.has(eanClean)) {
      finalImageUrl = null;
      imageStatus = 'sem_imagem';
      noImageCount++;
    } else if ((localPreparedPath && fs.existsSync(localPreparedPath)) || (localPwaPath && fs.existsSync(localPwaPath))) {
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
        descricao: finalDescrPadronizada,
        placeholder_url: '/imagens_produtos/placeholder.webp'
      });
    }

    const isLarResfriado = /resfriad/i.test(categoryInfo.conservacao || '');
    produtosList.push({
      id: prodId,
      marca_id: brandInfo.id,
      descricao_padronizada: finalDescrPadronizada.replace(/\s*\([Pp]esar\)/gi, '').trim(),
      descricao_original: finalDescrOriginal.replace(/\s*\([Pp]esar\)/gi, '').trim(),
      classe: categoryInfo.classe,
      conservacao: categoryInfo.conservacao,
      peso_gramas: finalPesoGramas,
      fracionado: isLarResfriado ? finalFracionado : false,
      imagem_url: finalImageUrl,
      status_imagem: imageStatus,
      criado_em: now
    });

    // Código EAN-13
    if (eanClean) {
      codigosBarrasList.push({
        id: `cb_lar_ean_${eanClean}`,
        produto_id: prodId,
        tipo: 'EAN',
        codigo: eanClean,
        embalagem: 'UN',
        quantidade_embalagem: 1,
        criado_em: now
      });
    }

    // Código DUN-14
    if (dunClean && dunClean !== eanClean) {
      codigosBarrasList.push({
        id: `cb_lar_dun_${dunClean}`,
        produto_id: prodId,
        tipo: 'DUN',
        codigo: dunClean,
        embalagem: 'CX',
        quantidade_embalagem: null,
        criado_em: now
      });
    }

    // SKU Interno
    if (rawProd.sku && rawProd.sku !== eanClean && rawProd.sku !== dunClean) {
      codigosBarrasList.push({
        id: `cb_lar_sku_${rawProd.sku}`,
        produto_id: prodId,
        tipo: 'SKU',
        codigo: rawProd.sku,
        embalagem: 'UN',
        quantidade_embalagem: 1,
        criado_em: now
      });
    }
  }

  // 3. Monta Payload Staging Textual
  const stagingPayload = {
    fabricantes: [fabricanteObj],
    marcas: Array.from(marcasMap.values()),
    produtos: produtosList,
    codigos_barras: codigosBarrasList,
    pending_images_approval: pendingImagesApprovalList
  };

  // Proteção de integridade: nunca sobrescreve o staging se o total de produtos for zero
  if (produtosList.length === 0) {
    console.warn(`[!] Aviso de segurança: O scraper Lar produziu 0 produtos. Staging preservado.`);
    return produtosList;
  }

  fs.writeFileSync(STAGING_FILE, JSON.stringify(stagingPayload, null, 2), 'utf-8');
  console.log(`[+] Staging Lar salvo em ${STAGING_FILE} com ${produtosList.length} produtos.`);

  // 4. Monta Payload Staging UUIDv5
  const stagingUuidPayload = {
    fabricantes: [
      {
        ...fabricanteObj,
        id: toUUID5(fabricanteObj.id)
      }
    ],
    marcas: Array.from(marcasMap.values()).map(m => ({
      ...m,
      id: toUUID5(m.id),
      fabricante_id: toUUID5(m.fabricante_id)
    })),
    produtos: produtosList.map(p => ({
      ...p,
      id: toUUID5(p.id),
      marca_id: toUUID5(p.marca_id)
    })),
    codigos_barras: codigosBarrasList.map(cb => ({
      ...cb,
      id: toUUID5(cb.id),
      produto_id: toUUID5(cb.produto_id)
    })),
    pending_images_approval: pendingImagesApprovalList.map(pi => ({
      ...pi,
      produto_id: toUUID5(pi.produto_id)
    }))
  };

  fs.writeFileSync(STAGING_UUID_FILE, JSON.stringify(stagingUuidPayload, null, 2), 'utf-8');
  console.log(`[+] Staging UUIDv5 Lar salvo em ${STAGING_UUID_FILE}.`);

  console.log(`\n==============================================`);
  console.log(`✅ ETL LAR CONCLUÍDO COM SUCESSO`);
  console.log(`📦 Total de Produtos: ${produtosList.length}`);
  console.log(`⚖️  Produtos com Peso Fixo: ${produtosList.filter(p => !p.fracionado).length}`);
  console.log(`⚖️  Produtos Fracionados (pesar): ${produtosList.filter(p => p.fracionado).length}`);
  console.log(`🏷️  Total de Códigos de Barras: ${codigosBarrasList.length}`);
  console.log(`🖼️  Imagens Aprovadas: ${imageValidatedCount} | Pendentes: ${noImageCount}`);
  console.log(`==============================================\n`);

  return produtosList;
}

if (require.main === module) {
  runLarScraper().catch(err => {
    console.error('❌ Erro na execução do ETL Lar:', err);
    process.exit(1);
  });
}
