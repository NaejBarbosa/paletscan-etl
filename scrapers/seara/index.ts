/**
 * Scraper ETL Seara B2B & B2C - Web Extraction Direta em Tempo Real
 * Autor: Engenheiro de Dados Sênior / Arquiteto PaletScan
 * 
 * Este módulo realiza:
 * 1. Web scraping 100% ao vivo via sitemaps XML oficiais da Seara (searafoodsolutions.com.br & www.seara.com.br).
 * 2. Requisições HTTP concorrentes para extração B2B (DataLayer JS) e B2C (HTML Microdados).
 * 3. Extração de SKU, Título, EAN, DUN, Marca (Seara, Seara Gourmet, Hans, Eder, Incrível!, Rezende, DaGranja), Classe e Foto HD.
 * 4. Normalização de texto PT-BR, peso_gramas, detecção de peso variável/fracionado e filtro de imagens inválidas.
 * 5. Geração do payload relacional normatizado em staging/seara_staging.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { formatProductDescription, normalizeEAN13, normalizeDUN14 } from '../../core/normalizers/text_parser.js';
import { classifyBrand, FABRICANTE_FRIBOI_ID, FABRICANTE_FRIBOI_NOME } from '../../core/heuristics/brand_classifier.js';
import { classifyProduct } from '../../core/heuristics/category_classifier.js';

// Endpoints ao vivo da Seara (B2B + B2C)
const B2B_SITEMAP_URL = 'https://www.searafoodsolutions.com.br/product-sitemap.xml';
const B2C_SITEMAP_URL = 'https://www.seara.com.br/produto-sitemap.xml';

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
};

const BASE_DIR = path.resolve(process.cwd());
const STAGING_DIR = path.join(BASE_DIR, 'staging');
const STAGING_FILE = path.join(STAGING_DIR, 'seara_staging.json');

interface RawSearaProduct {
  sku: string;
  title: string;
  descrFiscal?: string;
  ean?: string;
  dun?: string;
  marca?: string;
  classe?: string;
  conservacao?: string;
  pesoLiquido?: string;
  image_url?: string;
}

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
  status_imagem: string;
  criado_em: string;
}

interface CodigoBarras {
  id: string;
  produto_id: string;
  tipo: string;
  codigo: string;
  embalagem: string | null;
  quantidade_embalagem: number | null;
  criado_em: string;
}

// Filtra URLs de imagens inválidas ou quebradas
function isInvalidImageUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  const lower = url.toLowerCase().trim();
  return (
    lower === '' ||
    lower === 'undefined' ||
    lower === 'null' ||
    lower === 'n/a' ||
    lower.includes('placeholder') ||
    lower.includes('no-image') ||
    lower.includes('logo') ||
    lower.includes('icon') ||
    lower.includes('force.com') ||
    lower.includes('salesforce.com')
  );
}

// Parse de peso em gramas
function parsePesoGramas(pesoStr?: string, title?: string): number | null {
  const text = `${pesoStr || ''} ${title || ''}`.toLowerCase();
  const match = text.match(/(\d+[\.,]?\d*)\s*(kg|g)\b/i);
  if (match) {
    const val = parseFloat(match[1].replace(',', '.'));
    const unit = match[2].toLowerCase();
    return unit === 'kg' ? Math.round(val * 1000) : Math.round(val);
  }
  return null;
}

// Concorrência simples para fetch HTTP
async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: HTTP_HEADERS, signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return '';
    return await response.text();
  } catch {
    clearTimeout(timeout);
    return '';
  }
}

// Coleta URLs do sitemap XML
async function extractUrlsFromSitemap(sitemapUrl: string): Promise<string[]> {
  console.log(`🌐 Baixando sitemap oficial: ${sitemapUrl}`);
  const xml = await fetchWithTimeout(sitemapUrl, 12000);
  if (!xml) return [];
  const locs = Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g)).map(m => m[1].trim());
  return locs.filter(url => url.startsWith('http'));
}

// Extrai metadados B2B da Seara Food Solutions
function parseSearaB2BPage(html: string, pageUrl: string): RawSearaProduct | null {
  if (!html) return null;

  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/&#8211;/g, '-').trim() : '';
  if (!title) return null;

  const postIdMatch = html.match(/"post_id"\s*:\s*(\d+)/);
  let sku = postIdMatch ? postIdMatch[1] : '';
  if (!sku) {
    const skuMatch = pageUrl.match(/\/produto\/([^\/]+)/);
    sku = skuMatch ? skuMatch[1] : title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  let ean = '';
  let dun = '';
  const eanMatch = html.match(/EAN13?\s*:\s*([\d\.]+)/i);
  if (eanMatch) ean = eanMatch[1].replace(/\./g, '');

  const dunMatch = html.match(/DUN14?\s*:\s*([\d\.]+)/i);
  if (dunMatch) dun = dunMatch[1].replace(/\./g, '');

  const marcaMatch = html.match(/"marca"\s*:\s*\["([^"]+)"\]/);
  const catMatch = html.match(/"category"\s*:\s*\["([^"]+)"\]/);
  let marca = marcaMatch ? marcaMatch[1] : 'Seara';
  let classe = catMatch ? catMatch[1] : 'Aves';

  const imgMatch = html.match(/<img[^>]+src="([^"]*searafoodsolutions\.com\.br\/files\/[^"]+)"/i);
  let imageUrl = imgMatch ? imgMatch[1] : '';

  const conservacao = (html.includes('Congelado') || title.includes('Congelad')) ? 'Congelado' : 'Resfriado';

  return {
    sku,
    title,
    descrFiscal: title,
    ean,
    dun,
    marca,
    classe,
    conservacao,
    pesoLiquido: '',
    image_url: imageUrl
  };
}

// Extrai metadados B2C do portal Seara (www.seara.com.br)
function parseSearaB2CPage(html: string, pageUrl: string): RawSearaProduct | null {
  if (!html) return null;

  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/s) || html.match(/<title>(.*?)<\/title>/s);
  let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/&#8211;/g, '-').replace(/\s*-\s*Seara\s*$/i, '').trim() : '';

  if (!title) return null;

  let ean = '';
  const eanMatch1 = html.match(/data-ean="(\d{13})"/i) || html.match(/data-dl-product_ean="(\d{13})"/i);
  if (eanMatch1) {
    ean = eanMatch1[1];
  } else {
    const eanMatch2 = html.match(/\b789\d{10}\b/);
    if (eanMatch2) ean = eanMatch2[0];
  }

  let imageUrl = '';
  const imgMatch1 = html.match(/data-product-image="([^"]+)"/i);
  if (imgMatch1) {
    imageUrl = imgMatch1[1];
  } else {
    const imgMatch2 = html.match(/<img[^>]+src="([^"]*seara\.com\.br\/wp-content\/uploads\/[^"]+)"/i);
    if (imgMatch2 && !imgMatch2[1].includes('Logo') && !imgMatch2[1].includes('icon') && !imgMatch2[1].includes('svg')) {
      imageUrl = imgMatch2[1];
    }
  }

  const slugMatch = pageUrl.match(/\/produto\/([^\/]+)/);
  const slug = slugMatch ? slugMatch[1] : title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const sku = `seara_b2c_${slug}`;

  const conservacao = (html.includes('Congelado') || title.includes('Congelad')) ? 'Congelado' : 'Resfriado';

  return {
    sku,
    title,
    descrFiscal: title,
    ean,
    dun: '',
    marca: 'Seara',
    classe: 'Aves',
    conservacao,
    pesoLiquido: '',
    image_url: imageUrl
  };
}

export async function runSearaScraper() {
  console.log('🚀 === INICIANDO SCRAPER SEARA ETL (COMPLETO B2B + B2C LIVE WEB EXTRACTION) ===');

  const rawProducts: RawSearaProduct[] = [];
  const batchSize = 20;

  // 1. Extração B2B (Seara Food Solutions)
  const b2bProductUrls = await extractUrlsFromSitemap(B2B_SITEMAP_URL);
  const filteredB2BUrls = b2bProductUrls.filter(u => u.includes('/produto/'));
  console.log(`📦 Encontradas ${filteredB2BUrls.length} URLs de produtos B2B na Seara Food Solutions.`);

  for (let i = 0; i < filteredB2BUrls.length; i += batchSize) {
    const chunk = filteredB2BUrls.slice(i, i + batchSize);
    process.stdout.write(`  \r⏳ Processando páginas B2B: ${Math.min(i + batchSize, filteredB2BUrls.length)}/${filteredB2BUrls.length}...`);

    const htmls = await Promise.all(chunk.map(url => fetchWithTimeout(url)));
    chunk.forEach((url, idx) => {
      const parsed = parseSearaB2BPage(htmls[idx], url);
      if (parsed && parsed.title) {
        rawProducts.push(parsed);
      }
    });
  }
  console.log(`\n✅ Extraídos ${rawProducts.length} produtos B2B ao vivo da Seara.`);

  // 2. Extração B2C (Seara Institucional)
  const b2cProductUrls = await extractUrlsFromSitemap(B2C_SITEMAP_URL);
  const filteredB2CUrls = b2cProductUrls.filter(u => u.includes('/produto/'));
  console.log(`📦 Encontradas ${filteredB2CUrls.length} URLs de produtos B2C na Seara Institucional.`);

  const b2cCountBefore = rawProducts.length;
  for (let i = 0; i < filteredB2CUrls.length; i += batchSize) {
    const chunk = filteredB2CUrls.slice(i, i + batchSize);
    process.stdout.write(`  \r⏳ Processando páginas B2C: ${Math.min(i + batchSize, filteredB2CUrls.length)}/${filteredB2CUrls.length}...`);

    const htmls = await Promise.all(chunk.map(url => fetchWithTimeout(url)));
    chunk.forEach((url, idx) => {
      const parsed = parseSearaB2CPage(htmls[idx], url);
      if (parsed && parsed.title) {
        rawProducts.push(parsed);
      }
    });
  }
  console.log(`\n✅ Extraídos ${rawProducts.length - b2cCountBefore} produtos B2C ao vivo da Seara.`);
  console.log(`🔥 Total Bruto Combinado de Produtos Seara: ${rawProducts.length}`);

  // 3. Montagem dos Objetos Relacionais do PaletScan
  const fabricanteId = FABRICANTE_FRIBOI_ID;
  const fabricantesMap: Record<string, Fabricante> = {};
  const marcasMap: Record<string, Marca> = {};
  const produtosMap: Record<string, Produto> = {};
  const codigosBarras: CodigoBarras[] = [];

  fabricantesMap[fabricanteId] = {
    id: fabricanteId,
    nome: FABRICANTE_FRIBOI_NOME,
    cnpj: '02.914.460/0001-50',
    site_oficial: 'https://www.seara.com.br',
    ativo: true,
    criado_em: new Date().toISOString()
  };

  rawProducts.forEach((p) => {
    const brandInfo = classifyBrand(p.marca || 'Seara', p.title, fabricanteId);
    
    if (!marcasMap[brandInfo.id]) {
      marcasMap[brandInfo.id] = {
        id: brandInfo.id,
        fabricante_id: fabricanteId,
        nome: brandInfo.nome,
        slug: brandInfo.slug,
        descricao: `Linha de produtos ${brandInfo.nome} pertencente ao Grupo JBS / Seara`,
        ativo: true,
        criado_em: new Date().toISOString()
      };
    }

    const eanNorm = p.ean ? normalizeEAN13(p.ean) : null;
    const dunNorm = p.dun ? normalizeDUN14(p.dun) : null;

    // ID do produto baseado no EAN ou SKU
    const baseIdStr = eanNorm || `seara_sku_${p.sku}`;
    const produtoId = `prod_${baseIdStr.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const descrPadronizada = formatProductDescription(p.title);
    const pesoGramas = parsePesoGramas(p.pesoLiquido, p.title);
    const isFracionado = (p.title.toLowerCase().includes('pesar') || p.title.toLowerCase().includes('peça') || pesoGramas === null);
    const hasImage = !isInvalidImageUrl(p.image_url);

    produtosMap[produtoId] = {
      id: produtoId,
      marca_id: brandInfo.id,
      descricao_padronizada: descrPadronizada,
      descricao_original: p.title,
      classe: p.classe || classifyProduct(descrPadronizada),
      conservacao: p.conservacao || 'Resfriado',
      peso_gramas: pesoGramas,
      fracionado: isFracionado,
      imagem_url: hasImage ? p.image_url! : null,
      status_imagem: hasImage ? 'aprovado' : 'sem_imagem',
      criado_em: new Date().toISOString()
    };

    if (eanNorm) {
      codigosBarras.push({
        id: `cod_ean_${eanNorm}`,
        produto_id: produtoId,
        tipo: 'EAN-13',
        codigo: eanNorm,
        embalagem: 'UNIDADE',
        quantidade_embalagem: 1,
        criado_em: new Date().toISOString()
      });
    }

    if (dunNorm) {
      codigosBarras.push({
        id: `cod_dun_${dunNorm}`,
        produto_id: produtoId,
        tipo: 'DUN-14',
        codigo: dunNorm,
        embalagem: 'CAIXA',
        quantidade_embalagem: null,
        criado_em: new Date().toISOString()
      });
    }

    if (p.sku) {
      codigosBarras.push({
        id: `cod_sku_${p.sku}`,
        produto_id: produtoId,
        tipo: 'SKU',
        codigo: p.sku,
        embalagem: null,
        quantidade_embalagem: null,
        criado_em: new Date().toISOString()
      });
    }
  });

  const payload = {
    fabricantes: Object.values(fabricantesMap),
    marcas: Object.values(marcasMap),
    produtos: Object.values(produtosMap),
    codigos_barras: codigosBarras
  };

  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
  }

  fs.writeFileSync(STAGING_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`\n🎉 === SUCESSO! STAGING COMPLETO DA SEARA GERADO AO VIVO ===`);
  console.log(`📁 Arquivo salvo em: ${STAGING_FILE}`);
  console.log(`🏢 Fabricantes: ${payload.fabricantes.length}`);
  console.log(`🏷️  Marcas:      ${payload.marcas.length}`);
  console.log(`🥩 Produtos:    ${payload.produtos.length}`);
  console.log(`📊 Códigos:     ${payload.codigos_barras.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSearaScraper().catch(console.error);
}
