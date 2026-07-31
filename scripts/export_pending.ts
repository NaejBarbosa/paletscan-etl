import * as fs from 'fs';
import * as path from 'path';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

async function exportPendingToExcel() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  let pendingProducts: any[] = [];
  let barcodeMap: Record<string, string[]> = {};
  let brandMap: Record<string, string> = {};
  let fabMap: Record<string, string> = {};

  if (url && key) {
    const supabase = createClient(url, key);

    // Fetch pending products
    const { data: prods, error: prodErr } = await supabase
      .from('produtos')
      .select('*')
      .eq('status_imagem', 'pendente_aprovacao');

    if (!prodErr && prods) {
      pendingProducts = prods;
    }

    // Fetch brands
    const { data: brands } = await supabase.from('marcas').select('*');
    (brands || []).forEach((b: any) => { brandMap[b.id] = b.nome; });

    // Fetch manufacturers
    const { data: fabs } = await supabase.from('fabricantes').select('*');
    (fabs || []).forEach((f: any) => { fabMap[f.id] = f.nome; });

    // Fetch bar codes
    if (pendingProducts.length > 0) {
      const prodIds = pendingProducts.map((p: any) => p.id);
      const { data: codes } = await supabase
        .from('codigos_barras')
        .select('*')
        .in('produto_id', prodIds);

      (codes || []).forEach((cb: any) => {
        if (!barcodeMap[cb.produto_id]) barcodeMap[cb.produto_id] = [];
        barcodeMap[cb.produto_id].push(`${cb.tipo}: ${cb.codigo}`);
      });
    }
  }

  // Fallback to local staging if Supabase returned 0
  if (pendingProducts.length === 0) {
    const brfPath = path.resolve('staging/brf_staging.json');
    if (fs.existsSync(brfPath)) {
      const brf = JSON.parse(fs.readFileSync(brfPath, 'utf8'));
      (brf.marcas || []).forEach((m: any) => { brandMap[m.id] = m.nome; });
      (brf.fabricantes || []).forEach((f: any) => { fabMap[f.id] = f.nome; });

      (brf.codigos_barras || []).forEach((cb: any) => {
        if (!barcodeMap[cb.produto_id]) barcodeMap[cb.produto_id] = [];
        barcodeMap[cb.produto_id].push(`${cb.tipo}: ${cb.codigo}`);
      });

      pendingProducts = (brf.produtos || []).filter((p: any) => p.status_imagem === 'pendente_aprovacao');
    }
  }

  const excelRows = pendingProducts.map((p: any, idx: number) => ({
    '# Item': idx + 1,
    'ID Produto': p.id,
    'Fabricante': fabMap[p.fabricante_id] || 'BRF S.A.',
    'Marca': brandMap[p.marca_id] || p.marca_id || 'Sadia/Perdigão',
    'Descrição Padronizada': p.descricao_padronizada,
    'Descrição Original': p.descricao_original,
    'Classe': p.classe,
    'Conservação': p.conservacao,
    'Peso (g)': p.peso_gramas !== null && p.peso_gramas !== undefined ? p.peso_gramas : 'Variável (pesar)',
    'Fracionado': p.fracionado ? 'Sim' : 'Não',
    'Códigos de Barras / SKUs': (barcodeMap[p.id] || []).join(' | '),
    'Status Imagem': p.status_imagem,
    'URL Imagem para Revisão': p.imagem_url || '',
    'Data Criado': p.criado_em
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelRows);

  // Set column widths
  ws['!cols'] = [
    { wch: 8 },  // # Item
    { wch: 38 }, // ID
    { wch: 15 }, // Fabricante
    { wch: 15 }, // Marca
    { wch: 45 }, // Descricao Padronizada
    { wch: 45 }, // Descricao Original
    { wch: 12 }, // Classe
    { wch: 12 }, // Conservacao
    { wch: 12 }, // Peso
    { wch: 10 }, // Fracionado
    { wch: 35 }, // Codigos
    { wch: 20 }, // Status
    { wch: 60 }, // URL
    { wch: 24 }  // Data
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Imagens Pendentes (42)');

  const filename = 'Produtos_Pendentes_Aprovacao.xlsx';
  const targetDirs = ['/storage/emulated/0/Download', '/sdcard/Download', '/root/Downloads'];
  const savedPaths: string[] = [];

  targetDirs.forEach(dir => {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const targetPath = path.join(dir, filename);
      XLSX.writeFile(wb, targetPath);
      savedPaths.push(targetPath);

      // Set permissions
      execSync(`chmod 666 "${targetPath}" 2>/dev/null || true`);
      // Scan media
      execSync(`termux-media-scan "${targetPath}" 2>/dev/null || true`);
    } catch (err: any) {
      console.error(`Erro salvando em ${dir}:`, err.message);
    }
  });

  console.log('SUCCESS_EXPORT_PENDING:', JSON.stringify(savedPaths));
}

exportPendingToExcel().catch(err => {
  console.error('EXPORT_ERROR:', err);
  process.exit(1);
});
