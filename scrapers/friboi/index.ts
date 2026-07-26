/**
 * Scraper ETL Friboi B2B - PaletScan ETL
 * Autor: Engenheiro de Dados Sênior
 * 
 * Responsável por extrair, normalizar e estruturar relacionalmente os produtos
 * da holding Friboi (JBS) e suas marcas associadas, gerando o arquivo friboi_staging.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { formatProductDescription, toTitleCase } from '../../core/normalizers/text_parser.js';
import { classifyBrand, FABRICANTE_FRIBOI_ID, FABRICANTE_FRIBOI_NOME } from '../../core/heuristics/brand_classifier.js';
import { classifyProduct } from '../../core/heuristics/category_classifier.js';

// Paths principais
const BASE_DIR = path.resolve(process.cwd());
const DB_PATH = '/root/projetos-scraping/scraping-friboi/friboi_catalogo.db';
const STAGING_DIR = path.join(BASE_DIR, 'staging');
const STAGING_FILE = path.join(STAGING_DIR, 'friboi_staging.json');

// Interface para dados brutos do SQLite / API
interface RawProduct {
  sku: string;
  title: string;
  descrFiscal?: string;
  ean?: string;
  dun?: string;
  marca?: string;
  classe?: string;
  conservacao?: string;
  pesoLiquido?: string;
  pesoBruto?: string;
  url?: string;
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
 * Inspeciona a URL da imagem para verificar se é um placeholder genérico sem foto real do produto.
 */
function isPlaceholderImage(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return true;
  }

  const cleanUrl = url.toLowerCase().trim();

  // Caso 1: Exemplo específico mencionado na especificação do projeto (/products/355027_05.jpeg)
  if (cleanUrl.includes('355027_05') || cleanUrl.includes('_05.jpeg') || cleanUrl.includes('_05.jpg')) {
    return true;
  }

  // Caso 2: Termos típicos de ausência de imagem
  if (
    cleanUrl.includes('placeholder') ||
    cleanUrl.includes('no-image') ||
    cleanUrl.includes('default_product') ||
    cleanUrl.includes('sem_foto') ||
    cleanUrl.includes('ausencia') ||
    cleanUrl.includes('indisponivel')
  ) {
    return true;
  }

  // Caso 3: Imagem genérica que só tem SKU_00.JPG sem o slug descritivo da carne
  if (/\/products\/\d+_00\.(jpg|jpeg|png)$/i.test(cleanUrl)) {
    return true;
  }

  return false;
}

/**
 * Lê os dados brutos da tabela de produtos do banco de dados SQLite ou JSON local.
 */
function fetchRawProducts(): RawProduct[] {
  if (fs.existsSync(DB_PATH)) {
    console.log(`📡 Carregando produtos do banco SQLite local: ${DB_PATH}`);
    try {
      const output = execSync(`sqlite3 -json "${DB_PATH}" "SELECT * FROM produtos;"`, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024
      });
      const data = JSON.parse(output) as RawProduct[];
      console.log(`✅ ${data.length} produtos brutos carregados do banco SQLite.`);
      return data;
    } catch (err) {
      console.error(`⚠️ Falha ao ler banco SQLite:`, err);
    }
  }

  // Fallback se o banco sqlite não for encontrado
  console.log(`⚠️ Banco SQLite não encontrado em ${DB_PATH}. Inicializando array vazio para staging.`);
  return [];
}

/**
 * Executa a pipeline principal do scraper e normalizador Friboi ETL
 */
export async function runFriboiScraper(): Promise<StagingPayload> {
  console.log('🚀 Iniciando Scraper ETL Friboi B2B...');
  const nowISO = new Date().toISOString();

  const rawProducts = fetchRawProducts();

  // 1. Holding Fabricante (Friboi / JBS S.A.)
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
    if (!raw.sku || !raw.title) continue;

    // Classificação e vínculo relacional da Marca
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

    // Verificação de Imagem (Filtro de Placeholder)
    const isPlaceholder = isPlaceholderImage(raw.image_url);
    let statusImagem: 'aprovado' | 'pendente_aprovacao' | 'sem_imagem' = 'sem_imagem';

    if (isPlaceholder) {
      statusImagem = 'pendente_aprovacao';
      pendingImagesApproval.push({
        produto_id: produtoId,
        sku: raw.sku,
        descricao: parsedText.formatted_description,
        placeholder_url: raw.image_url || 'https://www.friboionline.com.br/ccstore/v1/images/?source=/file/products/355027_05.jpeg'
      });
    } else if (raw.image_url) {
      statusImagem = 'aprovado';
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
      imagem_url: isPlaceholder ? null : (raw.image_url || null),
      status_imagem: statusImagem,
      criado_em: nowISO
    };
    produtos.push(produto);

    // Códigos de Barras Relacionados (SKU, EAN, DUN)
    // 1. SKU
    codigosBarras.push({
      id: `bar_sku_${raw.sku}`,
      produto_id: produtoId,
      tipo: 'SKU',
      codigo: raw.sku,
      embalagem: 'Unidade',
      quantidade_embalagem: 1,
      criado_em: nowISO
    });

    // 2. EAN (se preenchido e válido)
    if (raw.ean && raw.ean.trim().length >= 8) {
      codigosBarras.push({
        id: `bar_ean_${raw.sku}_${raw.ean.trim()}`,
        produto_id: produtoId,
        tipo: 'EAN',
        codigo: raw.ean.trim(),
        embalagem: 'Unidade',
        quantidade_embalagem: 1,
        criado_em: nowISO
      });
    }

    // 3. DUN (se preenchido e válido)
    if (raw.dun && raw.dun.trim().length >= 8) {
      codigosBarras.push({
        id: `bar_dun_${raw.sku}_${raw.dun.trim()}`,
        produto_id: produtoId,
        tipo: 'DUN',
        codigo: raw.dun.trim(),
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

  // Garante a existência da pasta staging/
  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
  }

  // Grava o arquivo de staging JSON
  fs.writeFileSync(STAGING_FILE, JSON.stringify(payload, null, 2), 'utf-8');

  console.log('\n📊 === RESUMO DA PIPELINE FRIBOI ETL ===');
  console.log(`🏢 Holdings/Fabricantes: ${payload.fabricantes.length}`);
  console.log(`🏷️  Marcas Identificadas: ${payload.marcas.length} (${payload.marcas.map(m => m.nome).join(', ')})`);
  console.log(`🥩 Produtos Processados: ${payload.produtos.length}`);
  console.log(`📊 Códigos de Barras (SKU/EAN/DUN): ${payload.codigos_barras.length}`);
  console.log(`🖼️  Imagens Pendentes de Aprovação (Placeholders): ${payload.pending_images_approval.length}`);
  console.log(`💾 Arquivo salvo com sucesso em: ${STAGING_FILE}\n`);

  return payload;
}

// Executa o script se chamado diretamente no terminal
if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  runFriboiScraper().catch(err => {
    console.error('❌ Erro durante a execução do Scraper Friboi:', err);
    process.exit(1);
  });
}
