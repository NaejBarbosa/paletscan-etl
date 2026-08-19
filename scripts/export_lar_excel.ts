import * as fs from 'fs';
import * as path from 'path';
import XLSX from 'xlsx';
import { formatProductDescription } from '../core/normalizers/text_parser';
import { execSync } from 'child_process';

const STAGING_DIR = path.resolve('staging');
const larPath = path.join(STAGING_DIR, 'lar_staging.json');

if (!fs.existsSync(larPath)) {
  console.error(`❌ Arquivo ${larPath} não encontrado.`);
  process.exit(1);
}

const larData = JSON.parse(fs.readFileSync(larPath, 'utf8'));

const wb = XLSX.utils.book_new();

const brandMap: Record<string, string> = {};
(larData.marcas || []).forEach((m: any) => {
  brandMap[m.id] = m.nome;
});

const fabMap: Record<string, string> = {};
(larData.fabricantes || []).forEach((f: any) => {
  fabMap[f.id] = f.nome;
});

const codeMap: Record<string, string[]> = {};
(larData.codigos_barras || []).forEach((cb: any) => {
  if (!codeMap[cb.produto_id]) codeMap[cb.produto_id] = [];
  codeMap[cb.produto_id].push(`${cb.tipo}: ${cb.codigo}`);
});

const prodMap: Record<string, string> = {};

const prodRows = (larData.produtos || []).map((p: any) => {
  const descrPadronizada = p.descricao_padronizada || p.descricao_original || p.title || '';
  prodMap[p.id] = descrPadronizada;

  const pesoG = p.peso_gramas !== null && p.peso_gramas !== undefined ? p.peso_gramas : null;
  const fracionado = p.fracionado !== undefined ? p.fracionado : (pesoG === null);

  let pesoStr = 'Variável (pesar)';
  if (pesoG !== null && pesoG !== undefined) {
    if (pesoG >= 1000) {
      pesoStr = `${(pesoG / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`;
    } else {
      pesoStr = `${pesoG} g`;
    }
  }

  return {
    'ID Produto': p.id,
    'Fabricante': fabMap[p.fabricante_id] || 'Lar Cooperativa Agroindustrial',
    'Marca': brandMap[p.marca_id] || 'Lar',
    'Descrição Padronizada': descrPadronizada,
    'Descrição Original': p.descricao_original || p.title || '',
    'Classe': p.classe || '',
    'Conservação': p.conservacao || '',
    'Peso (g)': pesoG !== null ? pesoG : 'N/D',
    'Peso Formatado': pesoStr,
    'Fracionado (Peso Variável)': fracionado ? 'Sim' : 'Não',
    'Códigos EAN / DUN': (codeMap[p.id] || []).join(' | '),
    'Status Imagem': p.status_imagem || 'VALIDATED',
    'URL Imagem': p.imagem_url || '',
    'Data Extração': p.criado_em || new Date().toISOString()
  };
});

const codeRows = (larData.codigos_barras || []).map((cb: any) => ({
  'ID Código': cb.id,
  'ID Produto': cb.produto_id,
  'Produto': prodMap[cb.produto_id] || '',
  'Tipo': cb.tipo,
  'Código Barcode': cb.codigo,
  'Data Criado': cb.criado_em || new Date().toISOString()
}));

const wsProd = XLSX.utils.json_to_sheet(prodRows);
const wsCode = XLSX.utils.json_to_sheet(codeRows);

XLSX.utils.book_append_sheet(wb, wsProd, 'Produtos Lar');
XLSX.utils.book_append_sheet(wb, wsCode, 'Códigos EAN-DUN Lar');

const targetDirs = [
  '/storage/emulated/0/Download',
  '/sdcard/Download',
  '/root/Downloads',
  '/root/Download',
  path.join(process.cwd(), 'staging')
];

const savedPaths: string[] = [];

targetDirs.forEach(dir => {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const targetPath = path.join(dir, 'Relatorio_Base_Lar.xlsx');
    XLSX.writeFile(wb, targetPath);
    savedPaths.push(targetPath);

    // Tenta avisar o scanner do Android (Termux)
    try {
      execSync(`termux-media-scan "${targetPath}"`, { stdio: 'ignore' });
    } catch {
      // Ignora se não estiver no ambiente Termux
    }
  } catch (err: any) {
    console.error(`Erro ao salvar em ${dir}:`, err.message);
  }
});

console.log('✅ EXPORT_LAR_SUCCESS:', JSON.stringify(savedPaths, null, 2));
