import * as fs from 'fs';
import * as path from 'path';

async function auditEanImages() {
  const pwaJsonPath = '/root/repo_pwa/public/produtos.json';
  const publicImgDir = '/root/repo_pwa/public/imagens_produtos';
  const auroraPreparedDir = '/root/projetos-scraping/scraping-aurora/imagens_preparadas';

  const prods = JSON.parse(fs.readFileSync(pwaJsonPath, 'utf-8'));
  const total = prods.length;

  let hasLocalInPublic = 0;
  let hasLocalInAurora = 0;
  let missingLocal = 0;

  const auroraMissing: string[] = [];

  prods.forEach((p: any) => {
    const ean = String(p.produtoEan || p.sku || '').trim();
    const isAurora = (p.marcaNome || '').toLowerCase().includes('aurora') ||
                     (p.marcaNome || '').toLowerCase().includes('nobre') ||
                     (p.marcaNome || '').toLowerCase().includes('peperi');

    const fileWebp = `${ean}.webp`;
    const publicPath = path.join(publicImgDir, fileWebp);
    const auroraPath = path.join(auroraPreparedDir, fileWebp);

    if (fs.existsSync(publicPath)) {
      hasLocalInPublic++;
    } else if (fs.existsSync(auroraPath)) {
      hasLocalInAurora++;
    } else {
      missingLocal++;
      if (isAurora) {
        auroraMissing.push(`${ean} | ${p.marcaNome} | ${p.produtoDescr} | URL atual: ${p.imagem_url}`);
      }
    }
  });

  console.log('=== AUDITORIA DE IMAGENS EAN E SYNC COM REPO_PWA ===');
  console.log('Total de produtos no PWA:', total);
  console.log('1. Possui imagem local em repo_pwa/public/imagens_produtos/<EAN>.webp:', hasLocalInPublic);
  console.log('2. Possui imagem em Aurora imagens_preparadas/<EAN>.webp (Pronta para sincronizar):', hasLocalInAurora);
  console.log('3. Produtos sem imagem local em disco:', missingLocal);

  if (auroraMissing.length > 0) {
    console.log(`\n[!] ${auroraMissing.length} produtos Aurora sem imagem local no disco PWA:`);
    auroraMissing.slice(0, 10).forEach(m => console.log(' -', m));
  }
}

auditEanImages();
