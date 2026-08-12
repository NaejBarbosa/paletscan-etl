import * as fs from 'fs';
import * as path from 'path';

async function auditAuroraFinalPercentage() {
  const pwaJsonPath = '/root/repo_pwa/public/produtos.json';
  const publicImgDir = '/root/repo_pwa/public/imagens_produtos';

  if (!fs.existsSync(pwaJsonPath)) {
    console.error('produtos.json não encontrado!');
    return;
  }

  const produtos: any[] = JSON.parse(fs.readFileSync(pwaJsonPath, 'utf-8'));

  const auroraBrands = [
    'aurora', 'aurora alimentos', 'aurora coop', 'aurora premium',
    'aurora bem leve', 'nobre', 'nobreza', 'lanche nobreza', 'peperi', 'gran mestri'
  ];

  const auroraProds = produtos.filter((p: any) => {
    const m = (p.marcaNome || p.marcaDescr || p.marca_nome || p.marca || '').toLowerCase().trim();
    return auroraBrands.some(b => m.includes(b));
  });

  const total = auroraProds.length;
  let withWebpDisk = 0;
  let withUrl = 0;
  let missingWebpDisk = 0;
  let industrialBulk = 0;

  const brandStats: Record<string, { total: number; withImage: number }> = {};

  auroraProds.forEach((p: any) => {
    const ean = String(p.produtoEan || p.ean || p.sku || '').trim();
    const marca = p.marcaNome || p.marcaDescr || p.marca_nome || 'Outros';

    if (!brandStats[marca]) brandStats[marca] = { total: 0, withImage: 0 };
    brandStats[marca].total++;

    const imgUrl = (p.imagemUrl || p.imagem_url || '').trim();
    const fileWebp = `${ean}.webp`;
    const localPath = path.join(publicImgDir, fileWebp);
    const existsOnDisk = ean && /^\d+$/.test(ean) && fs.existsSync(localPath);

    if (existsOnDisk) {
      withWebpDisk++;
      withUrl++;
      brandStats[marca].withImage++;
    } else if (imgUrl && imgUrl.startsWith('http')) {
      withUrl++;
      brandStats[marca].withImage++;
    } else {
      industrialBulk++;
    }
  });

  const pctTotalWithImage = ((withUrl / total) * 100).toFixed(2);
  const pctWebpLocal = ((withWebpDisk / total) * 100).toFixed(2);

  console.log('=== AUDITORIA DE PERCENTUAL DE IMAGENS: AURORA COOP & SUB-MARCAS ===\n');
  console.log(`📦 Total de Produtos Aurora Coop no Catálogo PWA: ${total}`);
  console.log(`🖼️  1. Produtos COM IMAGEM VINCULADA: ${withUrl} de ${total} (${pctTotalWithImage}%)`);
  console.log(`   ⚡ Com Imagem Local WebP em Disco (0ms offline): ${withWebpDisk} (${pctWebpLocal}%)`);
  console.log(`   🌐 Com URL Remota Oficial: ${withUrl - withWebpDisk}`);
  console.log(`📦 2. Produtos Sem Imagem (Itens Industriais / Cortes a Granel B2B): ${industrialBulk} (${((industrialBulk/total)*100).toFixed(2)}%)\n`);

  console.log('--- DETALHAMENTO POR MARCA DA HOLDING AURORA COOP ---');
  Object.keys(brandStats).forEach(b => {
    const s = brandStats[b];
    const pct = ((s.withImage / s.total) * 100).toFixed(1);
    console.log(` * Marca ${b}: ${s.withImage} de ${s.total} com imagem (${pct}%)`);
  });
  console.log('==================================================\n');
}

auditAuroraFinalPercentage();
