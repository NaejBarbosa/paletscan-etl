import * as fs from 'fs';
import * as path from 'path';

async function auditAuroraPwaReport() {
  const pwaJsonPath = '/root/repo_pwa/public/produtos.json';
  const auroraStagingPath = '/root/paletscan-etl/staging/aurora_staging_uuid.json';
  const publicImgDir = '/root/repo_pwa/public/imagens_produtos';
  const auroraPreparedDir = '/root/projetos-scraping/scraping-aurora/imagens_preparadas';

  const prodsPwa = JSON.parse(fs.readFileSync(pwaJsonPath, 'utf-8'));
  const auroraStaging = JSON.parse(fs.readFileSync(auroraStagingPath, 'utf-8'));

  const brandMap: Record<string, string> = {};
  (auroraStaging.marcas || []).forEach((m: any) => { brandMap[m.id] = m.nome; });

  const auroraProdsPwa = prodsPwa.filter((p: any) => {
    const bName = (p.marcaNome || '').toLowerCase();
    const dName = (p.produtoDescr || '').toLowerCase();
    return bName.includes('aurora') || bName.includes('nobre') || bName.includes('peperi') || bName.includes('gran mestri') ||
           dName.includes('aurora') || dName.includes('nobre') || dName.includes('peperi');
  });

  const totalAuroraPwa = auroraProdsPwa.length;
  let withLocalImage = 0;
  let withWebUrlOnly = 0;
  let withoutImage = 0;

  const listWithLocalImage: any[] = [];
  const listWithWebUrlOnly: any[] = [];
  const listWithoutImage: any[] = [];

  const byBrand: Record<string, { total: number; withImage: number; withoutImage: number }> = {};

  auroraProdsPwa.forEach((p: any) => {
    const brandName = p.marcaNome || 'Aurora';
    if (!byBrand[brandName]) {
      byBrand[brandName] = { total: 0, withImage: 0, withoutImage: 0 };
    }
    byBrand[brandName].total++;

    const ean = String(p.produtoEan || p.sku || '').trim();
    const fileWebp = `${ean}.webp`;
    const pathPublic = path.join(publicImgDir, fileWebp);
    const pathPrepared = path.join(auroraPreparedDir, fileWebp);

    const hasLocalFile = fs.existsSync(pathPublic) || fs.existsSync(pathPrepared);
    const url = p.imagem_url || p.imagemUrl;

    if (hasLocalFile) {
      withLocalImage++;
      byBrand[brandName].withImage++;
      listWithLocalImage.push(p);
    } else if (url && typeof url === 'string' && url.trim() !== '' && url !== 'null' && p.status_imagem !== 'SEM_IMAGEM') {
      withWebUrlOnly++;
      byBrand[brandName].withImage++;
      listWithWebUrlOnly.push(p);
    } else {
      withoutImage++;
      byBrand[brandName].withoutImage++;
      listWithoutImage.push(p);
    }
  });

  console.log('=== RELATÓRIO DIAGNÓSTICO DE IMAGENS DO PWA: AURORA & SUB-MARCAS ===\n');
  console.log(`📦 Total de Produtos Aurora / Nobre / Peperi no PWA: ${totalAuroraPwa}`);
  console.log(`🖼️  1. Produtos COM IMAGEM (Exibição Garantida no PWA): ${withLocalImage + withWebUrlOnly} (${(((withLocalImage + withWebUrlOnly)/totalAuroraPwa)*100).toFixed(1)}%)`);
  console.log(`   - Com Imagem Local (.webp 0ms no PWA): ${withLocalImage}`);
  console.log(`   - Com URL Web Oficial (Sitemap Aurora): ${withWebUrlOnly}`);
  console.log(`❌ 2. Produtos SEM IMAGEM (Itens Industriais / Corte a Granel): ${withoutImage} (${((withoutImage/totalAuroraPwa)*100).toFixed(1)}%)\n`);

  console.log('--- DISTRIBUIÇÃO POR MARCA DA HOLDING AURORA ---');
  Object.keys(byBrand).forEach(b => {
    const data = byBrand[b];
    const pct = ((data.withImage / data.total) * 100).toFixed(1);
    console.log(` * Marca ${b}: ${data.withImage} com imagem de ${data.total} (${pct}% com imagem | ${data.withoutImage} sem foto)`);
  });

  console.log('\n--- AMOSTRA DE PRODUTOS SEM IMAGEM (ITENS INDUSTRIAIS A GRANEL) ---');
  listWithoutImage.slice(0, 15).forEach((p, idx) => {
    console.log(`${idx + 1}. EAN: ${p.produtoEan || p.sku} | Marca: ${p.marcaNome} | ${p.produtoDescr}`);
  });
}

auditAuroraPwaReport();
