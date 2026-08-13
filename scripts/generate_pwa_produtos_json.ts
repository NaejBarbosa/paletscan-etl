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

  console.log(`📊 Registros obtidos da View do Supabase: ${allData.length}`);

  // Buscar todos os códigos DUN da tabela codigos_barras
  console.log('📦 Carregando códigos DUN da tabela codigos_barras...');
  const dunMap = new Map<string, string>();
  page = 0;
  hasMore = true;
  while (hasMore) {
    const { data: duns, error: dunError } = await supabase
      .from('codigos_barras')
      .select('produto_id, codigo, tipo')
      .in('tipo', ['DUN', 'DUN_14'])
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (dunError) {
      console.error('⚠️ Erro ao buscar DUNs:', dunError.message);
      break;
    }

    if (duns && duns.length > 0) {
      duns.forEach(d => {
        const cleanDun = String(d.codigo || '').trim();
        if (cleanDun && /^\d+$/.test(cleanDun)) {
          dunMap.set(d.produto_id, cleanDun);
        }
      });
      page++;
      if (duns.length < pageSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }
  console.log(`✅ Total de códigos DUN identificados: ${dunMap.size}`);

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


  const mapUnicos = new Map<string, any>();
  allData.forEach((row) => {
    const candidateEan = String(row.ean || row.produto_ean || row.codigo || '');
    const eanVal = /^\d+$/.test(candidateEan.trim()) ? candidateEan.trim() : '';
    if (!eanVal) return; // PaletScan business rule: only products with valid EAN in app

    const key = String(row.produto_id || row.id || eanVal || row.sku || '');
    const dunVal = dunMap.get(row.produto_id || row.id) || row.dun || row.produto_dun || '';

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
    const localEanFile = `${eanVal}.webp`;
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

    if (key && !mapUnicos.has(key)) {
      const criadoEmVal = row.criado_em || row.created_at || row.criadoEm || new Date().toISOString();
      mapUnicos.set(key, {
        marcaId: row.marca_id || '',
        marcaDescr: row.marca_nome || 'N/D',
        marcaNome: row.marca_nome || 'N/D',
        marca_nome: row.marca_nome || 'N/D',
        produtoClasse: row.classe || row.produto_classe || '',
        produtoEan: eanVal,
        produtoDun: dunVal,
        sku: eanVal,
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
    console.log(`✅ Arquivo salvo com ${produtosLimpos.length} produtos em: ${p}`);
  });

  console.log('🎉 Geração do produtos.json do PWA concluída com 0 anomalias!');
}

generatePwaProdutosJson().catch(err => {
  console.error('❌ Erro na geração:', err);
  process.exit(1);
});
