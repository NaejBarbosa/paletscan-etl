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
const LEGACY_DB_PATH = '/root/projetos-scraping/scraping-copacol/copacol_catalogo.db';
const LEGACY_JSON_PATH = '/root/projetos-scraping/scraping-copacol/produtos_enriquecidos.json';

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
  if (fs.existsSync(LEGACY_DB_PATH)) {
    const pythonCmd = `python3 -c "import sqlite3, json; conn = sqlite3.connect('${LEGACY_DB_PATH}'); conn.row_factory = sqlite3.Row; c = conn.cursor(); c.execute('SELECT * FROM produtos;'); print(json.dumps([dict(r) for r in c.fetchall()], ensure_ascii=False))"`;
    try {
      const rawJson = execSync(pythonCmd, { encoding: 'utf-8' });
      const products: RawCopacolProduct[] = JSON.parse(rawJson);
      console.log(`[+] Lidos ${products.length} produtos do catálogo mestre Copacol (SQLite).`);
      return products;
    } catch (err: any) {
      console.warn(`[!] Aviso ao ler banco SQLite: ${err.message}. Tentando fallback JSON...`);
    }
  }

  if (fs.existsSync(LEGACY_JSON_PATH)) {
    try {
      const rawJson = fs.readFileSync(LEGACY_JSON_PATH, 'utf-8');
      const products: RawCopacolProduct[] = JSON.parse(rawJson);
      console.log(`[+] Lidos ${products.length} produtos do catálogo mestre Copacol (JSON).`);
      return products;
    } catch (err: any) {
      console.error(`[!] Erro ao ler JSON fallback Copacol: ${err.message}`);
    }
  }

  return [];
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
  'talsic': 'salsich',
  'sustica': 'rústica',
  'conga': 'congelada',
  'soosso': 'sem osso'
};

function sanitizeTitle(rawText: string): string {
  if (!rawText) return '';
  let cleaned = rawText.trim();
  for (const [typo, fix] of Object.entries(TYPO_CORRECTIONS)) {
    const reg = new RegExp(typo, 'gi');
    cleaned = cleaned.replace(reg, fix);
  }
  return cleaned;
}

export async function runCopacolScraper() {
  console.log('[*] Iniciando ETL Scraper da Copacol Cooperativa Agroindustrial Consolata...');
  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
  }

  const rawProducts = readLegacyCopacolDatabase();
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
    const localPreparedPath = primaryBarcode ? `/root/projetos-scraping/scraping-copacol/imagens_preparadas/${primaryBarcode}.webp` : '';

    if (localPreparedPath && fs.existsSync(localPreparedPath)) {
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
