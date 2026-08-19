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
const LEGACY_DB_PATH = '/root/projetos-scraping/scraping-lar/lar_catalogo.db';

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
  if (fs.existsSync(LEGACY_DB_PATH)) {
    const pythonCmd = `python3 -c "import sqlite3, json; conn = sqlite3.connect('${LEGACY_DB_PATH}'); conn.row_factory = sqlite3.Row; c = conn.cursor(); c.execute('SELECT * FROM produtos;'); print(json.dumps([dict(r) for r in c.fetchall()], ensure_ascii=False))"`;
    try {
      const rawJson = execSync(pythonCmd, { encoding: 'utf-8' });
      const products: RawLarProduct[] = JSON.parse(rawJson);
      console.log(`[+] Lidos ${products.length} produtos do catálogo mestre Lar (SQLite).`);
      return products;
    } catch (err: any) {
      console.warn(`[!] Aviso ao ler banco SQLite Lar: ${err.message}.`);
    }
  }

  return [];
}

export async function runLarScraper() {
  console.log('[*] Iniciando ETL Scraper da Lar Cooperativa Agroindustrial...');
  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
  }

  const rawProducts = readLegacyLarDatabase();
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
    // Monta texto com descrição completa e peso do catálogo
    let fullDescr = (rawProd.descrFiscal && !rawProd.descrFiscal.includes('(pesar)'))
      ? rawProd.descrFiscal
      : (rawProd.pesoLiquido && rawProd.pesoLiquido.trim() !== '' && rawProd.pesoLiquido !== 'N/A' && !rawProd.pesoLiquido.toLowerCase().includes('variável')
          ? `${rawProd.title} ${rawProd.pesoLiquido}`
          : (rawProd.title || ''));

    // Limpa conservação duplicada no título se houver
    fullDescr = fullDescr
      .replace(/\s*[•\-\/,]?\s*(congelada|congelado|resfriada|resfriado)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Normalização de descrição e pesagens via text_parser.ts
    const parsedText = formatProductDescription(fullDescr);

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

    // EAN-13 e DUN-14
    const eanClean = normalizeEAN13(rawProd.ean);
    const dunClean = normalizeDUN14(rawProd.dun, eanClean);

    if (!eanClean && !dunClean) {
      console.warn(`[!] Produto SKU ${rawProd.sku} sem EAN/DUN válido. Ignorando.`);
      continue;
    }

    const prodId = `prod_lar_${rawProd.sku || eanClean}`;

    // Determina Mídia e Status de Imagem
    let finalImageUrl: string | null = null;
    let imageStatus: 'aprovado' | 'pendente_aprovacao' | 'sem_imagem' = 'sem_imagem';

    const primaryBarcode = eanClean || dunClean;
    const localPreparedPath = primaryBarcode ? `/root/projetos-scraping/scraping-lar/imagens_preparadas/${primaryBarcode}.webp` : '';

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
      descricao_original: rawProd.title,
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
