/**
 * Scraper ETL BRF S.A. - Combined Multi-Source Extraction Pipeline
 * Autor: Antigravity - Engenheiro de Dados Sênior / Arquiteto PaletScan
 * 
 * Este módulo realiza a combinação completa de 4 fontes de dados da BRF S.A.:
 * 1. Portal B2B Central BRF (centralmbrf.com.br): Base oficial completa de SKUs e especificações técnicas de câmara fria.
 * 2. Catálogo Comercial PDF (catalogo_brf.pdf / brf_produtos_b2b.db): Enriquecimento de EAN-13 (Consumidor) e DUN-14 (Distribuição/Caixa).
 * 3. Portal Institucional Sadia (sadia.com.br): Fotografia HD atualizada de embalagens e produtos da marca Sadia.
 * 4. Portal Institucional Perdigão (perdigao.com.br): Fotografia HD atualizada de embalagens e produtos da marca Perdigão.
 * 
 * Regra de Fusão: A imagem HD moderna dos portais institucionais (Sadia/Perdigão) SOBRESCREVE a imagem antiga do B2B.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { formatProductDescription, normalizeEAN13, normalizeDUN14 } from '../../core/normalizers/text_parser.js';
import { classifyBrand, FABRICANTE_BRF_ID, FABRICANTE_BRF_NOME } from '../../core/heuristics/brand_classifier.js';
import { classifyProduct } from '../../core/heuristics/category_classifier.js';
import { downloadAndConvertOfficialWebp, MANUAL_SEM_IMAGEM_EANS, PWA_PUBLIC_IMG_DIR, LOCAL_PROCESSED_IMG_DIR } from '../../core/normalizers/image_helper.js';

// Constantes e Endpoints
const SADIA_SITEMAP = 'https://www.sadia.com.br/sitemap.xml';
const PERDIGAO_SITEMAP = 'https://www.perdigao.com.br/sitemap.xml';
const CENTRAL_BRF_SITEMAP = 'https://centralmbrf.com.br/sitemap-product-1.xml';

const PALETSCAN_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
};

const BASE_DIR = path.resolve(process.cwd());
const STAGING_DIR = path.join(BASE_DIR, 'staging');
const STAGING_FILE = path.join(STAGING_DIR, 'brf_staging.json');
const MBRF_CACHE_FILE = path.join(STAGING_DIR, 'mbrf_b2b_cache.json');

// Interface relacional compatível com schema_manifest.json
interface Fabricante {
  id: string;
  nome: string;
  cnpj: string | null;
  site_oficial: string | null;
  ativo: boolean;
  criado_em: string;
}

interface Marca {
  id: string;
  fabricante_id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  ativo: boolean;
  criado_em: string;
}

interface Produto {
  id: string;
  marca_id: string;
  descricao_padronizada: string;
  descricao_original: string;
  classe: string;
  conservacao: string;
  peso_gramas: number | null;
  fracionado: boolean;
  imagem_url: string | null;
  status_imagem: 'aprovado' | 'pendente_aprovacao' | 'sem_imagem';
  criado_em: string;
}

interface CodigoBarras {
  id: string;
  produto_id: string;
  tipo: 'SKU' | 'EAN' | 'DUN';
  codigo: string;
  embalagem: string | null;
  quantidade_embalagem: number | null;
  criado_em: string;
}

interface PendingImageApproval {
  produto_id: string;
  sku: string;
  descricao: string;
  placeholder_url: string;
}

interface StagingPayload {
  fabricantes: Fabricante[];
  marcas: Marca[];
  produtos: Produto[];
  codigos_barras: CodigoBarras[];
  pending_images_approval: PendingImageApproval[];
}

/**
 * Gera um UUIDv5 determinístico a partir de uma string de entrada e namespace estático.
 */
function generateUUID(namespace: string, name: string): string {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(name, 'utf8');
  const hash = crypto.createHash('sha1').update(Buffer.concat([nsBytes, nameBytes])).digest();

  hash[6] = (hash[6] & 0x0f) | 0x50; // versão 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variante RFC4122

  const hex = hash.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-');
}

/**
 * Helper para detectar URLs de imagens inválidas, quebradas ou páginas de erro 404 (Salesforce/HTML)
 */
function isInvalidImageUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  const lower = url.toLowerCase().trim();
  return (
    lower === '' ||
    lower === 'n/a' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower.includes('default-product-image') ||
    lower.includes('placeholder') ||
    lower.includes('brfsacoeintgrcprd') ||
    lower.includes('force.com') ||
    lower.includes('salesforce.com') ||
    lower.includes('servlet.imageserver')
  );
}

