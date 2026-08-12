import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as XLSX from 'xlsx';

async function exportAuroraApenasComImagem() {
  console.log('📊 === INICIANDO EXPORTAÇÃO XLSX: AURORA COOP APENAS COM IMAGEM ===\n');

  const pwaJsonPath = '/root/repo_pwa/public/produtos.json';
  const publicImgDir = '/root/repo_pwa/public/imagens_produtos';

  if (!fs.existsSync(pwaJsonPath)) {
    console.error('Arquivo produtos.json do PWA não encontrado!');
    return;
  }

  const produtos: any[] = JSON.parse(fs.readFileSync(pwaJsonPath, 'utf-8'));

  const auroraBrands = [
    'aurora', 'aurora alimentos', 'aurora coop', 'aurora premium',
    'aurora bem leve', 'nobre', 'nobreza', 'lanche nobreza', 'peperi', 'gran mestri'
  ];

  // 1. Filtrar apenas produtos da Aurora Coop e sub-marcas COM IMAGEM
  const exportRows: any[] = [];

  produtos.forEach((p: any) => {
    const marcaNome = (p.marcaNome || p.marcaDescr || p.marca_nome || p.marca || '').trim();
    const marcaLower = marcaNome.toLowerCase();

    const isAurora = auroraBrands.some(b => marcaLower.includes(b));
    if (!isAurora) return;

    const ean = String(p.produtoEan || p.ean || p.sku || '').trim();
    const dun = String(p.produtoDun || p.dun || '').trim();
    const imgUrl = (p.imagemUrl || p.imagem_url || '').trim();

    const fileWebp = `${ean}.webp`;
    const localPath = path.join(publicImgDir, fileWebp);
    const existsOnDisk = ean && /^\d+$/.test(ean) && fs.existsSync(localPath);

    // Condição de ter imagem: existir o arquivo WebP em disco OU ter URL HTTP válida
    const hasImage = existsOnDisk || (imgUrl && imgUrl.startsWith('http'));

    if (hasImage) {
      exportRows.push({
        'SKU / ID Produto': p.sku || p.id || ean,
        'Código EAN-13': ean,
        'Código DUN-14': dun || 'N/D',
        'Marca / Sub-marca': marcaNome || 'Aurora Coop',
        'Descrição Padronizada': p.produtoDescr || p.descricao || p.title || 'N/D',
        'Classe de Alimento': p.produtoClasse || p.classe || 'Industrializados',
        'Conservação': p.produtoConservacao || p.conservacao || 'Resfriado',
        'URL / Caminho da Imagem': existsOnDisk ? `/imagens_produtos/${fileWebp}` : imgUrl,
        'Status da Imagem': 'VALIDATED',
        'Formato / Origem': existsOnDisk ? 'WebP Local (0ms offline)' : 'URL Web Oficial'
      });
    }
  });

  console.log(`[+] Identificados ${exportRows.length} produtos da Aurora Coop COM IMAGEM.`);

  // 2. Criar a planilha Excel via XLSX
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportRows);

  // Definir larguras de colunas para formatação profissional
  ws['!cols'] = [
    { wch: 38 }, // SKU / ID
    { wch: 16 }, // EAN
    { wch: 18 }, // DUN
    { wch: 22 }, // Marca
    { wch: 55 }, // Descrição
    { wch: 20 }, // Classe
    { wch: 15 }, // Conservação
    { wch: 45 }, // URL Imagem
    { wch: 16 }, // Status
    { wch: 25 }, // Formato
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Aurora Coop Com Imagem');

  // 3. Salvar na pasta de Download do dispositivo (/storage/emulated/0/Download)
  const downloadDir = '/storage/emulated/0/Download';
  const fileName = 'PaletScan_Aurora_Coop_Produtos_Com_Imagem.xlsx';
  let targetPath = path.join(downloadDir, fileName);

  try {
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    XLSX.writeFile(wb, targetPath);
    console.log(`✅ Relatório salvo na pasta Download do dispositivo: ${targetPath}`);
  } catch (err: any) {
    console.warn(`[!] Não foi possível salvar diretamente em ${downloadDir}: ${err.message}`);
    const fallbackDir = '/root/paletscan-etl/exports';
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
    targetPath = path.join(fallbackDir, fileName);
    XLSX.writeFile(wb, targetPath);
    console.log(`✅ Relatório salvo na pasta local de exportações: ${targetPath}`);
  }

  // Cópia garantida de backup em /root/paletscan-etl/exports/
  const localBackupDir = '/root/paletscan-etl/exports';
  if (!fs.existsSync(localBackupDir)) fs.mkdirSync(localBackupDir, { recursive: true });
  const localBackupPath = path.join(localBackupDir, fileName);
  XLSX.writeFile(wb, localBackupPath);

  // 4. Acionar o scanner de mídia do Android (termux-media-scan)
  try {
    const scanCmd = `/data/data/com.termux/files/usr/bin/termux-media-scan "${targetPath}"`;
    execSync(scanCmd, { stdio: 'ignore' });
    console.log('[+] Scanner de mídia do Android (termux-media-scan) executado com sucesso.');
  } catch {
    // Ignora se não estiver em ambiente Termux Android
  }

  console.log('\n==================================================');
  console.log('🎉 RELATÓRIO XLSX EXPORTADO COM SUCESSO!');
  console.log(`📄 Nome do Arquivo: ${fileName}`);
  console.log(`📊 Total de Produtos Exportados (Apenas Com Imagem): ${exportRows.length}`);
  console.log(`📍 Caminho: ${targetPath}`);
  console.log('==================================================\n');
}

exportAuroraApenasComImagem();
