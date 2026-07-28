/**
 * Scraper ETL Friboi B2B - Web Extraction Direta em Tempo Real
 * Autor: Engenheiro de Dados Sênior / Arquiteto PaletScan
 * 
 * Este módulo realiza:
 * 1. Web scraping em tempo real através do sitemap XML oficial da Friboi B2B.
 * 2. Requisições HTTP concorrentes à API CCStore de produtos (friboionline.com.br).
 * 3. Extração dinâmica de SKU, Título, EAN, DUN, Marca, Classe, Conservação e Imagem de Alta Resolução.
 * 4. Normalização rigorosa de texto, acentuação PT-BR, pesos em gramas e separação de placeholders de imagem.
 * 5. Geração do payload relacional normatizado em staging/friboi_staging.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { formatProductDescription, normalizeEAN13, normalizeDUN14 } from '../../core/normalizers/text_parser.js';
import { classifyBrand, FABRICANTE_FRIBOI_ID, FABRICANTE_FRIBOI_NOME } from '../../core/heuristics/brand_classifier.js';
import { classifyProduct } from '../../core/heuristics/category_classifier.js';

// Constantes de Endpoints e Cabeçalhos HTTP
const SITEMAP_URL = 'https://www.friboionline.com.br/productSitemap.xml';
const PRODUCT_API_URL = 'https://www.friboionline.com.br/ccstoreui/v1/products/';
const BASE_DOMAIN = 'https://www.friboionline.com.br';

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
};

// Paths principais
const BASE_DIR = path.resolve(process.cwd());
const STAGING_DIR = path.join(BASE_DIR, 'staging');
const STAGING_FILE = path.join(STAGING_DIR, 'friboi_staging.json');

// Interface para dados brutos do produto extraído ao vivo
interface RawLiveProduct {
  sku: string;
  title: string;
  descrFiscal?: string;
  ean?: string;
  dun?: string;
  marca?: string;
  classe?: string;
  conservacao?: string;
  image_url?: string;
}

// Interfaces compatíveis com schema_manifest.json
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
 * Inspeciona rigorosamente a URL da imagem e garante:
 * 1. Validação estrita de SKU exato: a imagem DEVE pertencer ao produto analisado (fileSku === targetSku).
 *    Bloqueia imagens de outros produtos ou de outras seções da página.
 * 2. Validação estrita de embalagem de fábrica (_00_ ou _01_):
 *    Descarte absoluto de fotos de pratos servidos, receitas, sugestões de consumo (_02, _03, _04, _05) e selos (_50).
 * 3. Bloqueio absoluto de placeholders genéricos, banners promocionais/institucionais, selos e tabelas nutricionais.
 * 4. Validação semântica entre o slug do arquivo de imagem e o título do produto (se houver slug textual).
 */
function isValidProductImage(url: string | undefined | null, targetSku?: string, productTitle?: string): boolean {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return false;
  }

  const cleanUrl = url.toLowerCase().trim();

  // 1. Blacklist estrita de termos institucionais, logos, banners e placeholders de imagem ausente
  const restrictedTerms = [
    'receita', 'recipe', 'prato_pronto', 'pratopronto', 'prato_servido',
    'banner', 'logo', 'logotipo', 'play', 'video', 'icon', 'icone', 'promo', 'promocao',
    'selo', 'stamp', 'tabela_nutricional', 'tabela-nutricional', 'campanha', 'institucional',
    'friboi_logo', 'jbs_logo', 'placeholder', 'no-image', 'no_image',
    'default_product', 'default', 'sem_foto', 'semfoto', 'ausencia',
    'indisponivel', 'sem_imagem', 'sem-imagem'
  ];

  for (const term of restrictedTerms) {
    if (cleanUrl.includes(term)) {
      return false;
    }
  }

  // 2. Deve possuir obrigatoriamente o padrão de embalagem/corte de fábrica da Friboi CCStore: _00_ ou _01_
  // Rejeita categoricamente receitas e pratos servidos (_02, _03, _04, _05) e selos institucionais (_50)
  const match = cleanUrl.match(/\/products\/(\d+)_(00|01)(?:_([a-z0-9-]+))?\.(jpg|jpeg|png|webp)/i);
  if (!match) {
    return false;
  }

  const [, fileSku, , slug] = match;

  // 3. Validação de SKU Exato: O código SKU no arquivo de imagem DEVE corresponder ao SKU do produto solicitado
  // Garante que imagens relativas a outros produtos da página ou vitrine não sejam retornadas
  if (targetSku && fileSku !== targetSku) {
    return false;
  }

  // 4. Validação de Acurácia Semântica: Se houver slug textual no arquivo, compara com o título do produto
  if (slug && productTitle) {
    const titleNorm = productTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const titleWords = titleNorm.split(/\W+/).filter(w => w.length > 2);
    const slugWords = slug.split('-').filter(w => w.length > 2);

    let matchCount = 0;
    for (const sw of slugWords) {
      if (titleWords.some(tw => tw.includes(sw) || sw.includes(tw))) {
        matchCount++;
      }
    }

    // Se o slug da imagem não tiver nenhuma palavra relevante em comum com o título do produto, rejeita por baixa acurácia
    if (slugWords.length > 0 && matchCount === 0) {
      return false;
    }
  }

  return true;
}

