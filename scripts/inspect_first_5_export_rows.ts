import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

async function inspectFirst5ExportRows() {
  const downloadPath = '/storage/emulated/0/Download/PaletScan_Aurora_Coop_Produtos_Com_Imagem.xlsx';
  const localBackupPath = '/root/paletscan-etl/exports/PaletScan_Aurora_Coop_Produtos_Com_Imagem.xlsx';
  
  const targetPath = fs.existsSync(downloadPath) ? downloadPath : localBackupPath;
  console.log(`Reading export file from: ${targetPath}`);

  const wb = XLSX.readFile(targetPath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet);

  console.log(`Total rows in sheet: ${rows.length}`);
  console.log('\n=== FIRST 5 ROWS IN THE REPORT ===\n');

  const publicImgDir = '/root/repo_pwa/public/imagens_produtos';
  const first5 = rows.slice(0, 5);

  first5.forEach((r, idx) => {
    const ean = String(r['Código EAN-13'] || '').trim();
    const descr = r['Descrição Padronizada'];
    const marca = r['Marca / Sub-marca'];
    const imgUrlInReport = r['URL / Caminho da Imagem'];
    const localWebpFile = path.join(publicImgDir, `${ean}.webp`);
    const fileExists = fs.existsSync(localWebpFile);

    console.log(`Row #${idx + 1}:`);
    console.log(`  EAN: ${ean}`);
    console.log(`  Marca: ${marca}`);
    console.log(`  Descrição: ${descr}`);
    console.log(`  URL no Relatório: ${imgUrlInReport}`);
    console.log(`  Existe em public/imagens_produtos/${ean}.webp: ${fileExists}`);
    if (fileExists) {
      const stats = fs.statSync(localWebpFile);
      console.log(`  Tamanho do arquivo no disco: ${stats.size} bytes`);
    }
    console.log('--------------------------------------------------');
  });
}

inspectFirst5ExportRows();