interface MBRFProductParsed {
  sku: string;
  ean: string;
  title: string;
  commercialName: string;
  marca: string;
  boxGrossWeight: string;
  boxNetWeight: string;
  packageQty: string;
  minTemp: string;
  maxTemp: string;
  expirationDays: string;
  url: string;
  imageUrl: string | null;
}

/**
 * Carrega a base oficial minerada da Central MBRF B2B via API Salesforce Commerce.
 */
function loadMBRFCatalog(): MBRFProductParsed[] {
  if (!fs.existsSync(MBRF_CACHE_FILE)) {
    console.log('[*] Cache B2B Central MBRF não encontrado. Disparando mineração automática via Python...');
    try {
      execSync('python3 /root/paletscan-etl/scripts/mine_mbrf_b2b.py', { stdio: 'inherit' });
    } catch (err: any) {
      console.warn(`[!] Falha ao executar minerador MBRF B2B: ${err.message}`);
      return [];
    }
  }

  if (!fs.existsSync(MBRF_CACHE_FILE)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(MBRF_CACHE_FILE, 'utf-8');
    const cache = JSON.parse(raw);
    const parsed: MBRFProductParsed[] = [];

    for (const [prodId, data] of Object.entries<any>(cache)) {
      if (!data) continue;
      const fields = data.fields || {};
      const rawSku = fields.StockKeepingUnitSKU__c || fields.ProductCode || '';
      const sku = String(rawSku).replace(/^0+/, '').trim();
      const rawEan = fields.EAN__c || '';
      const cleanEan = normalizeEAN13(String(rawEan).trim()) || '';
      const title = String(fields.Name || fields.Description || '').trim();
      const commercialName = String(fields.CommercialName__c || '').trim();
      const rawBrand = String(fields.Brand__c || '').split(';')[0].trim();

      // Resolve URL de imagem da Central MBRF
      let rawImg = data.defaultImage?.url || fields.PortalDetailImageUrl__c || '';
      let resolvedImg: string | null = null;
      if (rawImg) {
        if (rawImg.startsWith('/cms/delivery/media/')) {
          resolvedImg = `https://centralmbrf.com.br/sfsites/c${rawImg}`;
        } else if (rawImg.startsWith('/')) {
          resolvedImg = `https://centralmbrf.com.br${rawImg}`;
        } else if (rawImg.startsWith('http://') || rawImg.startsWith('https://')) {
          resolvedImg = rawImg;
        }
      }

      if (isInvalidImageUrl(resolvedImg)) {
        resolvedImg = null;
      }

      const displayUrl = fields.DisplayUrl || '';
      const prodUrl = displayUrl ? `https://centralmbrf.com.br/product/${displayUrl}` : '';

      parsed.push({
        sku,
        ean: cleanEan,
        title,
        commercialName,
        marca: rawBrand || 'Sadia',
        boxGrossWeight: fields.BoxGrossWeight__c ? String(fields.BoxGrossWeight__c) : '',
        boxNetWeight: fields.BoxNetWeight__c ? String(fields.BoxNetWeight__c) : '',
        packageQty: fields.PackageQuantity__c ? String(fields.PackageQuantity__c) : '',
        minTemp: fields.MinTemperature__c ? String(fields.MinTemperature__c) : '',
        maxTemp: fields.MaxTemperature__c ? String(fields.MaxTemperature__c) : '',
        expirationDays: fields.ExpirationDate__c ? String(fields.ExpirationDate__c) : '',
        url: prodUrl,
        imageUrl: resolvedImg
      });
    }

    console.log(`📦 Catálogo B2B Central MBRF carregado com ${parsed.length} itens do cache.`);
    return parsed;
  } catch (err: any) {
    console.error(`[!] Erro ao ler cache B2B MBRF: ${err.message}`);
    return [];
  }
}

/**
 * Carrega a base consolidada de produtos BRF a partir do staging interno do repositório
 */
function loadBaselineProducts(): any[] {
  if (!fs.existsSync(STAGING_FILE)) {
    console.warn(`[!] Arquivo de staging BRF não encontrado em ${STAGING_FILE}.`);
    return [];
  }

  try {
    const rawContent = fs.readFileSync(STAGING_FILE, 'utf-8');
    const staging = JSON.parse(rawContent);
    if (!staging.produtos || !Array.isArray(staging.produtos)) {
      return [];
    }

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

    const items: any[] = [];
    for (const p of staging.produtos) {
      const cbs = cbsByProduct.get(p.id) || {};
      items.push({
        sku: cbs.sku || '',
        title: p.descricao_original || p.descricao_padronizada || '',
        descrFiscal: p.descricao_original || '',
        ean: cbs.ean || '',
        dun: cbs.dun || '',
        marca: marcasMap.get(p.marca_id) || 'Sadia',
        classe: p.classe || '',
        conservacao: p.conservacao || '',
        tempMin: '',
        tempMax: '',
        pesoLiquido: p.peso_gramas ? `${p.peso_gramas}g` : '',
        pesoBruto: '',
        vidaUtil: '',
        url: '',
        image_url: p.imagem_url || '',
        source: 'BRF_STAGING'
      });
    }

    console.log(`📦 Base BRF consolidada interna carregada com ${items.length} produtos do staging.`);
    return items;
  } catch (err: any) {
    console.error(`[!] Erro ao ler staging interno BRF: ${err.message}`);
    return [];
  }
}

