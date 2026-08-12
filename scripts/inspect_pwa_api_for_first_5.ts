import * as fs from 'fs';
import * as path from 'path';

async function inspectPwaApiForFirst5() {
  const pwaJsonPath = '/root/repo_pwa/public/produtos.json';
  const targetEans = ['7891164027759', '7891164016340', '7891164020903', '7891164156008', '7891164028640'];

  console.log('=== INSPECTION OF FIRST 5 EANS IN produtos.json ===\n');

  if (!fs.existsSync(pwaJsonPath)) {
    console.error('produtos.json não encontrado!');
    return;
  }

  const produtos: any[] = JSON.parse(fs.readFileSync(pwaJsonPath, 'utf-8'));

  targetEans.forEach(target => {
    const prod = produtos.find(p => String(p.produtoEan || p.ean || p.sku || '').trim() === target);
    if (prod) {
      console.log(`EAN ${target}:`);
      console.log(`  Descrição: ${prod.produtoDescr || prod.descricao}`);
      console.log(`  imagemUrl: "${prod.imagemUrl}"`);
      console.log(`  imagem_url: "${prod.imagem_url}"`);
      console.log(`  statusImagem: "${prod.statusImagem}"`);
      console.log(`  status_imagem: "${prod.status_imagem}"`);
    } else {
      console.log(`[!] EAN ${target} NÃO ENCONTRADO em produtos.json!`);
    }
    console.log('--------------------------------------------------');
  });
}

inspectPwaApiForFirst5();
