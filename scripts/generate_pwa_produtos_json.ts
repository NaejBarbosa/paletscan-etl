import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Chave do Supabase não configurada em .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function generatePwaProdutosJson() {
  console.log('🔄 Gerando produtos.json 100% padronizado para o repositório PWA...');

  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('vw_produtos_com_marcas')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('❌ Erro ao consultar Supabase:', error.message);
      process.exit(1);
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
      page++;
      if (data.length < pageSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  console.log(`📊 Registros obtidos da View do Supabase (IDs únicos de produtos): ${allData.length}`);

  // Buscar todos os códigos EAN, DUN e SKU da tabela codigos_barras
  console.log('📦 Carregando códigos EAN, DUN e SKU da tabela codigos_barras...');
  const eanMap = new Map<string, string>();
  const dunMap = new Map<string, string>();
  const skuMap = new Map<string, string>();
  page = 0;
  hasMore = true;
  while (hasMore) {
    const { data: cbList, error: cbError } = await supabase
      .from('codigos_barras')
      .select('produto_id, codigo, tipo')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (cbError) {
      console.error('⚠️ Erro ao buscar códigos de barras:', cbError.message);
      break;
    }

    if (cbList && cbList.length > 0) {
      cbList.forEach(c => {
        const cleanCode = String(c.codigo || '').trim();
        if (!cleanCode) return;
        const tipoUpper = (c.tipo || '').toUpperCase();

        // 1. DUN-14: estritamente 14 dígitos numéricos
        if (/^\d{14}$/.test(cleanCode) || (tipoUpper.includes('DUN') && /^\d+$/.test(cleanCode))) {
          if (/^\d{14}$/.test(cleanCode)) {
            dunMap.set(c.produto_id, cleanCode);
          }
        }
        // 2. EAN-13: estritamente 13 dígitos numéricos
        else if (/^\d{13}$/.test(cleanCode) && (tipoUpper.includes('EAN') || !tipoUpper.includes('SKU'))) {
          eanMap.set(c.produto_id, cleanCode);
        }
        // 3. SKU / Código Interno de Fabricante: códigos curtos (< 13 dígitos) ou tipo SKU
        else if (tipoUpper.includes('SKU') || cleanCode.length < 13) {
          skuMap.set(c.produto_id, cleanCode);
        }
      });
      page++;
      if (cbList.length < pageSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }
  console.log(`✅ Total de EANs (13 dígitos): ${eanMap.size} | Total de DUNs (14 dígitos): ${dunMap.size} | Total de SKUs: ${skuMap.size}`);

  // Sincronizar imagens preparadas locais de todos os scrapers para public/imagens_produtos
  const publicImgDir = '/root/repo_pwa/public/imagens_produtos';
  if (!fs.existsSync(publicImgDir)) fs.mkdirSync(publicImgDir, { recursive: true });

  const preparedDirs = [
    '/root/projetos-scraping/scraping-aurora/imagens_preparadas',
    '/root/projetos-scraping/scraping-copacol/imagens_preparadas',
    '/root/projetos-scraping/scraping-brf/imagens_preparadas',
    '/root/projetos-scraping/scraping-friboi/imagens_preparadas',
    '/root/projetos-scraping/scraping-lar/imagens_preparadas',
    '/root/projetos-scraping/scraping-seara/imagens_preparadas'
  ];

  let totalCopied = 0;
  for (const prepDir of preparedDirs) {
    if (fs.existsSync(prepDir)) {
      const files = fs.readdirSync(prepDir);
      files.forEach(f => {
        if (!f.endsWith('.webp') && !f.endsWith('.png') && !f.endsWith('.jpg')) return;
        const nameWithoutExt = f.replace(/\.(webp|png|jpg)$/i, '');
        // Valida se o arquivo é um EAN-13, DUN-14, UUID ou prefixo legítimo de scraper (ex: prod_friboi_XXXX)
        const isStandard = /^\d{13,14}$/.test(nameWithoutExt) ||
                           /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameWithoutExt) ||
                           nameWithoutExt.startsWith('prod_');
        if (!isStandard) return; // Evita copiar IDs curtos legados como 398.webp, 1.webp etc.
        const src = path.join(prepDir, f);
        const dest = path.join(publicImgDir, f);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
          totalCopied++;
        }
      });
    }
  }
  if (totalCopied > 0) {
    console.log(`🖼️ [PWA Image Sync] Copiadas ${totalCopied} novas imagens preparadas para ${publicImgDir}`);
  }

  // Deduplicação estrita baseada no ID único do produto (produtos.id)
  const mapUnicos = new Map<string, any>();
  allData.forEach((row) => {
    const prodId = String(row.produto_id || row.id || '').trim();
    if (!prodId) return;

    const rawEan = String(row.ean || row.produto_ean || '').trim();
    const rawDun = String(row.dun || row.produto_dun || '').trim();
    const rawSku = String(row.sku || row.codigo || row.tipo_codigo || '').trim();

    // EAN estritamente 13 dígitos numéricos (obrigatório para exibição no PWA)
    const candEan = eanMap.get(prodId) || rawEan;
    const eanVal = /^\d{13}$/.test(candEan) ? candEan : '';

    // REGRA ESTRITA DO PWA: Apenas produtos com no mínimo EAN de 13 dígitos vão para o PWA!
    // Produtos que possuem apenas SKU interno ou apenas DUN são descartados da exportação ao PWA.
    if (!eanVal) return;

    // DUN estritamente 14 dígitos numéricos
    const candDun = dunMap.get(prodId) || rawDun;
    const dunVal = /^\d{14}$/.test(candDun) ? candDun : '';

    // Identificador principal é estritamente o EAN-13
    const primaryBarcode = eanVal;

    let descr = '';
    if (row.descricao_padronizada) {
      if (typeof row.descricao_padronizada === 'object') {
        descr = row.descricao_padronizada.formatted_description || row.descricao_padronizada.title_clean || '';
      } else if (typeof row.descricao_padronizada === 'string') {
        try {
          const parsed = JSON.parse(row.descricao_padronizada);
          descr = parsed.formatted_description || parsed.title_clean || row.descricao_padronizada;
        } catch {
          descr = row.descricao_padronizada;
        }
      }
    }
    if (!descr) {
      descr = row.descricao_original || row.produto_descr || row.descricao || '';
    }

    // Verifica se a imagem local existe fisicamente no PWA E o status no Supabase permite exibição
    const localEanFile = `${primaryBarcode}.webp`;
    const localPath = path.join(publicImgDir, localEanFile);
    let finalImgUrl = row.imagem_url ?? null;
    let finalStatus = row.status_imagem ?? 'sem_imagem';

    // Se o Supabase determinou que o produto está SEM_IMAGEM, não força imagem local legada
    if (finalStatus === 'sem_imagem' || finalStatus === 'SEM_IMAGEM') {
      finalImgUrl = null;
    } else if (fs.existsSync(localPath)) {
      finalImgUrl = `/imagens_produtos/${localEanFile}`;
      if (!finalStatus) {
        finalStatus = 'VALIDATED';
      }
    }

    // A chave do Map é estritamente o ID ÚNICO DO PRODUTO (prodId), garantindo 1 item por produto no catálogo
    if (!mapUnicos.has(prodId)) {
      const criadoEmVal = row.criado_em || row.created_at || row.criadoEm || new Date().toISOString();
      mapUnicos.set(prodId, {
        id: prodId,
        marcaId: row.marca_id || '',
        marcaDescr: row.marca_nome || 'N/D',
        marcaNome: row.marca_nome || 'N/D',
        marca_nome: row.marca_nome || 'N/D',
        produtoClasse: row.classe || row.produto_classe || '',
        produtoEan: eanVal, // EAN estritamente 13 dígitos numéricos
        produtoDun: dunVal, // DUN estritamente 14 dígitos numéricos ou ""
        sku: eanVal, // SKU normalizado para o EAN para evitar vazamento de códigos internos
        produtoConservacao: row.conservacao || row.produto_conservacao || '',
        produtoDescr: descr,
        title: descr,
        descricao: descr,
        peso_gramas: row.peso_gramas ?? null,
        fracionado: row.fracionado ?? false,
        pesarCod: row.tipo_codigo || row.codigo || row.pesar_cod || '',
        imagemUrl: finalImgUrl,
        imagem_url: finalImgUrl,
        statusImagem: finalStatus,
        status_imagem: finalStatus,
        criado_em: criadoEmVal,
        criadoEm: criadoEmVal,
      });
    }
  });

  const produtosLimpos = Array.from(mapUnicos.values());

  const targetPaths = [
    path.join('/root/repo_pwa', 'produtos.json'),
    path.join('/root/repo_pwa', 'public', 'produtos.json')
  ];

  const jsonContent = JSON.stringify(produtosLimpos, null, 2);

  targetPaths.forEach(p => {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, jsonContent, 'utf-8');
    console.log(`✅ Arquivo salvo com ${produtosLimpos.length} produtos únicos em: ${p}`);
  });

  console.log(`🎉 Geração do produtos.json do PWA concluída: ${produtosLimpos.length} produtos únicos aprovados respaldados por EAN!`);
}

generatePwaProdutosJson().catch(err => {
  console.error('❌ Erro na geração:', err);
  process.exit(1);
});