/**
 * Obtém URLs do sitemap XML institucional (Sadia / Perdigão).
 */
async function fetchSitemapUrls(sitemapUrl: string, domainName: string): Promise<string[]> {
  console.log(`📡 Baixando sitemap oficial ${domainName}: ${sitemapUrl}`);
  try {
    const res = await fetch(sitemapUrl, { headers: HTTP_HEADERS });
    if (!res.ok) {
      console.warn(`[!] Erro ao baixar sitemap do ${domainName}: HTTP ${res.status}`);
      return [];
    }

    const xmlText = await res.text();
    const locs = xmlText.match(/<loc>([^<]+)<\/loc>/g) || [];
    const prodUrls: string[] = [];

    for (const loc of locs) {
      const u = loc.replace(/<\/?loc>/g, '').trim();
      if (u.includes('/produtos/')) {
        // Ignora URLs que não representam produtos finais (categorias, receitas, etc.)
        if (u.includes('/categoria/') || u.includes('/receitas/') || u.includes('/dicas/') || u.includes('/linha/')) {
          continue;
        }
        const parts = u.replace('https://', '').split('/').filter(Boolean);
        if (parts.length >= 4) {
          prodUrls.push(u);
        }
      }
    }

    console.log(`✅ Total de ${prodUrls.length} URLs de produtos encontradas no sitemap do ${domainName}.`);
    return prodUrls;
  } catch (err) {
    console.warn(`[!] Falha ao obter sitemap do ${domainName}: ${err}`);
    return [];
  }
}

/**
 * Extrai dados da página institucional (Sadia / Perdigão): Título, EAN e Imagem HD da embalagem.
 */
