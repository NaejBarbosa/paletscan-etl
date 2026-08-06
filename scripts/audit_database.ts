import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY não configuradas.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Anomaly {
  category: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  item_id: string;
  details: string;
}

async function auditDatabase() {
  console.log('🔍 === INICIANDO AUDITORIA EXAUSTIVA DA BASE SUPABASE ===\n');

  const anomalies: Anomaly[] = [];

  // 1. Buscar Fabricantes
  const { data: fabricantes, error: errFab } = await supabase.from('fabricantes').select('*');
  if (errFab) console.error('Erro ao buscar fabricantes:', errFab.message);
  else console.log(`🏢 Fabricantes no Supabase: ${fabricantes?.length || 0}`);

  // 2. Buscar Marcas
  const { data: marcas, error: errMarcas } = await supabase.from('marcas').select('*');
  if (errMarcas) console.error('Erro ao buscar marcas:', errMarcas.message);
  else console.log(`🏷️  Marcas no Supabase: ${marcas?.length || 0}`);

  // 3. Buscar Produtos (paginado se necessário)
  let allProdutos: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data: prods, error } = await supabase
      .from('produtos')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('Erro ao buscar produtos:', error.message);
      break;
    }
    if (!prods || prods.length === 0) break;
    allProdutos = allProdutos.concat(prods);
    if (prods.length < pageSize) break;
    from += pageSize;
  }
  console.log(`🥩 Produtos no Supabase: ${allProdutos.length}`);

  // 4. Buscar Codigos_barras (paginado)
  let allCodigos: any[] = [];
  from = 0;
  while (true) {
    const { data: cods, error } = await supabase
      .from('codigos_barras')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('Erro ao buscar códigos de barras:', error.message);
      break;
    }
    if (!cods || cods.length === 0) break;
    allCodigos = allCodigos.concat(cods);
    if (cods.length < pageSize) break;
    from += pageSize;
  }
  console.log(`📊 Códigos de Barras no Supabase: ${allCodigos.length}\n`);

  // --- ANALISE DE ANOMALIAS ---

  // Indexar códigos por produto_id
  const productCodigosMap = new Map<string, any[]>();
  for (const c of allCodigos) {
    if (!productCodigosMap.has(c.produto_id)) {
      productCodigosMap.set(c.produto_id, []);
    }
    productCodigosMap.get(c.produto_id)!.push(c);
  }

  // 1. Auditando Produtos sem Códigos de Barras
  let prodsWithoutCodes = 0;
  let prodsWithoutEAN = 0;
  for (const p of allProdutos) {
    const cods = productCodigosMap.get(p.id) || [];
    if (cods.length === 0) {
      prodsWithoutCodes++;
      anomalies.push({
        category: 'PRODUTO_SEM_CODIGO',
        severity: 'CRITICAL',
        item_id: p.id,
        details: `Produto "${p.descricao_original}" (${p.id}) não possui NENHUM código de barras cadastrado.`
      });
    } else {
      const hasEAN = cods.some(c => c.tipo && c.tipo.toUpperCase().includes('EAN') && /^\d+$/.test(c.codigo?.trim()));
      if (!hasEAN) {
        prodsWithoutEAN++;
        anomalies.push({
          category: 'PRODUTO_SEM_EAN_NUMERICO',
          severity: 'CRITICAL',
          item_id: p.id,
          details: `Produto "${p.descricao_original}" (${p.id}) possui códigos [${cods.map(c => `${c.tipo}:${c.codigo}`).join(', ')}], mas NENHUM EAN numérico válido!`
        });
      }
    }

    // Validação de Descrição Padronizada
    if (!p.descricao_padronizada || typeof p.descricao_padronizada !== 'string') {
      anomalies.push({
        category: 'DESCRICAO_INVALIDA',
        severity: 'WARNING',
        item_id: p.id,
        details: `descricao_padronizada não é uma string válida: ${JSON.stringify(p.descricao_padronizada)}`
      });
    } else if (p.descricao_padronizada.includes('[object Object]')) {
      anomalies.push({
        category: 'OBJECT_OBJECT_LEAK',
        severity: 'CRITICAL',
        item_id: p.id,
        details: `descricao_padronizada contém a string corrompida "[object Object]": "${p.descricao_padronizada}"`
      });
    }

    // Validação de Peso Gramas
    if (p.peso_gramas !== null && (typeof p.peso_gramas !== 'number' || p.peso_gramas <= 0)) {
      anomalies.push({
        category: 'PESO_GRAMAS_ANOMALO',
        severity: 'WARNING',
        item_id: p.id,
        details: `peso_gramas tem valor anormal: ${p.peso_gramas}`
      });
    }
  }

  // 2. Auditando Códigos de Barras Estranhos
  const seenCodigos = new Map<string, string>();
  for (const c of allCodigos) {
    const code = c.codigo ? String(c.codigo).trim() : '';

    // Checar duplicidade no banco
    if (seenCodigos.has(code)) {
      anomalies.push({
        category: 'CODIGO_DUPLICADO',
        severity: 'CRITICAL',
        item_id: c.id,
        details: `Código "${code}" está duplicado entre produto ${c.produto_id} e produto ${seenCodigos.get(code)}.`
      });
    } else {
      seenCodigos.set(code, c.produto_id);
    }

    // Checar códigos não-numéricos marcados como EAN ou DUN
    if ((c.tipo === 'EAN' || c.tipo === 'EAN-13' || c.tipo === 'EAN-8' || c.tipo === 'DUN' || c.tipo === 'DUN-14')) {
      if (!/^\d+$/.test(code)) {
        anomalies.push({
          category: 'EAN_NAO_NUMERICO',
          severity: 'CRITICAL',
          item_id: c.id,
          details: `Código de barras tipo "${c.tipo}" contém caracteres não-numéricos: "${code}" (produto_id: ${c.produto_id})`
        });
      } else if (code.length < 8 || code.length > 14) {
        anomalies.push({
          category: 'EAN_TAMANHO_INVALIDO',
          severity: 'WARNING',
          item_id: c.id,
          details: `Código de barras tipo "${c.tipo}" tem tamanho fora do padrão (${code.length} dígitos): "${code}" (produto_id: ${c.produto_id})`
        });
      } else if (code.length <= 4) {
        anomalies.push({
          category: 'CODIGO_MUITO_CURTO',
          severity: 'CRITICAL',
          item_id: c.id,
          details: `Código de barras suspeito/muito curto: "${code}"`
        });
      }
    }

    // Checar códigos de barras que parecem ter vindo de URLs, SKUs alfa ou slugs
    if (/^[a-zA-Z_]/.test(code) && c.tipo !== 'SKU') {
      anomalies.push({
        category: 'SLUG_LEAK_EM_CODIGO',
        severity: 'CRITICAL',
        item_id: c.id,
        details: `Código marcado como ${c.tipo} é uma string alfanumérica/slug: "${code}"`
      });
    }
  }

  // Resumo
  console.log('--------------------------------------------------');
  console.log(`🚨 TOTAL DE ANOMALIAS ENCONTRADAS: ${anomalies.length}`);
  console.log(`   - Críticas: ${anomalies.filter(a => a.severity === 'CRITICAL').length}`);
  console.log(`   - Avisos: ${anomalies.filter(a => a.severity === 'WARNING').length}`);
  console.log(`   - Produtos sem nenhum código: ${prodsWithoutCodes}`);
  console.log(`   - Produtos sem EAN numérico: ${prodsWithoutEAN}`);
  console.log('--------------------------------------------------\n');

  if (anomalies.length > 0) {
    console.log('📋 Primeiras 20 anomalias identificadas:');
    anomalies.slice(0, 20).forEach((a, i) => {
      console.log(`  ${i + 1}. [${a.severity}] [${a.category}] ${a.details}`);
    });

    // Salvar relatório completo de anomalias
    const outPath = path.join(process.cwd(), 'staging', 'audit_report.json');
    fs.writeFileSync(outPath, JSON.stringify(anomalies, null, 2), 'utf-8');
    console.log(`\n📄 Relatório completo salvo em: ${outPath}`);
  } else {
    console.log('✅ Nenhuma anomalia encontrada! A base de dados do Supabase está 100% íntegra.');
  }
}

auditDatabase().catch(console.error);
