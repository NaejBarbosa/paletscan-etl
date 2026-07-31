import * as fs from 'fs';
import * as path from 'path';
import XLSX from 'xlsx';

const STAGING_DIR = path.resolve('staging');
const brfPath = path.join(STAGING_DIR, 'brf_staging.json');
const friboiPath = path.join(STAGING_DIR, 'friboi_staging.json');

const brfData = JSON.parse(fs.readFileSync(brfPath, 'utf8'));
const friboiData = JSON.parse(fs.readFileSync(friboiPath, 'utf8'));

const wb = XLSX.utils.book_new();

// Map marcas
const brandMap: Record<string, string> = {};
[...(brfData.marcas || []), ...(friboiData.marcas || [])].forEach((m: any) => {
  brandMap[m.id] = m.nome;
});

// Map fabricantes
const fabMap: Record<string, string> = {};
[...(brfData.fabricantes || []), ...(friboiData.fabricantes || [])].forEach((f: any) => {
  fabMap[f.id] = f.nome;
});

function buildProductRows(data: any, fabDefault: string) {
  const codeMap: Record<string, string[]> = {};
  (data.codigos_barras || []).forEach((cb: any) => {
    if (!codeMap[cb.produto_id]) codeMap[cb.produto_id] = [];
    codeMap[cb.produto_id].push(`${cb.tipo}: ${cb.codigo}`);
  });

  return (data.produtos || []).map((p: any) => ({
    'ID Produto': p.id,
    'Fabricante': fabMap[p.fabricante_id] || fabDefault,
    'Marca': brandMap[p.marca_id] || p.marca_id,
    'Descrição Padronizada': p.descricao_padronizada,
    'Descrição Original': p.descricao_original,
    'Classe': p.classe,
    'Conservação': p.conservacao,
    'Peso (g)': p.peso_gramas !== null && p.peso_gramas !== undefined ? p.peso_gramas : 'Variável (pesar)',
    'Fracionado': p.fracionado ? 'Sim' : 'Não',
    'Códigos de Barras / SKUs': (codeMap[p.id] || []).join(' | '),
    'Status Imagem': p.status_imagem,
    'URL Imagem': p.imagem_url || '',
    'Data Criado': p.criado_em
  }));
}

function buildBarCodeRows(data: any) {
  const prodMap: Record<string, string> = {};
  (data.produtos || []).forEach((p: any) => {
    prodMap[p.id] = p.descricao_padronizada;
  });

  return (data.codigos_barras || []).map((cb: any) => ({
    'ID Código': cb.id,
    'ID Produto': cb.produto_id,
    'Produto': prodMap[cb.produto_id] || '',
    'Tipo': cb.tipo,
    'Código': cb.codigo,
    'Embalagem': cb.embalagem || '',
    'Quantidade Embalagem': cb.quantidade_embalagem || '',
    'Data Criado': cb.criado_em
  }));
}

const brfProdRows = buildProductRows(brfData, 'BRF S.A.');
const brfCodeRows = buildBarCodeRows(brfData);

const friboiProdRows = buildProductRows(friboiData, 'Friboi / JBS');
const friboiCodeRows = buildBarCodeRows(friboiData);

const wsBrfProd = XLSX.utils.json_to_sheet(brfProdRows);
const wsBrfCode = XLSX.utils.json_to_sheet(brfCodeRows);
const wsFriProd = XLSX.utils.json_to_sheet(friboiProdRows);
const wsFriCode = XLSX.utils.json_to_sheet(friboiCodeRows);

XLSX.utils.book_append_sheet(wb, wsBrfProd, 'Produtos BRF');
XLSX.utils.book_append_sheet(wb, wsBrfCode, 'EAN-DUN BRF');
XLSX.utils.book_append_sheet(wb, wsFriProd, 'Produtos Friboi');
XLSX.utils.book_append_sheet(wb, wsFriCode, 'EAN-DUN Friboi');

const targetDirs = ['/storage/emulated/0/Download', '/sdcard/Download', '/root/Downloads'];
let savedPaths: string[] = [];

targetDirs.forEach(dir => {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const targetPath = path.join(dir, 'PaletScan_ETL_Produtos.xlsx');
    XLSX.writeFile(wb, targetPath);
    savedPaths.push(targetPath);
  } catch (err: any) {
    console.error(`Erro ao salvar em ${dir}:`, err.message);
  }
});

console.log('EXPORT_SUCCESS:', JSON.stringify(savedPaths));
