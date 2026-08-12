import * as fs from 'fs';
import * as path from 'path';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface ProductWithImageRow {
  'ID / UUID': string;
  'Fabricante': string;
  'Marca': string;
  'Descrição Padronizada': string;
  'Descrição Original': string;
  'Classe': string;
  'Conservação': string;
  'Peso (g)': string | number;
  'Fracionado': string;
  'Códigos EAN / DUN': string;
  'Status da Imagem': string;
  'URL da Imagem': string;
  'Data de Registro': string;
}

async function exportProductsWithImages() {
  console.log('📊 === INICIANDO EXPORTAÇÃO EXCEL DE PRODUTOS COM IMAGEM ===\n');

  let allProducts: any[] = [];
  let allCodes: any[] = [];
  let allBrands: Record<string, string> = {};
  let allFabs: Record<string, string> = {};

  // Tenta buscar diretamente da base mestre do Supabase se configurado
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      console.log('📡 Buscando produtos com imagem diretamente do banco mestre Supabase...');
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

      // Fabricantes
      const { data: fabs } = await supabase.from('fabricantes').select('*');
      (fabs || []).forEach(f => { allFabs[f.id] = f.nome; });

      // Marcas
      const { data: marcas } = await supabase.from('marcas').select('*');
      (marcas || []).forEach(m => { allBrands[m.id] = m.nome; });

      // Produtos com imagem
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data: prods, error } = await supabase
          .from('produtos')
          .select('*')
          .not('imagem_url', 'is', null)
          .neq('status_imagem', 'SEM_IMAGEM')
          .range(from, from + pageSize - 1);

        if (error || !prods || prods.length === 0) break;
        allProducts = allProducts.concat(prods);
        if (prods.length < pageSize) break;
        from += pageSize;
      }

      // Códigos de barras
      from = 0;
      while (true) {
        const { data: cods, error } = await supabase
          .from('codigos_barras')
          .select('*')
          .range(from, from + pageSize - 1);

        if (error || !cods || cods.length === 0) break;
        allCodes = allCodes.concat(cods);
        if (cods.length < pageSize) break;
        from += pageSize;
      }

      console.log(`[+] Encontrados ${allProducts.length} produtos com imagem no Supabase.`);
    } catch (err: any) {
      console.warn(`[!] Falha na consulta ao Supabase: ${err.message}. Recorrendo aos arquivos de Staging...`);
      allProducts = [];
    }
  }

  // Fallback / Leitura dos arquivos de staging se Supabase zerado ou inacessível
  if (allProducts.length === 0) {
    console.log('📂 Lendo arquivos de staging relacionais (staging/*_staging_uuid.json)...');
    const stagingDir = path.resolve('staging');
    const stagingFiles = fs.readdirSync(stagingDir)
      .filter(f => f.endsWith('_staging_uuid.json') || (f.endsWith('_staging.json') && !f.endsWith('_uuid.json')));

    for (const file of stagingFiles) {
      const filePath = path.join(stagingDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        (data.fabricantes || []).forEach((f: any) => { allFabs[f.id] = f.nome; });
        (data.marcas || []).forEach((m: any) => { allBrands[m.id] = m.nome; });
        (data.codigos_barras || []).forEach((cb: any) => { allCodes.push(cb); });

        (data.produtos || []).forEach((p: any) => {
          if (p.imagem_url && p.imagem_url.trim() !== '' && p.status_imagem !== 'SEM_IMAGEM') {
            allProducts.push(p);
          }
        });
      } catch {}
    }
    console.log(`[+] Encontrados ${allProducts.length} produtos com imagem nos arquivos de staging.`);
  }

  // Mapear códigos por produto_id
  const codeMap: Record<string, string[]> = {};
  allCodes.forEach(cb => {
    if (!codeMap[cb.produto_id]) codeMap[cb.produto_id] = [];
    codeMap[cb.produto_id].push(`${cb.tipo}: ${cb.codigo}`);
  });

  // Construir linhas tratadas
  const rows: ProductWithImageRow[] = allProducts.map(p => ({
    'ID / UUID': p.id,
    'Fabricante': allFabs[p.fabricante_id] || p.fabricante_id || 'Não especificado',
    'Marca': allBrands[p.marca_id] || p.marca_id || 'Não especificada',
    'Descrição Padronizada': p.descricao_padronizada || '',
    'Descrição Original': p.descricao_original || '',
    'Classe': p.classe || 'Carnes',
    'Conservação': p.conservacao || 'Resfriado',
    'Peso (g)': p.peso_gramas !== null && p.peso_gramas !== undefined ? p.peso_gramas : 'Variável (pesar)',
    'Fracionado': p.fracionado ? 'Sim' : 'Não',
    'Códigos EAN / DUN': (codeMap[p.id] || []).join(' | '),
    'Status da Imagem': p.status_imagem || 'VALIDATED',
    'URL da Imagem': p.imagem_url || '',
    'Data de Registro': p.criado_em || new Date().toISOString()
  }));

  // Agrupar por fabricante para criar abas dedicadas
  const rowsByFab: Record<string, ProductWithImageRow[]> = {};
  rows.forEach(r => {
    const fabName = r['Fabricante'].substring(0, 30); // Limite nome da aba Excel
    if (!rowsByFab[fabName]) rowsByFab[fabName] = [];
    rowsByFab[fabName].push(r);
  });

  // Criar Pasta de Trabalho Excel (.xlsx)
  const wb = XLSX.utils.book_new();

  // 1. Aba Geral (Todos os produtos com imagem)
  const wsGeneral = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, wsGeneral, 'Todos Produtos com Imagem');

  // 2. Abas individuais por Fabricante
  Object.keys(rowsByFab).forEach(fabName => {
    const cleanSheetName = fabName.replace(/[:\\/?*\[\]]/g, '_');
    const wsFab = XLSX.utils.json_to_sheet(rowsByFab[fabName]);
    XLSX.utils.book_append_sheet(wb, wsFab, cleanSheetName);
  });

  // 3. Aba de Resumo Estatístico
  const summaryRows = [
    { 'Métrica': 'Total de Produtos com Imagem', 'Valor': rows.length },
    ...Object.keys(rowsByFab).map(fab => ({
      'Métrica': `Produtos com Imagem - ${fab}`,
      'Valor': rowsByFab[fab].length
    })),
    { 'Métrica': 'Data da Exportação', 'Valor': new Date().toLocaleString('pt-BR') }
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Estatístico');

  // Salvar em múltiplos caminhos de Download para compatibilidade com Termux / Android
  const targetFileName = 'PaletScan_Produtos_Com_Imagem.xlsx';
  const candidateDirs = [
    '/storage/emulated/0/Download',
    '/sdcard/Download',
    '/root/Downloads',
    path.resolve('staging')
  ];

  const savedPaths: string[] = [];

  for (const dir of candidateDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const fullPath = path.join(dir, targetFileName);
      XLSX.writeFile(wb, fullPath);
      savedPaths.push(fullPath);

      // Notifica o indexador de mídia do Android via termux-media-scan se disponível
      try {
        execSync(`termux-media-scan "${fullPath}"`, { stdio: 'ignore' });
      } catch {}
    } catch (err: any) {
      console.warn(`[!] Não foi possível salvar em ${dir}: ${err.message}`);
    }
  }

  console.log('\n==================================================');
  console.log('✅ RELATÓRIO EXCEL GERADO COM SUCESSO!');
  console.log(`📊 Total de produtos exportados com imagem: ${rows.length}`);
  console.log('📁 Arquivos salvos nos seguintes caminhos:');
  savedPaths.forEach(p => console.log(`   - ${p}`));
  console.log('==================================================\n');
}

exportProductsWithImages();
