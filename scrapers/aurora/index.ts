/**
 * Scraper ETL Aurora Alimentos - Ingestão, Normalização e Staging Relacional (Novo Padrão)
 * Autor: Engenheiro de Dados Sênior / Arquiteto PaletScan
 * 
 * Este módulo realiza:
 * 1. Raspagem de sitemap XML (https://www.auroraalimentos.com.br/produto-sitemap.xml).
 * 2. Algoritmo avançado de inteligência visual para cruzamento de imagens reais do site da Aurora por SKU e Título/Pesos.
 * 3. Leitura e enriquecimento da base auditada de 385 produtos (EAN-13 e DUN-14 completos).
 * 4. Normalização de texto e pesos via core/normalizers/text_parser.ts.
 * 5. Classificação heurística de sub-marcas e categorias.
 * 6. Geração dos payloads relacionais staging/aurora_staging.json e staging/aurora_staging_uuid.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { v5 as uuidv5 } from 'uuid';
import {
  formatProductDescription,
  normalizeEAN13,
  normalizeDUN14
} from '../../core/normalizers/text_parser';
import {
  classifyBrand,
  FABRICANTE_AURORA_ID,
  FABRICANTE_AURORA_NOME
} from '../../core/heuristics/brand_classifier';
import { classifyProduct } from '../../core/heuristics/category_classifier';
import { extractAndAdaptAuroraPdfImage } from '../../core/validators/pdf_extractor';

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
const STAGING_FILE = path.join(STAGING_DIR, 'aurora_staging.json');
const STAGING_UUID_FILE = path.join(STAGING_DIR, 'aurora_staging_uuid.json');
const LEGACY_DB_PATH = '/root/projetos-scraping/scraping-aurora/aurora_catalogo.db';
const LEGACY_SITEMAP_JSON = '/root/projetos-scraping/scraping-aurora/sitemap_aurora.json';
const SITEMAP_URL = 'https://www.auroraalimentos.com.br/produto-sitemap.xml';

export interface RawAuroraProduct {
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
}

export interface SitemapEntry {
  url: string;
  image_url: string;
}

export async function fetchLiveSitemap(): Promise<SitemapEntry[]> {
  console.log(`[*] Consultando sitemap XML da Aurora ao vivo (${SITEMAP_URL})...`);
  let entries: SitemapEntry[] = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(SITEMAP_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/xml,application/xml'
      }
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const xml = await res.text();
      const urlBlocks = xml.split('<url>');
      for (const block of urlBlocks) {
        const locMatch = block.match(/<loc>([^<]+)<\/loc>/);
        const imgMatch = block.match(/<image:loc>([^<]+)<\/image:loc>/) || block.match(/<image>[\s\S]*?<loc>([^<]+)<\/loc>/);
        if (locMatch) {
          entries.push({
            url: locMatch[1].trim(),
            image_url: imgMatch ? imgMatch[1].trim() : ''
          });
        }
      }
      console.log(`[+] Sitemap ao vivo lido: ${entries.length} URLs mapeadas.`);
    }
  } catch (err: any) {
    console.warn(`[!] Aviso no sitemap ao vivo: ${err.message}. Carregando base sitemap local...`);
  }

  // Carrega sitemap JSON local se necessário para complementar
  if (fs.existsSync(LEGACY_SITEMAP_JSON)) {
    try {
      const legacyEntries: SitemapEntry[] = JSON.parse(fs.readFileSync(LEGACY_SITEMAP_JSON, 'utf-8'));
      const existingUrls = new Set(entries.map(e => e.url));
      for (const leg of legacyEntries) {
        if (!existingUrls.has(leg.url) && leg.image_url) {
          entries.push(leg);
        }
      }
      console.log(`[+] Sitemap consolidado com base salva: ${entries.length} URLs com imagens.`);
    } catch {}
  }

  return entries;
}

export function readLegacyDatabase(): RawAuroraProduct[] {
  if (!fs.existsSync(LEGACY_DB_PATH)) {
    console.error(`[!] Banco de dados legado não encontrado em: ${LEGACY_DB_PATH}`);
    return [];
  }

  const pythonCmd = `python3 -c "import sqlite3, json; conn = sqlite3.connect('${LEGACY_DB_PATH}'); conn.row_factory = sqlite3.Row; c = conn.cursor(); c.execute('SELECT * FROM produtos;'); print(json.dumps([dict(r) for r in c.fetchall()], ensure_ascii=False))"`;
  try {
    const rawJson = execSync(pythonCmd, { encoding: 'utf-8' });
    const products: RawAuroraProduct[] = JSON.parse(rawJson);
    console.log(`[+] Lidos ${products.length} produtos do catálogo legado da Aurora.`);
    return products;
  } catch (err: any) {
    console.error(`[!] Erro ao executar dump no banco SQLite: ${err.message}`);
    return [];
  }
}

function cleanTextForMatching(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWeightsStr(text: string): string | null {
  if (!text) return null;
  const match = text.toLowerCase().match(/\b(\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l))\b/);
  if (!match) return null;
  return match[1].replace(/\s+/g, '').replace(',', '.');
}

const NOUN_GROUPS: Record<string, string[]> = {
  hamburguer: ['hamburguer', 'burger'],
  isca: ['isca', 'iscas'],
  tempura: ['tempura'],
  nugget: ['nugget', 'nuggets', 'auroggets'],
  kibe: ['kibe', 'quibe'],
  salsicha: ['salsicha'],
  presunto: ['presunto', 'apresuntado'],
  mortadela: ['mortadela'],
  salame: ['salame'],
  linguica: ['linguica'],
  bacon: ['bacon'],
  pao_de_alho: ['pao de alho'],
  queijo: ['queijo', 'mussarela', 'prato', 'parmesao', 'provolone', 'coalho', 'requeijao'],
  leite: ['leite'],
  coxa: ['coxa', 'coxas', 'coxinhas', 'coxinha'],
  sobrecoxa: ['sobrecoxa', 'sobrecoxas'],
  peito: ['peito'],
  asa: ['asa', 'asas', 'tulipa'],
  sassami: ['sassami', 'filezinho'],
  pernil: ['pernil'],
  lombo: ['lombo'],
  costela: ['costela'],
  bisteca: ['bisteca'],
  panceta: ['panceta'],
  alcatra: ['alcatra'],
  picanha: ['picanha'],
  tilapia: ['tilapia', 'peixe', 'pescado']
};

function getProductNounTags(text: string): Set<string> {
  const tClean = cleanTextForMatching(text);
  const tags = new Set<string>();
  for (const [grp, keywords] of Object.entries(NOUN_GROUPS)) {
    for (const kw of keywords) {
      if (tClean.includes(kw)) {
        tags.add(grp);
        break;
      }
    }
  }
  return tags;
}

export function findBestAuroraWebImage(
  sku: string,
  rawTitle: string,
  sitemapList: SitemapEntry[]
): string | null {
  if (!sitemapList || sitemapList.length === 0) return null;

  const skuClean = sku.trim();
  const titleNorm = cleanTextForMatching(rawTitle);
  const titleWords = new Set(titleNorm.split(/\s+/));
  const titleWeight = extractWeightsStr(rawTitle);
  const titleNouns = getProductNounTags(rawTitle);

  // 1. Tenta correspondência exata por SKU no nome do arquivo ou no slug da URL
  for (const item of sitemapList) {
    const imgUrl = item.image_url || '';
    const url = item.url || '';
    if (!imgUrl) continue;

    const filename = imgUrl.split('/').pop() || '';
    const slug = url.split('/produto/').pop()?.split('/')[0] || '';

    const skuPattern = new RegExp(`[-_]${skuClean}([-_0-9]|\\.png|\\.jpg|\\.webp|$)`, 'i');
    if (skuPattern.test(filename) || skuPattern.test(slug)) {
      return imgUrl;
    }
  }

  // 2. Tenta por sobreposição semântica estrita de palavras e verificadores de produto/peso
  const modifiers = [
    'mini', 'fina', 'fatiada', 'defumada', 'resfriada', 'congelada', 
    'temperada', 'recheada', 'crocante', 'tradicional', 'linguica', 
    'salsicha', 'presunto', 'apresuntado', 'salame', 'mortadela',
    'frango', 'suina', 'suino', 'pernil', 'bisteca', 'costela', 
    'lombo', 'panceta', 'alcatra', 'picanha', 'sassami', 'filezinho',
    'portuguesa', 'paio', 'calabresa', 'toscana', 'alho', 'cebola', 
    'queijo', 'peru', 'peito', 'bovina', 'integral', 'desnatado', 'uht', 'leite'
  ];

  let bestMatchUrl: string | null = null;
  let bestScore = 0;

  for (const item of sitemapList) {
    const imgUrl = item.image_url || '';
    const url = item.url || '';
    if (!imgUrl) continue;

    const slug = url.split('/produto/').pop()?.split('/')[0]?.replace(/-/g, ' ') || '';
    const slugNorm = cleanTextForMatching(slug);
    const slugWords = new Set(slugNorm.split(/\s+/));
    const slugWeight = extractWeightsStr(slug);
    const slugNouns = getProductNounTags(slug + ' ' + imgUrl);

    // TRAVA ESTRITA DE SUBSTANTIVOS: se o produto possui tags primárias (ex: isca, tempura), a imagem DEVE possuir as mesmas tags
    if (titleNouns.size > 0) {
      let hasMatchingNoun = false;
      for (const tn of titleNouns) {
        if (slugNouns.has(tn)) {
          hasMatchingNoun = true;
          break;
        }
      }
      if (!hasMatchingNoun) {
        continue;
      }
    }

    if (titleWeight && slugWeight && titleWeight !== slugWeight) {
      continue;
    }

    let mismatch = false;
    for (const m of modifiers) {
      let inT = titleNorm.includes(m);
      let inS = slugNorm.includes(m);
      if (m === 'suina' || m === 'suino') {
        inT = titleNorm.includes('suin');
        inS = slugNorm.includes('suin');
      }
      if (inT !== inS) {
        mismatch = true;
        break;
      }
    }
    if (mismatch) continue;

    let overlap = 0;
    for (const w of titleWords) {
      if (slugWords.has(w)) overlap++;
    }

    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatchUrl = imgUrl;
    }
  }

  if (bestMatchUrl && bestScore >= 2) {
    return bestMatchUrl;
  }

  return null;
}

export async function runAuroraScraper() {
  console.log('[*] Iniciando ETL Scraper da Cooperativa Central Aurora Alimentos...');
  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
  }

  const sitemapList = await fetchLiveSitemap();
  const rawProducts = readLegacyDatabase();

  const now = new Date().toISOString();

  // 1. Fabricante mestre
  const fabricanteObj = {
    id: FABRICANTE_AURORA_ID,
    nome: FABRICANTE_AURORA_NOME,
    cnpj: '83.310.441/0001-06',
    site_oficial: 'https://www.auroraalimentos.com.br',
    ativo: true,
    criado_em: now
  };

  // 2. Coleta de Marcas e Produtos
  const marcasMap = new Map<string, any>();
  const produtosList: any[] = [];
  const codigosBarrasList: any[] = [];

  // Garante marca principal Aurora
  marcasMap.set('marca_aurora', {
    id: 'marca_aurora',
    fabricante_id: FABRICANTE_AURORA_ID,
    nome: 'Aurora',
    slug: 'aurora',
    descricao: 'Produtos da Cooperativa Central Aurora Alimentos',
    ativo: true,
    criado_em: now
  });

  let webImageMatchCount = 0;
  let localImageFallbackCount = 0;
  let pdfImageExtractCount = 0;

  for (const rawProd of rawProducts) {
    const rawTitle = rawProd.title || rawProd.descrFiscal || '';
    if (!rawTitle) continue;

    // Normalização de descrição e pesos
    const parsedText = formatProductDescription(rawTitle);

    // Classificação da Marca
    const brandInfo = classifyBrand(rawProd.marca || 'Aurora', rawTitle, FABRICANTE_AURORA_ID);
    if (!marcasMap.has(brandInfo.id)) {
      marcasMap.set(brandInfo.id, {
        id: brandInfo.id,
        fabricante_id: FABRICANTE_AURORA_ID,
        nome: brandInfo.nome,
        slug: brandInfo.slug,
        descricao: `Linha de produtos ${brandInfo.nome} da Cooperativa Aurora Alimentos`,
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

    const prodId = `prod_aurora_${rawProd.sku}`;

    // Determina URL de imagem e Fallback de Extração do PDF
    let finalImageUrl: string | null = null;
    let imageStatus: string = 'SEM_IMAGEM';

    const barcodePrimary = eanClean || dunClean || rawProd.sku;
    const localPreparedPath = `/root/projetos-scraping/scraping-aurora/imagens_preparadas/${barcodePrimary}.webp`;

    // 1. Tenta imagem estática local preparada primeiro (prioridade máxima por ser a embalagem exata do EAN)
    if (fs.existsSync(localPreparedPath)) {
      finalImageUrl = `/imagens_produtos/${barcodePrimary}.webp`;
      localImageFallbackCount++;
      imageStatus = 'VALIDATED';
    } else if (rawProd.image_url && rawProd.image_url.startsWith('http') && brandInfo.slug === 'aurora') {
      // 2. Se a URL do banco legado já for um link direto HTTP/HTTPS válido e for da marca Aurora
      finalImageUrl = rawProd.image_url;
      webImageMatchCount++;
      imageStatus = 'VALIDATED';
    } else if (brandInfo.slug === 'aurora') {
      // 3. Executa o algoritmo de cruzamento no sitemap da Aurora APENAS se a marca for Aurora
      const webMatch = findBestAuroraWebImage(rawProd.sku, rawTitle, sitemapList);
      if (webMatch) {
        finalImageUrl = webMatch;
        webImageMatchCount++;
        imageStatus = 'VALIDATED';
      }
    }

    // 4. Fallback PDF: se passou por Web e Local e AINDA NÃO possui imagem vinculada
    if (!finalImageUrl) {
      console.log(`[*] SKU ${rawProd.sku} (${rawTitle}) sem imagem vinculada. Invocando fallback de extração/adaptação do PDF...`);
      const pdfRes = extractAndAdaptAuroraPdfImage(rawProd.sku, barcodePrimary);
      if (pdfRes.success && pdfRes.image_path && fs.existsSync(pdfRes.image_path)) {
        finalImageUrl = `/imagens_produtos/${barcodePrimary}.webp`;
        imageStatus = 'PDF_EXTRACTED';
        pdfImageExtractCount++;
        console.log(`[+] Imagem extraída e tratada do PDF com sucesso para SKU ${rawProd.sku}.`);
      }
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

    // Código EAN-13
    if (eanClean) {
      codigosBarrasList.push({
        id: `cb_ean_${eanClean}`,
        produto_id: prodId,
        tipo: 'EAN-13',
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
        tipo: 'DUN-14',
        codigo: dunClean,
        embalagem: 'Caixa Comercial',
        quantidade_embalagem: null,
        criado_em: now
      });
    }
  }

  console.log(`[+] Imagens associadas: ${webImageMatchCount} via URLs Web diretas da Aurora, ${localImageFallbackCount} via fallback local, ${pdfImageExtractCount} extraídas/tratadas do PDF (ETL legado).`);

  const stagingData = {
    fabricantes: [fabricanteObj],
    marcas: Array.from(marcasMap.values()),
    produtos: produtosList,
    codigos_barras: codigosBarrasList
  };

  // Salva staging de IDs texto
  fs.writeFileSync(STAGING_FILE, JSON.stringify(stagingData, null, 2), 'utf-8');
  console.log(`[+] Staging textual gerado em ${STAGING_FILE}: ${produtosList.length} produtos, ${codigosBarrasList.length} códigos de barras.`);

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
    }))
  };

  fs.writeFileSync(STAGING_UUID_FILE, JSON.stringify(uuidStagingData, null, 2), 'utf-8');
  console.log(`[+] Staging UUIDv5 gerado em ${STAGING_UUID_FILE}`);

  return stagingData;
}

if (require.main === module) {
  runAuroraScraper().then(() => {
    console.log('[*] Processamento do Scraper da Aurora finalizado com sucesso!');
  }).catch(err => {
    console.error('[!] Falha ao executar Scraper da Aurora:', err);
  });
}
