import * as fs from 'fs';
import * as path from 'path';

async function auditPwaImages() {
  const pwaJsonPath = '/root/repo_pwa/public/produtos.json';
  const publicImgDir = '/root/repo_pwa/public/imagens_produtos';

  if (!fs.existsSync(pwaJsonPath)) {
    console.error('Arquivo produtos.json não encontrado no PWA!');
    return;
  }

  const prods = JSON.parse(fs.readFileSync(pwaJsonPath, 'utf-8'));

  let total = prods.length;
  let relativeCount = 0;
  let relativeFound = 0;
  let relativeMissing = 0;
  let httpCount = 0;
  let noImgCount = 0;

  const missingRelativeFiles: string[] = [];

  prods.forEach((p: any) => {
    const url = p.imagem_url || p.imagemUrl;
    if (!url) {
      noImgCount++;
      return;
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      httpCount++;
    } else {
      relativeCount++;
      const filename = path.basename(url);
      const localFile = path.join(publicImgDir, filename);
      if (fs.existsSync(localFile)) {
        relativeFound++;
      } else {
        relativeMissing++;
        if (missingRelativeFiles.length < 15) {
          missingRelativeFiles.push(`${p.produtoEan || p.sku} | ${p.marcaNome} | ${p.produtoDescr} | URL: ${url}`);
        }
      }
    }
  });

  console.log('=== AUDITORIA DE IMAGENS NO REPOSITÓRIO PWA (produtos.json) ===');
  console.log('Total de produtos no PWA:', total);
  console.log('1. Produtos com URLs HTTP externas:', httpCount);
  console.log('2. Produtos com URLs relativas (/imagens_produtos/...):', relativeCount);
  console.log('   - Encontradas no disco (public/imagens_produtos/):', relativeFound);
  console.log('   - FALTANDO no disco (public/imagens_produtos/):', relativeMissing);
  console.log('3. Produtos sem imagem (null/vazio):', noImgCount);

  if (missingRelativeFiles.length > 0) {
    console.log('\nAmostra de produtos com URL relativa FALTANDO o arquivo físico no PWA:');
    missingRelativeFiles.forEach(f => console.log(' -', f));
  }
}

auditPwaImages();
