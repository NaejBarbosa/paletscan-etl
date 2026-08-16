import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const OLD_DB_PATH = '/root/projetos-scraping/scraping-copacol/copacol_catalogo.db';
const OLD_JSON_PATH = '/root/projetos-scraping/scraping-copacol/produtos_enriquecidos.json';

const NEW_STAGING_PATH = '/root/paletscan-etl/staging/copacol_staging.json';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function compare() {
  console.log('====================================================');
  console.log('📊 COMPARATIVO DE PRODUTOS COPACOL COM EAN (ANTIGO vs NOVO)');
  console.log('====================================================\n');

  // --- 1. ETL ANTIGO ---
  let oldTotalProds = 0;
  let oldEanProdsCount = 0;
  let oldUniqueEansSet = new Set<string>();

  if (fs.existsSync(OLD_DB_PATH)) {
    const pythonCmd = `python3 -c "import sqlite3, json; conn = sqlite3.connect('${OLD_DB_PATH}'); conn.row_factory = sqlite3.Row; c = conn.cursor(); c.execute('SELECT * FROM produtos;'); print(json.dumps([dict(r) for r in c.fetchall()], ensure_ascii=False))"`;
    try {
      const rawJson = execSync(pythonCmd, { encoding: 'utf-8' });
      const oldProds: any[] = JSON.parse(rawJson);
      oldTotalProds = oldProds.length;
      oldProds.forEach(p => {
        const ean = String(p.ean || '').trim();
        if (ean && /^\d+$/.test(ean)) {
          oldEanProdsCount++;
          oldUniqueEansSet.add(ean);
        }
      });
    } catch (e: any) {
      console.error('Erro ao ler DB antigo:', e.message);
    }
  } else if (fs.existsSync(OLD_JSON_PATH)) {
    const oldProds: any[] = JSON.parse(fs.readFileSync(OLD_JSON_PATH, 'utf-8'));
    oldTotalProds = oldProds.length;
    oldProds.forEach(p => {
      const ean = String(p.ean || '').trim();
      if (ean && /^\d+$/.test(ean)) {
        oldEanProdsCount++;
        oldUniqueEansSet.add(ean);
      }
    });
  }

  console.log('1️⃣  ETL ANTIGO (scraping-copacol):');
  console.log(`   • Total de produtos cadastrados: ${oldTotalProds}`);
  console.log(`   • Produtos com EAN numérico válido: ${oldEanProdsCount}`);
  console.log(`   • EANs únicos cadastrados: ${oldUniqueEansSet.size}`);
  console.log(`   • Percentual de cobertura EAN: ${((oldEanProdsCount / (oldTotalProds || 1)) * 100).toFixed(1)}%\n`);

  // --- 2. NOVO ETL (Staging Local) ---
  let newStagingTotalProds = 0;
  let newStagingEanProdsCount = 0;
  let newStagingUniqueEansSet = new Set<string>();

  if (fs.existsSync(NEW_STAGING_PATH)) {
    const stagingData = JSON.parse(fs.readFileSync(NEW_STAGING_PATH, 'utf-8'));
    const produtos: any[] = stagingData.produtos || [];
    const codigos: any[] = stagingData.codigos_barras || [];
    newStagingTotalProds = produtos.length;

    const prodEanMap = new Map<string, string>();
    codigos.forEach(c => {
      const clean = String(c.codigo || '').trim();
      if (clean && /^\d+$/.test(clean) && (c.tipo === 'EAN' || c.tipo === 'EAN-13')) {
        prodEanMap.set(c.produto_id, clean);
        newStagingUniqueEansSet.add(clean);
      }
    });

    produtos.forEach(p => {
      if (prodEanMap.has(p.id)) {
        newStagingEanProdsCount++;
      }
    });
  }

  console.log('2️⃣  NOVO ETL - STAGING (paletscan-etl/staging/copacol_staging.json):');
  console.log(`   • Total de produtos únicos normalizados: ${newStagingTotalProds}`);
  console.log(`   • Produtos com ao menos 1 EAN-13 válido: ${newStagingEanProdsCount}`);
  console.log(`   • Códigos EAN-13 únicos cadastrados: ${newStagingUniqueEansSet.size}`);
  console.log(`   • Percentual de cobertura EAN: ${((newStagingEanProdsCount / (newStagingTotalProds || 1)) * 100).toFixed(1)}%\n`);

  // --- 3. NOVO ETL - SUPABASE (AO VIVO) ---
  let supabaseCopacolProdsCount = 0;
  let supabaseCopacolEanProdsCount = 0;

  try {
    // Buscar id da marca Copacol ou produtos da Copacol
    const { data: copacolBrands } = await supabase.from('marcas').select('id, nome').ilike('nome', '%copacol%');
    const brandIds = copacolBrands?.map(b => b.id) || [];

    if (brandIds.length > 0) {
      const { data: copProds } = await supabase.from('produtos').select('id, descricao_padronizada').in('marca_id', brandIds);
      if (copProds) {
        supabaseCopacolProdsCount = copProds.length;
        const prodIds = copProds.map(p => p.id);

        let page = 0;
        let cbs: any[] = [];
        let hasMore = true;
        while (hasMore) {
          const { data } = await supabase.from('codigos_barras').select('produto_id, codigo, tipo').in('produto_id', prodIds).range(page * 1000, (page + 1) * 1000 - 1);
          if (data && data.length > 0) {
            cbs = cbs.concat(data);
            page++;
            if (data.length < 1000) hasMore = false;
          } else {
            hasMore = false;
          }
        }

        const validProdIds = new Set(cbs.filter(c => c.codigo && /^\d+$/.test(String(c.codigo).trim())).map(c => c.produto_id));
        supabaseCopacolEanProdsCount = validProdIds.size;
      }
    }
  } catch (e: any) {
    console.error('Erro ao consultar Supabase:', e.message);
  }

  console.log('3️⃣  NOVO ETL - SUPABASE AO VIVO (Banco Relacional PostgreSQL):');
  console.log(`   • Total de produtos únicos da Copacol no banco: ${supabaseCopacolProdsCount}`);
  console.log(`   • Produtos da Copacol respaldados por EAN válido: ${supabaseCopacolEanProdsCount}`);
  console.log(`   • Percentual de conformidade: ${((supabaseCopacolEanProdsCount / (supabaseCopacolProdsCount || 1)) * 100).toFixed(1)}%\n`);

  console.log('====================================================');
}

compare();
