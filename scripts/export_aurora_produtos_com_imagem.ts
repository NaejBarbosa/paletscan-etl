import * as fs from 'fs';
import * as path from 'path';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { toUUID5 } from '../db_sync/sync';
import { FABRICANTE_AURORA_ID } from '../core/heuristics/brand_classifier';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface AuroraProductRow {
  'SKU / ID': string;
  'Fabricante': string;
  'Marca': string;
  'Descrição Padronizada': string;
  'Descrição Original': string;
  'Classe': string;
  'Conservação': string;
  'Peso (g)': string | number;
  'Fracionado': string;
  'Códigos EAN-13 / DUN-14': string;
  'Status da Imagem': string;
  'URL da Imagem': string;
  'Data de Registro': string;
}

interface AuroraBarcodeRow {
  'ID Código': string;
  'ID Produto': string;
  'Produto': string;
  'Tipo': string;
  'Código de Barras': string;
  'Embalagem': string;
  'Data de Registro': string;
}

async function exportAuroraProductsWithImages() {
  console.log('📊 === INICIANDO EXPORTAÇÃO EXCEL: APENAS AURORA E MARCAS AGREGADAS ===\n');

  const auroraFabUUID = toUUID5(FABRICANTE_AURORA_ID); // '6a1c57e1-a437-5697-b3d8-05cf5b2a75c1'
  const auroraFabName = 'Cooperativa Central Aurora Alimentos';

  let auroraProducts: any[] = [];
  let auroraCodes: any[] = [];
  let auroraBrandsMap: Record<string, string> = {};

  // 1. Tenta buscar da fonte de staging da Aurora primeiro (base local garantida 100%)
  const stagingDir = path.resolve('staging');
  const auroraStagingUuidFile = path.join(stagingDir, 'aurora_staging_uuid.json');
  const auroraStagingRawFile = path.join(stagingDir, 'aurora_staging.json');
  const targetStaging = fs.existsSync(auroraStagingUuidFile) ? auroraStagingUuidFile : auroraStagingRawFile;

  if (fs.existsSync(targetStaging)) {
    console.log(`📂 Lendo staging oficial da Aurora (${path.basename(targetStaging)})...`);
    const data = JSON.parse(fs.readFileSync(targetStaging, 'utf-8'));
    (data.marcas || []).forEach((m: any) => { auroraBrandsMap[m.id] = m.nome; });
    (data.codigos_barras || []).forEach((cb: any) => { auroraCodes.push(cb); });

    (data.produtos || []).forEach((p: any) => {
      if (p.imagem_url && p.imagem_url.trim() !== '' && p.status_imagem !== 'SEM_IMAGEM') {
        auroraProducts.push(p);
      }
    });
    console.log(`[+] Lidos ${auroraProducts.length} produtos com imagem do staging da Aurora.`);
  }

  // 2. Se houver conexão com o Supabase, tenta complementar/validar no banco relacional
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      console.log('📡 Verificando marcas e produtos da Aurora no Supabase PostgreSQL...');
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

      // Marcas
      const { data: marcas } = await supabase
        .from('marcas')
        .select('*')
        .or(`fabricante_id.eq.${auroraFabUUID},fabricante_id.eq.${FABRICANTE_AURORA_ID}`);

      const auroraBrandIds = new Set<string>();
      (marcas || []).forEach(m => {
        auroraBrandsMap[m.id] = m.nome;
        auroraBrandIds.add(m.id);
      });

      // Se encontrou produtos no Supabase com marca Aurora
      if (auroraBrandIds.size > 0) {
        let from = 0;
        const pageSize = 1000;
        const supaProducts: any[] = [];
        while (true) {
          const { data: prods, error } = await supabase
            .from('produtos')
            .select('*')
            .not('imagem_url', 'is', null)
            .neq('status_imagem', 'SEM_IMAGEM')
            .in('marca_id', Array.from(auroraBrandIds))
            .range(from, from + pageSize - 1);

          if (error || !prods || prods.length === 0) break;
          supaProducts.push(...prods);
          if (prods.length < pageSize) break;
          from += pageSize;
        }

        if (supaProducts.length > 0) {
          console.log(`[+] Encontrados ${supaProducts.length} produtos com imagem da Aurora no Supabase.`);
          auroraProducts = supaProducts;

          // Buscar códigos de barras do Supabase
          const prodIdSet = new Set(supaProducts.map(p => p.id));
          const supaCodes: any[] = [];
          from = 0;
          while (true) {
            const { data: cods, error } = await supabase
              .from('codigos_barras')
              .select('*')
              .range(from, from + pageSize - 1);

            if (error || !cods || cods.length === 0) break;
            for (const c of cods) {
              if (prodIdSet.has(c.produto_id)) supaCodes.push(c);
            }
            if (cods.length < pageSize) break;
            from += pageSize;
          }
          if (supaCodes.length > 0) auroraCodes = supaCodes;
        }
      }
    } catch (err: any) {
      console.warn(`[!] Nota sobre Supabase: ${err.message}. Mantendo dados de Staging.`);
    }
  }

  // Mapear códigos EAN/DUN por produto_id
  const codeMap: Record<string, string[]> = {};
  const prodTitleMap: Record<string, string> = {};

  auroraProducts.forEach(p => {
    prodTitleMap[p.id] = p.descricao_padronizada || p.descricao_original;
  });

  auroraCodes.forEach(cb => {
    if (!codeMap[cb.produto_id]) codeMap[cb.produto_id] = [];
    codeMap[cb.produto_id].push(`${cb.tipo}: ${cb.codigo}`);
  });

  // Tabela de Produtos da Aurora
  const prodRows: AuroraProductRow[] = auroraProducts.map(p => ({
    'SKU / ID': p.id,
    'Fabricante': auroraFabName,
    'Marca': auroraBrandsMap[p.marca_id] || p.marca_id || 'Aurora',
    'Descrição Padronizada': p.descricao_padronizada || '',
    'Descrição Original': p.descricao_original || '',
    'Classe': p.classe || 'Carnes',
    'Conservação': p.conservacao || 'Resfriado',
    'Peso (g)': p.peso_gramas !== null && p.peso_gramas !== undefined ? p.peso_gramas : 'Variável (pesar)',
    'Fracionado': p.fracionado ? 'Sim' : 'Não',
    'Códigos EAN-13 / DUN-14': (codeMap[p.id] || []).join(' | '),
    'Status da Imagem': p.status_imagem || 'VALIDATED',
    'URL da Imagem': p.imagem_url || '',
    'Data de Registro': p.criado_em || new Date().toISOString()
  }));

  // Tabela de Códigos de Barras da Aurora
  const codeRows: AuroraBarcodeRow[] = auroraCodes.map(cb => ({
    'ID Código': cb.id,
    'ID Produto': cb.produto_id,
    'Produto': prodTitleMap[cb.produto_id] || '',
    'Tipo': cb.tipo || 'EAN-13',
    'Código de Barras': cb.codigo || '',
    'Embalagem': cb.embalagem || 'Unidade',
    'Data de Registro': cb.criado_em || new Date().toISOString()
  }));

  // Agrupar produtos por Marca (Aurora, Nobre, Peperi, Gran Mestri)
  const rowsByBrand: Record<string, AuroraProductRow[]> = {};
  prodRows.forEach(r => {
    const brandName = r['Marca'] || 'Aurora';
    if (!rowsByBrand[brandName]) rowsByBrand[brandName] = [];
    rowsByBrand[brandName].push(r);
  });

  // Criar Pasta de Trabalho Excel (.xlsx)
  const wb = XLSX.utils.book_new();

  // Aba 1: Todos os Produtos com Imagem da Aurora e Sub-Marcas
  const wsAll = XLSX.utils.json_to_sheet(prodRows);
  XLSX.utils.book_append_sheet(wb, wsAll, 'Produtos Aurora com Imagem');

  // Abas 2+: Por Marca (Aurora, Nobre, Peperi, etc.)
  Object.keys(rowsByBrand).forEach(bName => {
    const sheetName = `Marca - ${bName}`.replace(/[:\\/?*\[\]]/g, '_').substring(0, 31);
    const wsBrand = XLSX.utils.json_to_sheet(rowsByBrand[bName]);
    XLSX.utils.book_append_sheet(wb, wsBrand, sheetName);
  });

  // Aba 3: Códigos de Barras EAN e DUN Aurora
  const wsCodes = XLSX.utils.json_to_sheet(codeRows);
  XLSX.utils.book_append_sheet(wb, wsCodes, 'EAN-13 e DUN-14 Aurora');

  // Aba 4: Resumo Estatístico
  const summaryRows = [
    { 'Métrica': 'Fabricante / Holding', 'Valor': auroraFabName },
    { 'Métrica': 'Total de Produtos Aurora com Imagem', 'Valor': prodRows.length },
    { 'Métrica': 'Total de Códigos EAN-13 / DUN-14 Vinculados', 'Valor': codeRows.length },
    ...Object.keys(rowsByBrand).map(b => ({
      'Métrica': `Produtos com Imagem - Marca ${b}`,
      'Valor': rowsByBrand[b].length
    })),
    { 'Métrica': 'Data da Exportação', 'Valor': new Date().toLocaleString('pt-BR') }
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Estatístico Aurora');

  // Salvar nos caminhos de Download do dispositivo Android / Termux
  const targetFileName = 'PaletScan_Aurora_Produtos_Com_Imagem.xlsx';
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

      // Notifica o indexador do Android
      try {
        execSync(`termux-media-scan "${fullPath}"`, { stdio: 'ignore' });
      } catch {}
    } catch (err: any) {
      console.warn(`[!] Não foi possível salvar em ${dir}: ${err.message}`);
    }
  }

  console.log('\n==================================================');
  console.log('✅ RELATÓRIO EXCEL EXCLUSIVO DA AURORA GERADO COM SUCESSO!');
  console.log(`📊 Total de produtos com imagem (Aurora & Sub-marcas): ${prodRows.length}`);
  console.log(`📊 Total de códigos EAN/DUN vinculados: ${codeRows.length}`);
  console.log('📁 Arquivos salvos nos seguintes caminhos:');
  savedPaths.forEach(p => console.log(`   - ${p}`));
  console.log('==================================================\n');
}

exportAuroraProductsWithImages();
