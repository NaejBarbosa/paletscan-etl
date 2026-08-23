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

// Constantes e Endpoints
const SADIA_SITEMAP = 'https://www.sadia.com.br/sitemap.xml';
const PERDIGAO_SITEMAP = 'https://www.perdigao.com.br/sitemap.xml';
const CENTRAL_BRF_SITEMAP = 'https://centralmbrf.com.br/sitemap-product-1.xml';

const LEGACY_DB_PATH = '/root/projetos-scraping/scraping-brf/brf-dun/brf_produtos_b2b.db';
const PALETSCAN_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
};

const BASE_DIR = path.resolve(process.cwd());
const STAGING_DIR = path.join(BASE_DIR, 'staging');
const STAGING_FILE = path.join(STAGING_DIR, 'brf_staging.json');

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
    lower.includes('blob.core.windows.net') ||
    lower.includes('brfsacoeintgrcprd') ||
    lower.includes('force.com') ||
    lower.includes('salesforce.com') ||
    lower.includes('servlet.imageserver')
  );
}

/**
 * Carrega os dados brutos consolidados da base de dados BRF SQLite via Python.
 */
function loadLegacyDatabase(): any[] {
  if (!fs.existsSync(LEGACY_DB_PATH)) {
    console.warn(`[!] Banco de dados local não encontrado em ${LEGACY_DB_PATH}. Iniciando sem cache SQLite.`);
    return [];
  }

  try {
    const pyCmd = `python3 -c "import sqlite3, json; conn = sqlite3.connect('${LEGACY_DB_PATH}'); conn.row_factory = sqlite3.Row; cursor = conn.cursor(); cursor.execute('SELECT * FROM produtos'); print(json.dumps([dict(r) for r in cursor.fetchall()]))"`;
    const jsonStr = execSync(pyCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(jsonStr);
  } catch (err) {
    console.warn(`[!] Erro ao ler SQLite via Python: ${err}`);
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

    // 3. EAN (Procura padrão 789XXXXXXXXXX no HTML)
    const eanMatches = html.match(/\b789\d{10}\b/g);
    const ean = eanMatches ? eanMatches[0] : '';

    if (!title || !image_url) return null;

    return { title, image_url, ean, url };
  } catch (err) {
    return null;
  }
}

/**
 * Função principal de orquestração ETL BRF combinando as 4 fontes de dados.
 */
export async function runBRFScraper(): Promise<StagingPayload> {
  console.log('🚀 Iniciando Pipeline ETL BRF (Combinação Multi-Fonte: B2B MBRF, PDF, Sadia e Perdigão)...');

  // 1. Carrega a base B2B + PDF (com SKU, EAN-13, DUN-14 e especificações técnicas de câmara fria)
  const legacyRows = loadLegacyDatabase();
  console.log(`📦 Base B2B MBRF / PDF carregada com ${legacyRows.length} registros.`);

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

  // 2. Scraping das Fontes Institucionais HD (Sadia e Perdigão) para SOBRESCREVER imagens antigas
  console.log('📸 Coletando fotografias HD atualizadas dos sites institucionais Sadia e Perdigão...');
  const sadiaUrls = await fetchSitemapUrls(SADIA_SITEMAP, 'Sadia');
  const perdigaoUrls = await fetchSitemapUrls(PERDIGAO_SITEMAP, 'Perdigão');

  const instTasks = [
    ...sadiaUrls.map(u => ({ url: u, marca: 'Sadia' })),
    ...perdigaoUrls.map(u => ({ url: u, marca: 'Perdigão' }))
  ];

  console.log(`🔄 Processando ${instTasks.length} páginas de produtos institucionais...`);

  let updatedImagesCount = 0;
  let newInstProductsCount = 0;

  for (let i = 0; i < instTasks.length; i++) {
    const task = instTasks[i];
    if (i % 20 === 0) {
      console.log(`⏳ Progresso HD: [${i}/${instTasks.length}] | Imagens Atualizadas: ${updatedImagesCount}`);
    }

    const instData = await scrapeInstitutionalPage(task.url, task.marca);
    if (!instData) continue;

    // Tenta casar por EAN-13 primeiro
    let existingItem: any = null;
    if (instData.ean && productMapByEan.has(instData.ean)) {
      existingItem = productMapByEan.get(instData.ean);
    } else if (instData.title && productMapByTitle.has(instData.title.toLowerCase())) {
      existingItem = productMapByTitle.get(instData.title.toLowerCase());
    }

    if (existingItem) {
      // Sobrescreve a imagem antiga do B2B com a imagem HD da embalagem institucional!
      if (instData.image_url && instData.image_url !== 'N/A') {
        existingItem.image_url = instData.image_url;
        existingItem.hd_source = task.marca;
        updatedImagesCount++;
      }
      if (!existingItem.ean && instData.ean) {
        existingItem.ean = instData.ean;
      }
    } else if (instData.ean) {
      // Produto novo da linha institucional não presente no catálogo B2B
      const newSku = `INST_${instData.ean}`;
      const newItem = {
        sku: newSku,
        title: instData.title,
        descrFiscal: instData.title,
        ean: instData.ean,
        dun: normalizeDUN14('', instData.ean) || '',
        marca: task.marca,
        classe: '',
        conservacao: 'Resfriado',
        tempMin: '',
        tempMax: '',
        pesoLiquido: '',
        pesoBruto: '',
        vidaUtil: '',
        url: instData.url,
        image_url: instData.image_url,
        source: task.marca
      };
      productMapBySku.set(newSku, newItem);
      productMapByEan.set(instData.ean, newItem);
      newInstProductsCount++;
    }

    // Pequeno delay entre requisições
    await new Promise(res => setTimeout(res, 50));
  }

  console.log(`✅ Fusão de imagens concluída! ${updatedImagesCount} produtos com imagem HD atualizada, ${newInstProductsCount} novos produtos institucionais adicionados.`);

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

  const allCombinedItems = Array.from(productMapBySku.values());

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

    // Tratamento de Imagem
    let imagem_url: string | null = null;
    let status_imagem: 'aprovado' | 'pendente_aprovacao' | 'sem_imagem' = 'sem_imagem';

    if (rawItem.image_url && !isInvalidImageUrl(rawItem.image_url)) {
      imagem_url = rawItem.image_url;
      status_imagem = 'aprovado';
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

  // Garante que o diretório staging existe e escreve o JSON
  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
  }

  fs.writeFileSync(STAGING_FILE, JSON.stringify(payload, null, 2), 'utf-8');
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