async function scrapeInstitutionalPage(url: string, marcaNome: string): Promise<{ title: string; image_url: string; ean: string; url: string } | null> {
  try {
    const res = await fetch(url, { headers: HTTP_HEADERS });
    if (!res.ok) return null;

    const html = await res.text();

    // 1. Título
    let title = '';
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    if (ogTitleMatch) {
      title = ogTitleMatch[1];
    } else {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1];
    }

    // Clean brand name prefix/suffix (e.g. "Sadia - Pizza..." or "... - Sadia")
    title = title
      .replace(/^(Sadia|Perdigão|Perdigao)\s*[-|]\s*/i, '')
      .replace(/\s*[-|]\s*(Sadia|Perdigão|Perdigao)$/i, '')
      .trim();

    // 2. Imagem HD da embalagem real do produto
    let image_url = '';

    // Prioridade A: Container da foto oficial do produto (ex: <figure class="photo-product"> ou class="product-pack")
    const photoContainerMatch = html.match(/<figure[^>]*class=["'][^"']*(photo-product|product-pack|product-photo|product-image)[^"']*["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i);
    if (photoContainerMatch && photoContainerMatch[2]) {
      image_url = photoContainerMatch[2];
    }

    // Prioridade B: Tag <img> apontando para diretório de produtos (/products/ ou /assets/images/_/products/)
    if (!image_url) {
      const prodImgMatch = html.match(/<img[^>]*src=["']([^"']*(?:\/products\/|\/product\/|assets\/images\/_\/products\/)[^"']+)["']/i);
      if (prodImgMatch) image_url = prodImgMatch[1];
    }

    // Prioridade C: alt="imagem do produto..."
    if (!image_url) {
      const imgAltMatch = html.match(/<img[^>]*alt=["'][^"']*imagem do produto:[^"']*["'][^>]*src=["']([^"']+)["']/i);
      if (imgAltMatch) image_url = imgAltMatch[1];
    }

    // Prioridade D: og:image (Apenas se NÃO for um banner genérico de compartilhamento do site como /storage/product/files/ ou share.jpg)
    if (!image_url) {
      const ogImgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      if (ogImgMatch) {
        const ogVal = ogImgMatch[1];
        if (!ogVal.includes('/storage/product/files/') && !ogVal.includes('share.jpg') && !ogVal.includes('logo')) {
          image_url = ogVal;
        }
      }
    }

    // Formatação de URL absoluta caso seja relativa
    if (image_url) {
      if (image_url.startsWith('//')) {
        image_url = `https:${image_url}`;
      } else if (image_url.startsWith('/')) {
        const origin = new URL(url).origin;
        image_url = `${origin}${image_url}`;
      } else if (!image_url.startsWith('http://') && !image_url.startsWith('https://')) {
        const origin = new URL(url).origin;
        image_url = `${origin}/${image_url}`;
      }
    }

    // 3. EAN (Prioriza tag oficial sku-ean ou data-zaply-product-gtin antes de regex geral)
    const skuEanTag = html.match(/<span[^>]*class=["'][^"']*sku-ean[^"']*["'][^>]*>[\s\S]*?\b(789\d{10})\b[\s\S]*?<\/span>/i);
    const zaplyGtin = html.match(/data-zaply-product-gtin=["'](789\d{10})["']/i);
    const eanMatches = html.match(/\b789\d{10}\b/g);
    const ean = skuEanTag ? skuEanTag[1] : (zaplyGtin ? zaplyGtin[1] : (eanMatches ? eanMatches[0] : ''));

    if (!title || !image_url) return null;

    return { title, image_url, ean, url };
  } catch (err) {
    return null;
  }
}

function extractUnitWeightStr(text: string): string | null {
  if (!text) return null;
  const m = text.toLowerCase().match(/\b(\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l))\b/);
  return m ? m[1].replace(/\s+/g, '').replace(',', '.') : null;
}

/**
 * Função principal de orquestração ETL BRF combinando as 4 fontes de dados.
 */
export async function runBRFScraper(): Promise<StagingPayload> {
  console.log('🚀 Iniciando Pipeline ETL BRF (Combinação Multi-Fonte: B2B MBRF, PDF, Sadia e Perdigão)...');

  // 1. Carrega a base B2B consolidada interna a partir do staging
  const legacyRows = loadBaselineProducts();
  console.log(`📦 Base B2B MBRF carregada com ${legacyRows.length} registros.`);

  // Consulta o sitemap oficial B2B Central MBRF para monitoramento de catálogo ativo
  try {
    const mbrfRes = await fetch(CENTRAL_BRF_SITEMAP, { headers: HTTP_HEADERS });
    if (mbrfRes.ok) {
      const mbrfXml = await mbrfRes.text();
      const mbrfLocs = mbrfXml.match(/<loc>([^<]+)<\/loc>/g) || [];
      console.log(`📡 Sitemap B2B Central MBRF verificado ao vivo: ${mbrfLocs.length} URLs ativas.`);
    }
  } catch {
    // continua
  }

  // Dicionário de produtos unificados indexados por EAN, SKU e Título
  const productMapByEan = new Map<string, any>();
  const productMapBySku = new Map<string, any>();
  const productMapByTitle = new Map<string, any>();

  for (const row of legacyRows) {
    const item = {
      sku: String(row.sku || '').trim(),
      title: String(row.title || '').trim(),
      descrFiscal: String(row.descrFiscal || '').trim(),
      ean: normalizeEAN13(row.ean || '') || '',
      dun: normalizeDUN14(row.dun || '', normalizeEAN13(row.ean || '') || '') || '',
      marca: String(row.marca || '').trim(),
      classe: String(row.classe || '').trim(),
      conservacao: String(row.conservacao || '').trim(),
      tempMin: String(row.tempMin || '').trim(),
      tempMax: String(row.tempMax || '').trim(),
      pesoLiquido: String(row.pesoLiquido || '').trim(),
      pesoBruto: String(row.pesoBruto || '').trim(),
      vidaUtil: String(row.vidaUtil || '').trim(),
      url: String(row.url || '').trim(),
      image_url: String(row.image_url || '').trim(),
      source: 'MBRF_B2B'
    };

    if (item.sku) productMapBySku.set(item.sku, item);
    if (item.ean) productMapByEan.set(item.ean, item);
    if (item.title) productMapByTitle.set(item.title.toLowerCase(), item);
  }

  // 2. Mineração e Fusão com Catálogo B2B Central MBRF (Fase 2)
  console.log('🏭 Integrando dados enriquecidos da Central MBRF B2B (EANs, DUNs, caixas master, temperatura)...');
  const mbrfItems = loadMBRFCatalog();
  let mbrfEnrichedCount = 0;
  let mbrfEanResolvedCount = 0;
  let mbrfDiscoveredCount = 0;
  const discoveredProductsLog: any[] = [];

  for (const mbrfItem of mbrfItems) {
    const cleanEan = mbrfItem.ean;
    const sku = mbrfItem.sku;

    let existingItem: any = null;
    if (sku && productMapBySku.has(sku)) {
      existingItem = productMapBySku.get(sku);
    } else if (mbrfItem.title && productMapByTitle.has(mbrfItem.title.toLowerCase())) {
      existingItem = productMapByTitle.get(mbrfItem.title.toLowerCase());
    } else if (cleanEan && productMapByEan.has(cleanEan)) {
      const cand = productMapByEan.get(cleanEan);
      if (!cand.sku || cand.sku === sku) {
        existingItem = cand;
      }
    }

    if (existingItem) {
      mbrfEnrichedCount++;
      // A) Resgata EAN oficial se o registro existente não possuía
      if (!existingItem.ean && cleanEan) {
        existingItem.ean = cleanEan;
        if (!productMapByEan.has(cleanEan)) {
          productMapByEan.set(cleanEan, existingItem);
        }
        mbrfEanResolvedCount++;
      }
      // B) Resgata / calcula DUN-14 se não possuía
      if (!existingItem.dun && existingItem.ean) {
        existingItem.dun = normalizeDUN14('', existingItem.ean);
      }
      // C) Peso Bruto e Líquido da Caixa Master B2B
      if (mbrfItem.boxGrossWeight && !existingItem.pesoBruto) {
        existingItem.pesoBruto = `${mbrfItem.boxGrossWeight}kg`;
      }
      if (mbrfItem.boxNetWeight && !existingItem.pesoLiquido) {
        existingItem.pesoLiquido = `${mbrfItem.boxNetWeight}kg`;
      }
      // D) Condições térmicas de estocagem em câmara fria
      if (mbrfItem.minTemp && !existingItem.tempMin) {
        existingItem.tempMin = mbrfItem.minTemp;
      }
      if (mbrfItem.maxTemp && !existingItem.tempMax) {
        existingItem.tempMax = mbrfItem.maxTemp;
      }
      // E) Prazo de validade
      if (mbrfItem.expirationDays && !existingItem.vidaUtil) {
        existingItem.vidaUtil = `${mbrfItem.expirationDays} dias`;
      }
      // F) Imagem: se o item existente estiver sem foto, aproveita a foto oficial da caixa B2B
      if (!existingItem.image_url && mbrfItem.imageUrl) {
        existingItem.image_url = mbrfItem.imageUrl;
      }
    } else {
      // Descoberta ativa de novo produto comercial B2B na Central MBRF
      // Garantia estrita de integridade: aceita APENAS produtos com EAN-13 numérico válido
      if (!cleanEan || !/^\d{13}$/.test(cleanEan)) continue;
      if (productMapByEan.has(cleanEan)) continue;

      const brandInfo = classifyBrand(mbrfItem.marca, mbrfItem.title, FABRICANTE_BRF_ID);
      const cleanDun = normalizeDUN14('', cleanEan);
      const conservacao = mbrfItem.minTemp && Number(mbrfItem.minTemp) <= -12 ? 'Congelado' : 'Resfriado';

      const newItem = {
        sku: sku,
        title: mbrfItem.commercialName || mbrfItem.title,
        descrFiscal: mbrfItem.title,
        ean: cleanEan,
        dun: cleanDun,
        marca: brandInfo.nome,
        classe: '',
        conservacao: conservacao,
        tempMin: mbrfItem.minTemp || '',
        tempMax: mbrfItem.maxTemp || '',
        pesoLiquido: mbrfItem.boxNetWeight ? `${mbrfItem.boxNetWeight}kg` : '',
        pesoBruto: mbrfItem.boxGrossWeight ? `${mbrfItem.boxGrossWeight}kg` : '',
        vidaUtil: mbrfItem.expirationDays ? `${mbrfItem.expirationDays} dias` : '',
        url: mbrfItem.url || '',
        image_url: mbrfItem.imageUrl || '',
        source: 'CENTRAL_MBRF_B2B',
        isNewDiscovery: true
      };

      if (sku) productMapBySku.set(sku, newItem);
      if (cleanEan && !productMapByEan.has(cleanEan)) {
        productMapByEan.set(cleanEan, newItem);
      }
      if (newItem.title) productMapByTitle.set(newItem.title.toLowerCase(), newItem);

      mbrfDiscoveredCount++;
      discoveredProductsLog.push({
        ean: cleanEan,
        sku: sku,
        marca: brandInfo.nome,
        descricao: newItem.title,
        origem: 'CENTRAL_MBRF_B2B',
        url: newItem.url,
        image_url: newItem.image_url,
        descoberto_em: new Date().toISOString()
      });
    }
  }

  console.log(`✅ Mineração Central MBRF concluída: ${mbrfEnrichedCount} produtos enriquecidos, ${mbrfEanResolvedCount} EANs resgatados e ${mbrfDiscoveredCount} novos produtos descobertos.`);

  // 3. Scraping das Fontes Institucionais HD (Sadia e Perdigão) para atualizar imagens e verificar gramaturas
  console.log('📸 Coletando fotografias HD e especificações atualizadas dos sites institucionais Sadia e Perdigão...');
  const sadiaUrls = await fetchSitemapUrls(SADIA_SITEMAP, 'Sadia');
  const perdigaoUrls = await fetchSitemapUrls(PERDIGAO_SITEMAP, 'Perdigão');

  const instTasks = [
    ...sadiaUrls.map(u => ({ url: u, marca: 'Sadia' })),
    ...perdigaoUrls.map(u => ({ url: u, marca: 'Perdigão' }))
  ];

  console.log(`🔄 Processando ${instTasks.length} páginas de produtos institucionais...`);

  let updatedImagesCount = 0;
  let updatedDescriptionsCount = 0;
  let newDiscoveredCount = 0;

  const batchSize = 15;
  for (let i = 0; i < instTasks.length; i += batchSize) {
    if (i % 60 === 0) {
      console.log(`⏳ Progresso HD: [${i}/${instTasks.length}] | Imagens Atualizadas: ${updatedImagesCount} | Descobertas: ${newDiscoveredCount}`);
    }

    const batch = instTasks.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(t => scrapeInstitutionalPage(t.url, t.marca).then(d => ({ task: t, instData: d }))));

    for (const { task, instData } of results) {
      if (!instData) continue;

      let existingItem: any = null;
      if (instData.ean && productMapByEan.has(instData.ean)) {
        existingItem = productMapByEan.get(instData.ean);
      } else if (instData.title && productMapByTitle.has(instData.title.toLowerCase())) {
        existingItem = productMapByTitle.get(instData.title.toLowerCase());
      }

      if (existingItem) {
        if (instData.image_url && instData.image_url !== 'N/A') {
          existingItem.image_url = instData.image_url;
          existingItem.hd_source = task.marca;
          updatedImagesCount++;
        }
        if (!existingItem.ean && instData.ean) {
          const cleanEan = normalizeEAN13(instData.ean);
          if (cleanEan) existingItem.ean = cleanEan;
        }
        // Verifica se houve alteração de gramatura unitária no portal oficial (preservando sufixo B2B -Caixa)
        if (instData.ean && existingItem.ean === instData.ean && instData.title) {
          const liveUnitWeight = extractUnitWeightStr(instData.title);
          const boxParts = String(existingItem.title || '').split(/\s*-?\s*Caixa\b/i);
          const unitPrefix = boxParts[0] || '';
          const exUnitWeight = extractUnitWeightStr(unitPrefix);
          if (liveUnitWeight && exUnitWeight && liveUnitWeight !== exUnitWeight) {
            const newPrefix = unitPrefix.replace(/\b\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)\b/i, liveUnitWeight.replace('.', ','));
            existingItem.title = newPrefix + String(existingItem.title || '').slice(unitPrefix.length);
            existingItem.descrFiscal = existingItem.title;
            updatedDescriptionsCount++;
          }
        }
      } else {
        // Descoberta ativa de novo lançamento comercial (Sadia / Perdigão)
        const cleanEan = normalizeEAN13(instData.ean);
        // Garantia de integridade estrita: só aceita produtos com EAN-13 numérico válido
        if (!cleanEan || !/^\d{13}$/.test(cleanEan)) continue;
        if (productMapByEan.has(cleanEan)) continue;

        const brandName = task.marca || (instData.url.includes('perdigao') ? 'Perdigão' : 'Sadia');
        const unitWeight = extractUnitWeightStr(instData.title) || '';

        const newItem = {
          sku: '',
          title: instData.title,
          descrFiscal: instData.title,
          ean: cleanEan,
          dun: '',
          marca: brandName,
          classe: '',
          conservacao: '',
          tempMin: '',
          tempMax: '',
          pesoLiquido: unitWeight,
          pesoBruto: '',
          vidaUtil: '',
          url: instData.url,
          image_url: instData.image_url || '',
          source: `DISCOVERY_${brandName.toUpperCase()}`,
          isNewDiscovery: true
        };

        productMapByEan.set(cleanEan, newItem);
        if (newItem.title) {
          productMapByTitle.set(newItem.title.toLowerCase(), newItem);
        }
        newDiscoveredCount++;
        discoveredProductsLog.push({
          ean: cleanEan,
          marca: brandName,
          descricao: newItem.title,
          url: newItem.url,
          image_url: newItem.image_url,
          descoberto_em: new Date().toISOString()
        });
      }
    }
  }

  console.log(`✅ Fusão concluída! ${updatedImagesCount} produtos com imagem HD atualizada, ${updatedDescriptionsCount} descrições ajustadas e ${newDiscoveredCount} novos produtos descobertos.`);

  // 3. Montagem da estrutura relacional padronizada para o PaletScan ETL
  const fabricantesMap = new Map<string, Fabricante>();
  const marcasMap = new Map<string, Marca>();
  const produtosMap = new Map<string, Produto>();
  const codigosBarrasMap = new Map<string, CodigoBarras>();
  const pendingImagesApproval: PendingImageApproval[] = [];

  // Registrar Holding BRF S.A.
  fabricantesMap.set(FABRICANTE_BRF_ID, {
    id: FABRICANTE_BRF_ID,
    nome: FABRICANTE_BRF_NOME,
    cnpj: '01.619.904/0001-12',
    site_oficial: 'https://www.brf-global.com',
    ativo: true,
    criado_em: new Date().toISOString()
  });

  // Consolidação segura: união de produtos indexados por SKU e produtos descobertos por EAN
  const allCombinedItemsMap = new Map<string, any>();
  for (const item of productMapBySku.values()) {
    const key = item.sku || item.ean || item.title;
    if (key) allCombinedItemsMap.set(key, item);
  }
  for (const item of productMapByEan.values()) {
    const key = item.sku || item.ean || item.title;
    if (key) allCombinedItemsMap.set(key, item);
  }
  const allCombinedItems = Array.from(allCombinedItemsMap.values());

  // Download e conversão assíncrona para WebP das imagens oficiais ainda não processadas
  const itemsToDownload = allCombinedItems.filter(rawItem => {
    const barcode = rawItem.ean || rawItem.dun || rawItem.sku;
    if (!barcode || MANUAL_SEM_IMAGEM_EANS.has(barcode)) return false;
    const localPwa = path.join(PWA_PUBLIC_IMG_DIR, `${barcode}.webp`);
    const localProc = path.join(LOCAL_PROCESSED_IMG_DIR, `${barcode}.webp`);
    if (fs.existsSync(localPwa) || fs.existsSync(localProc)) return false;
    return rawItem.image_url && !isInvalidImageUrl(rawItem.image_url) && rawItem.image_url.startsWith('http');
  });

  if (itemsToDownload.length > 0) {
    console.log(`🖼️  Baixando e convertendo ${itemsToDownload.length} imagens oficiais BRF para WebP...`);
    const IMG_CONCURRENCY = 5;
    let convertedImgs = 0;
    for (let i = 0; i < itemsToDownload.length; i += IMG_CONCURRENCY) {
      const chunk = itemsToDownload.slice(i, i + IMG_CONCURRENCY);
      await Promise.all(chunk.map(async item => {
        const barcode = item.ean || item.dun || item.sku;
        try {
          const ok = await downloadAndConvertOfficialWebp(item.image_url, barcode);
          if (ok) convertedImgs++;
        } catch {}
      }));
    }
    console.log(`✅ Otimização de mídia concluída: ${convertedImgs} novas fotos WebP salvas em disco.`);
  }

  for (const rawItem of allCombinedItems) {
    // Classificação da Marca
    const brandInfo = classifyBrand(rawItem.marca, rawItem.title, FABRICANTE_BRF_ID);
    if (!marcasMap.has(brandInfo.id)) {
      marcasMap.set(brandInfo.id, {
        id: brandInfo.id,
        fabricante_id: brandInfo.fabricante_id,
        nome: brandInfo.nome,
        slug: brandInfo.slug,
        descricao: `Linha de produtos ${brandInfo.nome} pertenente à BRF S.A.`,
        ativo: true,
        criado_em: new Date().toISOString()
      });
    }

    // Normalização de Texto e Pesos
    const parsedText = formatProductDescription(rawItem.title);
    const classification = classifyProduct(rawItem.title, rawItem.classe, rawItem.conservacao);

    // ID Determinístico do Produto via UUIDv5
    const anchorId = rawItem.sku || rawItem.ean || rawItem.title;
    const produtoId = generateUUID(PALETSCAN_NAMESPACE, `BRF_PROD_${anchorId}`);

    // Tratamento de Imagem: apenas caminhos locais locais são aprovados, evitando URLs externas terceiras
    let imagem_url: string | null = null;
    let status_imagem: 'aprovado' | 'pendente_aprovacao' | 'sem_imagem' = 'sem_imagem';

    const primaryBarcode = rawItem.ean || rawItem.dun || rawItem.sku;
    const localPwa = primaryBarcode ? path.join(PWA_PUBLIC_IMG_DIR, `${primaryBarcode}.webp`) : '';
    const localProc = primaryBarcode ? path.join(LOCAL_PROCESSED_IMG_DIR, `${primaryBarcode}.webp`) : '';

    if (primaryBarcode && MANUAL_SEM_IMAGEM_EANS.has(primaryBarcode)) {
      imagem_url = null;
      status_imagem = 'sem_imagem';
    } else if (fs.existsSync(localPwa) || fs.existsSync(localProc)) {
      imagem_url = `/imagens_produtos/${primaryBarcode}.webp`;
      status_imagem = 'aprovado';
    } else {
      imagem_url = null;
      status_imagem = 'sem_imagem';
    }

    // Grava Registro do Produto
    produtosMap.set(produtoId, {
      id: produtoId,
      marca_id: brandInfo.id,
      descricao_padronizada: parsedText.formatted_description,
      descricao_original: rawItem.title,
      classe: classification.classe,
      conservacao: classification.conservacao,
      peso_gramas: parsedText.peso_gramas,
      fracionado: parsedText.fracionado,
      imagem_url,
      status_imagem,
      criado_em: new Date().toISOString()
    });

    // Grava Códigos de Barras (SKU, EAN-13, DUN-14)
    if (rawItem.sku) {
      const skuId = generateUUID(PALETSCAN_NAMESPACE, `BRF_SKU_${rawItem.sku}`);
      codigosBarrasMap.set(skuId, {
        id: skuId,
        produto_id: produtoId,
        tipo: 'SKU',
        codigo: rawItem.sku,
        embalagem: null,
        quantidade_embalagem: null,
        criado_em: new Date().toISOString()
      });
    }

    if (rawItem.ean) {
      const eanId = generateUUID(PALETSCAN_NAMESPACE, `BRF_EAN_${rawItem.ean}`);
      codigosBarrasMap.set(eanId, {
        id: eanId,
        produto_id: produtoId,
        tipo: 'EAN',
        codigo: rawItem.ean,
        embalagem: 'Unidade Consumidor',
        quantidade_embalagem: 1,
        criado_em: new Date().toISOString()
      });
    }

    if (rawItem.dun) {
      const dunId = generateUUID(PALETSCAN_NAMESPACE, `BRF_DUN_${rawItem.dun}`);
      codigosBarrasMap.set(dunId, {
        id: dunId,
        produto_id: produtoId,
        tipo: 'DUN',
        codigo: rawItem.dun,
        embalagem: 'Caixa / Distribuição',
        quantidade_embalagem: null,
        criado_em: new Date().toISOString()
      });
    }
  }

  const payload: StagingPayload = {
    fabricantes: Array.from(fabricantesMap.values()),
    marcas: Array.from(marcasMap.values()),
    produtos: Array.from(produtosMap.values()),
    codigos_barras: Array.from(codigosBarrasMap.values()),
    pending_images_approval: pendingImagesApproval
  };

  // Proteção de integridade: nunca sobrescreve o staging se o total de produtos for zero
  if (payload.produtos.length === 0) {
    console.warn(`[!] Aviso de segurança: O scraper BRF produziu 0 produtos. Staging preservado.`);
    return payload;
  }

  // Garante que o diretório staging existe e escreve o JSON
  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
  }

  fs.writeFileSync(STAGING_FILE, JSON.stringify(payload, null, 2), 'utf-8');

  // Grava relatório de novos produtos BRF descobertos nesta execução
  const BRF_DISCOVERY_LOG = path.join(STAGING_DIR, 'brf_novos_produtos_descobertos.json');
  if (discoveredProductsLog.length > 0) {
    fs.writeFileSync(BRF_DISCOVERY_LOG, JSON.stringify(discoveredProductsLog, null, 2), 'utf-8');
    console.log(`✨ Relatório de novos produtos descobertos salvo em: ${BRF_DISCOVERY_LOG} (${discoveredProductsLog.length} itens).`);

    // Atualiza o registro histórico global de novos produtos
    const globalLogPath = path.join(STAGING_DIR, 'novos_produtos_log.json');
    let globalLog: any[] = [];
    if (fs.existsSync(globalLogPath)) {
      try {
        const content = fs.readFileSync(globalLogPath, 'utf-8');
        globalLog = JSON.parse(content);
        if (!Array.isArray(globalLog)) globalLog = [];
      } catch {}
    }
    const existingGlobalEans = new Set(globalLog.map(g => g.ean || g.codigo));
    for (const item of discoveredProductsLog) {
      if (!existingGlobalEans.has(item.ean)) {
        globalLog.push(item);
      }
    }
    fs.writeFileSync(globalLogPath, JSON.stringify(globalLog, null, 2), 'utf-8');
  }
  console.log(`\n🎉 Pipeline ETL BRF concluído com sucesso! Payload salvo em: ${STAGING_FILE}`);
  console.log(`📊 Estatísticas da Carga:`);
  console.log(`   - Total de Produtos: ${payload.produtos.length}`);
  console.log(`   - Marcas Cadastradas: ${payload.marcas.length}`);
  console.log(`   - Códigos de Barras (SKU/EAN/DUN): ${payload.codigos_barras.length}`);
  console.log(`   - Imagens Pendentes de Aprovação: ${payload.pending_images_approval.length}`);

  return payload;
}

// Execução direta via CLI se chamado diretamente
if (require.main === module) {
  runBRFScraper().catch(err => {
    console.error('💥 Erro fatal ao rodar scraper BRF:', err);
    process.exit(1);
  });
}