/**
 * Seleciona exaustivamente a melhor imagem real do produto a partir de todos os campos do CCStore JSON.
 * Se não houver acurácia suficiente, retorna null.
 */
function extractBestProductImage(data: any, targetSku?: string, productTitle?: string): string | null {
  const candidateUrls: string[] = [];

  if (data.primaryFullImageURL) candidateUrls.push(data.primaryFullImageURL);
  if (data.primaryLargeImageURL) candidateUrls.push(data.primaryLargeImageURL);
  if (data.primaryMediumImageURL) candidateUrls.push(data.primaryMediumImageURL);
  if (Array.isArray(data.fullImageURLs)) candidateUrls.push(...data.fullImageURLs);
  if (Array.isArray(data.sourceImageURLs)) candidateUrls.push(...data.sourceImageURLs);

  if (Array.isArray(data.childSKUs)) {
    for (const child of data.childSKUs) {
      if (child.primaryFullImageURL) candidateUrls.push(child.primaryFullImageURL);
      if (child.primaryLargeImageURL) candidateUrls.push(child.primaryLargeImageURL);
      if (Array.isArray(child.fullImageURLs)) candidateUrls.push(...child.fullImageURLs);
      if (Array.isArray(child.sourceImageURLs)) candidateUrls.push(...child.sourceImageURLs);
    }
  }

  for (const rawUrl of candidateUrls) {
    if (!rawUrl || typeof rawUrl !== 'string') continue;

    // Limpa parâmetros de dimensões de imagem da URL se presentes
    const cleanUrl = rawUrl.replace(/&height=\d+&width=\d+/, '');
    const fullUrl = cleanUrl.startsWith('http') ? cleanUrl : `${BASE_DOMAIN}${cleanUrl}`;

    if (isValidProductImage(fullUrl, targetSku, productTitle)) {
      return fullUrl;
    }
  }

  return null;
}

/**
 * Obtém a lista de SKUs diretamente do sitemap XML oficial em tempo real.
 */
async function fetchSKUsFromSitemap(): Promise<string[]> {
  console.log(`📡 Baixando sitemap oficial ao vivo: ${SITEMAP_URL}`);
  const response = await fetch(SITEMAP_URL, { headers: HTTP_HEADERS });
  if (!response.ok) {
    throw new Error(`Falha ao carregar sitemap. Status HTTP: ${response.status}`);
  }

  const xmlText = await response.text();
  // Regex para captura de URLs do sitemap mantendo o formato /product/<slug>/<sku>
  const urlMatches = xmlText.match(/https:\/\/www\.friboionline\.com\.br\/product\/[^<]+/g) || [];

  const skusSet = new Set<string>();
  for (const rawUrl of urlMatches) {
    // Remove sufixos XML tipo CDATA `]]>` se existirem
    const cleanUrl = rawUrl.replace(/]]>.*$/, '').trim();
    const parts = cleanUrl.split('/');
    const lastPart = parts.pop() || parts.pop();
    if (lastPart && /^\d+$/.test(lastPart)) {
      skusSet.add(lastPart);
    }
  }

  const skus = Array.from(skusSet);
  console.log(`✅ Sitemap processado com sucesso! ${skus.length} SKUs únicos identificados ao vivo.`);
  return skus;
}

/**
 * Realiza requisição HTTP com tentativas automáticas (retries) em caso de falha de rede ou oscilação.
 */
async function fetchWithRetry(url: string, options: any, retries = 3, delayMs = 800): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status === 404) {
        return response;
      }
    } catch (err) {
      if (attempt === retries) throw err;
    }
    await new Promise(res => setTimeout(res, delayMs * attempt));
  }
  return fetch(url, options);
}

/**
 * Realiza o scraping individual de um produto via API CCStore Friboi B2B.
 */
async function scrapeProductDetails(sku: string): Promise<RawLiveProduct | null> {
  try {
    const response = await fetchWithRetry(`${PRODUCT_API_URL}${sku}`, { headers: HTTP_HEADERS });
    if (!response.ok) {
      return null;
    }

    const data: any = await response.json();

    // Extração dinâmica de campos do JSON ao vivo da Oracle Commerce Cloud (CCStore)
    const title = data.displayName || data.x_cNmProduto || `Produto SKU ${sku}`;
    const descrFiscal = data.longDescription || data.description || '';
    
    // Tentativa de localização do EAN (código EAN principal ou childSKUs) com preservação estrita de string EAN-13
    const rawEanVal = data.x_cCdEAN || data.x_ean || (data.childSKUs && data.childSKUs[0]?.barcode) || '';
    const eanNormalized = normalizeEAN13(rawEanVal) || '';
    const rawDunVal = data.x_cCdDUN || data.x_dun || '';
    const dunNormalized = normalizeDUN14(rawDunVal, eanNormalized) || '';
    const marca = data.x_MARCA || data.brand || '';
    const classe = data.x_cOrigem || data.x_TIPO_DE_PRODUTO || (data.parentCategoryIdPath ? data.parentCategoryIdPath.split('>')[1] : '');
    const conservacao = data.x_TEMPERATURA || '';

    const cleanTitle = title.replace(/\s*\(\d+\)$/, '').trim();

    // Extração da melhor imagem real do produto (exigindo acurácia semântica e SKU exato)
    const bestImageUrl = extractBestProductImage(data, sku, cleanTitle);

    return {
      sku,
      title: cleanTitle,
      descrFiscal,
      ean: eanNormalized,
      dun: dunNormalized,
      marca: String(marca).trim(),
      classe: String(classe).trim(),
      conservacao: String(conservacao).trim(),
      image_url: bestImageUrl || undefined
    };
  } catch (err) {
    return null;
  }
}

/**
 * Pipeline principal do Web Scraper Friboi (Fetch -> Parse -> Normalize -> Staging)
 */
export async function runFriboiLiveScraper(): Promise<StagingPayload> {
  console.log('🌐 === INICIANDO WEB SCRAPER FRIBOI B2B EM TEMPO REAL ===');
  const nowISO = new Date().toISOString();

  // 1. Obtenção ao vivo de SKUs pelo sitemap
  const skus = await fetchSKUsFromSitemap();

  if (skus.length === 0) {
    throw new Error('Nenhum SKU retornado do sitemap online.');
  }

  // 2. Scraping Concorrente com Pool de Conexões Resiliente
  console.log(`🚀 Iniciando extração web concorrente de ${skus.length} produtos...`);
  const rawProducts: RawLiveProduct[] = [];
  const BATCH_SIZE = 10; // Lote menor com retries para garantir estabilidade de 100% dos produtos

  let processedCount = 0;
  for (let i = 0; i < skus.length; i += BATCH_SIZE) {
    const batchSkus = skus.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batchSkus.map(sku => scrapeProductDetails(sku)));

    for (const prod of results) {
      if (prod) {
        rawProducts.push(prod);
      }
    }

    processedCount += batchSkus.length;
    process.stdout.write(`  \r⏳ Extraídos ${rawProducts.length}/${processedCount} produtos online (${Math.round((processedCount / skus.length) * 100)}%)...`);
    
    // Pequena pausa entre lotes para estabilidade HTTP
    await new Promise(res => setTimeout(res, 100));
  }
  process.stdout.write(`\n`);
  console.log(`✅ Web scraping concluído! ${rawProducts.length} produtos extraídos diretamente da internet.`);

  // 3. Estruturação Relacional e Funil ETL (Holding, Marcas, Produtos, Códigos de Barras)
  const fabricanteHolding: Fabricante = {
    id: FABRICANTE_FRIBOI_ID,
    nome: FABRICANTE_FRIBOI_NOME,
    cnpj: '02.916.265/0001-60',
    site_oficial: 'https://www.friboionline.com.br',
    ativo: true,
    criado_em: nowISO
  };

  const marcasMap = new Map<string, Marca>();
  const produtos: Produto[] = [];
  const codigosBarras: CodigoBarras[] = [];
  const pendingImagesApproval: PendingImageApproval[] = [];

  for (const raw of rawProducts) {
    // Classificação da Marca relacional
    const brandInfo = classifyBrand(raw.marca || '', raw.title);
    if (!marcasMap.has(brandInfo.id)) {
      marcasMap.set(brandInfo.id, {
        id: brandInfo.id,
        fabricante_id: brandInfo.fabricante_id,
        nome: brandInfo.nome,
        slug: brandInfo.slug,
        descricao: `Linha de produtos ${brandInfo.nome} da holding Friboi/JBS`,
        ativo: true,
        criado_em: nowISO
      });
    }

    // Normalização de Texto e Pesos
    const parsedText = formatProductDescription(raw.title);
    const categoryInfo = classifyProduct(raw.title, raw.classe, raw.conservacao);

    const produtoId = `prod_friboi_${raw.sku}`;

    // Validação estrita de imagem real do produto (exigindo correspondência de SKU e título)
    const hasValidImage = raw.image_url && isValidProductImage(raw.image_url, raw.sku, parsedText.formatted_description);
    let statusImagem: 'aprovado' | 'pendente_aprovacao' | 'sem_imagem' = hasValidImage ? 'aprovado' : 'sem_imagem';

    if (!hasValidImage && raw.image_url) {
      statusImagem = 'pendente_aprovacao';
      pendingImagesApproval.push({
        produto_id: produtoId,
        sku: raw.sku,
        descricao: parsedText.formatted_description,
        placeholder_url: raw.image_url
      });
    }

    // Instância do Produto Normalizado
    const produto: Produto = {
      id: produtoId,
      marca_id: brandInfo.id,
      descricao_padronizada: parsedText.formatted_description,
      descricao_original: raw.title,
      classe: categoryInfo.classe,
      conservacao: categoryInfo.conservacao,
      peso_gramas: parsedText.peso_gramas,
      fracionado: parsedText.fracionado,
      imagem_url: hasValidImage ? raw.image_url! : null,
      status_imagem: statusImagem,
      criado_em: nowISO
    };
    produtos.push(produto);

    // Identificadores de Código de Barras (SKU, EAN-13, DUN-14)
    codigosBarras.push({
      id: `bar_sku_${raw.sku}`,
      produto_id: produtoId,
      tipo: 'SKU',
      codigo: raw.sku,
      embalagem: 'Unidade',
      quantidade_embalagem: 1,
      criado_em: nowISO
    });

    const ean13 = normalizeEAN13(raw.ean);
    if (ean13 && ean13.length === 13) {
      codigosBarras.push({
        id: `bar_ean_${raw.sku}_${ean13}`,
        produto_id: produtoId,
        tipo: 'EAN',
        codigo: ean13,
        embalagem: 'Unidade',
        quantidade_embalagem: 1,
        criado_em: nowISO
      });
    }

    const dun14 = normalizeDUN14(raw.dun, ean13);
    if (dun14 && dun14.length === 14) {
      codigosBarras.push({
        id: `bar_dun_${raw.sku}_${dun14}`,
        produto_id: produtoId,
        tipo: 'DUN',
        codigo: dun14,
        embalagem: 'Caixa',
        quantidade_embalagem: null,
        criado_em: nowISO
      });
    }
  }

  const payload: StagingPayload = {
    fabricantes: [fabricanteHolding],
    marcas: Array.from(marcasMap.values()),
    produtos,
    codigos_barras: codigosBarras,
    pending_images_approval: pendingImagesApproval
  };

  // Garante a existência do diretório staging/
  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
  }

  // Grava o arquivo de staging JSON
  fs.writeFileSync(STAGING_FILE, JSON.stringify(payload, null, 2), 'utf-8');

  console.log('\n📊 === RESUMO DO SCRAPING AO VIVO FRIBOI ETL ===');
  console.log(`🏢 Holdings/Fabricantes: ${payload.fabricantes.length}`);
  console.log(`🏷️  Marcas Identificadas: ${payload.marcas.length}`);
  console.log(`🥩 Produtos Extraídos e Processados: ${payload.produtos.length}`);
  console.log(`📊 Códigos de Barras (SKU/EAN/DUN): ${payload.codigos_barras.length}`);
  console.log(`🖼️  Imagens Pendentes de Aprovação (Placeholders): ${payload.pending_images_approval.length}`);
  console.log(`💾 Arquivo salvo com sucesso em: ${STAGING_FILE}\n`);

  return payload;
}

// Execução via CLI
if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  runFriboiLiveScraper().catch(err => {
    console.error('❌ Erro durante o Web Scraping ao vivo:', err);
    process.exit(1);
  });
}
