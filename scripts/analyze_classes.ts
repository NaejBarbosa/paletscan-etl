import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runAnalysis() {
  console.log('🔍 Iniciando levantamento analítico completo de classes...');

  // 1. Fetch all products from Supabase
  let page = 0;
  let allProducts: any[] = [];
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('vw_produtos_com_marcas')
      .select('*')
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (error) {
      console.error('Erro ao consultar vw_produtos_com_marcas:', error);
      break;
    }

    if (data && data.length > 0) {
      allProducts = allProducts.concat(data);
      page++;
      if (data.length < 1000) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  console.log(`📊 Total de registros de produtos carregados do Supabase: ${allProducts.length}`);

  // Deduplicate products by product id
  const productsById = new Map<string, any>();
  allProducts.forEach(p => {
    const id = p.produto_id || p.id;
    if (!productsById.has(id)) {
      productsById.set(id, p);
    }
  });

  const uniqueProducts = Array.from(productsById.values());
  console.log(`📦 Total de produtos únicos: ${uniqueProducts.length}`);

  // 2. Aggregate classes
  const classCounts: Record<string, number> = {};
  const classByFabricante: Record<string, Record<string, number>> = {};
  const classByMarca: Record<string, Record<string, number>> = {};

  uniqueProducts.forEach(p => {
    const c = p.classe || '(SEM CLASSE)';
    const fab = p.fabricante_nome || '(SEM FABRICANTE)';
    const marca = p.marca_nome || '(SEM MARCA)';

    classCounts[c] = (classCounts[c] || 0) + 1;

    if (!classByFabricante[fab]) classByFabricante[fab] = {};
    classByFabricante[fab][c] = (classByFabricante[fab][c] || 0) + 1;

    if (!classByMarca[marca]) classByMarca[marca] = {};
    classByMarca[marca][c] = (classByMarca[marca][c] || 0) + 1;
  });

  console.log('\n=== DISTRIBUIÇÃO GERAL DE CLASSES NO SUPABASE ===');
  Object.entries(classCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cls, count]) => {
      console.log(`  - [${JSON.stringify(cls)}]: ${count} produtos (${((count / uniqueProducts.length) * 100).toFixed(2)}%)`);
    });

  console.log('\n=== DISTRIBUIÇÃO POR FABRICANTE ===');
  Object.entries(classByFabricante).forEach(([fab, counts]) => {
    console.log(`\n🏢 Fabricante: ${fab}`);
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cls, count]) => {
        console.log(`    - ${JSON.stringify(cls)}: ${count}`);
      });
  });

  // 3. Detect Encoding Issues (e.g. Su\u00ednos, Unicode escapes, latin1)
  console.log('\n=== DETECÇÃO DE PROBLEMAS DE ENCODING / ESCAPE ===');
  const encodingIssues = uniqueProducts.filter(p => {
    const c = p.classe || '';
    return (
      c.includes('\\u') ||
      c.includes('&') && c.includes(';') ||
      c.includes('Ã') ||
      (c.includes('ã') && c.includes('Â')) ||
      /\\[uU][0-9a-fA-F]{4}/.test(c) ||
      c === 'Su\\u00ednos'
    );
  });
  console.log(`Produtos com encoding/escape na classe: ${encodingIssues.length}`);
  encodingIssues.forEach(p => {
    console.log(`  ID: ${p.produto_id || p.id} | Desc: ${p.descricao_padronizada || p.nome} | Classe: ${JSON.stringify(p.classe)} | Marca: ${p.marca_nome}`);
  });

  // 4. Products with class "Outros" or similar
  console.log('\n=== PRODUTOS COM CLASSE "Outros" ===');
  const outrosProducts = uniqueProducts.filter(p => (p.classe || '').toLowerCase() === 'outros');
  console.log(`Total de produtos em "Outros": ${outrosProducts.length}`);

  // Breakdown of "Outros" by Marca / Fabricante
  const outrosByMarca: Record<string, any[]> = {};
  outrosProducts.forEach(p => {
    const m = p.marca_nome || 'Sem Marca';
    if (!outrosByMarca[m]) outrosByMarca[m] = [];
    outrosByMarca[m].push(p);
  });

  Object.entries(outrosByMarca).forEach(([m, prods]) => {
    console.log(`\n🏷️ Marca: ${m} (${prods.length} produtos em Outros)`);
    prods.slice(0, 15).forEach(p => {
      console.log(`    - ${p.descricao_padronizada || p.nome} [EAN: ${p.ean || p.codigo || 'N/A'}]`);
    });
    if (prods.length > 15) {
      console.log(`    ... e mais ${prods.length - 15} produtos.`);
    }
  });

  // 5. Inconsistency Detection & Heuristic Audit
  console.log('\n=== AUDITORIA DE INCONSISTÊNCIAS SEMÂNTICAS NA CLASSIFICAÇÃO ===');

  const inconsistencies: {
    produto_id: string;
    nome: string;
    marca: string;
    fabricante: string;
    ean: string;
    classe_atual: string;
    classe_sugerida: string;
    motivo: string;
  }[] = [];

  const suinoPattern = /\b(su[íi]n[oa]s?|pork|costela su[íi]na|costelinha|bacon|lombo|pernil|bochecha|copa|paleta su[íi]na|tender|picanha su[íi]na|joelho su[íi]no|eisbein|leit[aã]o|torresmo|panceta|pancetta|bisteca su[íi]na|barriga su[íi]na|orelha|focinho|rabada su[íi]na|p[eé] su[íi]no|pesco[çc]o su[íi]no)\b/i;
  
  const avesPattern = /\b(frango|franga|galinha|galo|ave|aves|coxa|sobrecoxa|peito de frango|peito de peru|asa|asinha|coxinha da asa|tulipa|drumet|tutu|peru|chester|nuggets? de frango|sassami|filezinho de frango|moela|cora[çc][aã]o de frango|frango a passarinho|galeto|sobrepaleta de frango|frangote)\b/i;
  
  const bovinosPattern = /\b(bovin[oa]s?|beef|boi|vaca|alcatra|contrafil[eé]|contra fil[eé]|fil[eé] mignon|mignon|picanha(?!\s*su[íi]na)|costela(?!\s*su[íi]na)|ac[eé]m|patinho|cox[aã]o mole|cox[aã]o duro|maminha|fraldinha|frald[aã]o|cupim|capa de fil[eé]|m[uú]sculo|costela bovina|costel[aã]o|rabada|bucho|dobradinha|ossobuco|paleta bovina|lagarto|ch[aã] de fora|ch[aã] de dentro|mo[íi]da bovina|carne mo[íi]da|carne mo[íi]da bovina|miolo de alcatra|bife|carpaccio|short rib|tomahawk|t-bone|brisket|entrec[oô]te|ribeye)\b/i;

  const pescadosPattern = /\b(peixe|pescad[oa]|til[aá]pia|salm[aã]o|bacalhau|camar[aã]o|merluza|ca[çc][aã]o|atum|sardinha|polvo|lula|polaca|tainha|surubim|pintado|pacu|dourado|tambaqui|pirarucu|truta|marisco|mexilh[aã]o|kani|pescada|linguado|anchoita)\b/i;

  const vegetaisPattern = /\b(seleta|legumes?|vegetais|vegetal|ervilha|milho|batata|mandioca|aipim|macaxeira|brocolis|br[oó]colis|couve-flor|couve flor|espinafre|cenoura|palmito|champignon|cogumelo|mix de legumes|jardineira|petit pois|polpa de fruta|a[çc]a[íi])\b/i;

  const plantBasedPattern = /\b(incr[ií]vel|plant.?based|veg&tal|100%\s*vegetal|vegetariano|vegano|sem carne|carne de soja|prote[ií]na de soja|futuro burger|notco)\b/i;

  const empanadosProcessadosPattern = /\b(hamb[uú]rguer|kibe|quibe|lingui[çc]a|salsicha|mortadela|presunto|nugget|empessado|kebab|lasanha|pizza|prato pronto|escondidinho|alm[oô]ndega|empanado|steak|iscas|croquete|torta|panqueca|quiche|coxinha|pastel|salgadinho|bolinho|esfirra|charque|carne seca|carne-seca|jerked beef)\b/i;

  const laticiniosGordurasPattern = /\b(margarina|manteiga|gordura|requeij[aã]o|queijo|mussarela|prato|parmes[aã]o|provolone|gouda|cheddar|ricota|creme de leite|leite|iogurte|nata|banha|oleo|[oó]leo)\b/i;

  const sobremesasPadariaPattern = /\b(sobremesa|pudim|torta doce|bolo|panetone|chocotone|p[aã]o de queijo|p[aã]o|torrada|biscoito|croissant|waffle|cookie|petit gateau|churros|mousse)\b/i;

  uniqueProducts.forEach(p => {
    const nome = p.descricao_padronizada || p.nome || '';
    const descOriginal = p.descricao_original || '';
    const fullText = `${nome} ${descOriginal}`.toLowerCase();
    const classeAtual = p.classe || '';
    const marca = p.marca_nome || '';
    const fab = p.fabricante_nome || '';
    const ean = p.ean || p.codigo || '';

    // Check specific misclassifications

    // 1. Unicode escaped Su\u00ednos
    if (classeAtual.includes('\\u') || classeAtual === 'Su\\u00ednos') {
      inconsistencies.push({
        produto_id: p.produto_id || p.id,
        nome,
        marca,
        fabricante: fab,
        ean,
        classe_atual: classeAtual,
        classe_sugerida: 'Suínos',
        motivo: 'Escape Unicode \\u00ed não decodificado no scraper/banco'
      });
      return;
    }

    // 2. Vegetais / Legumes / Batata / Seleta misclassified as Aves, Bovinos, Suínos
    if (vegetaisPattern.test(fullText) && !avesPattern.test(fullText) && !bovinosPattern.test(fullText) && !suinoPattern.test(fullText)) {
      if (['Aves', 'Bovinos', 'Suínos', 'Processados'].includes(classeAtual)) {
        inconsistencies.push({
          produto_id: p.produto_id || p.id,
          nome,
          marca,
          fabricante: fab,
          ean,
          classe_atual: classeAtual,
          classe_sugerida: 'Vegetais & Vegetais Congelados',
          motivo: `Produto vegetal/legumes classificado incorretamente como ${classeAtual}`
        });
        return;
      }
    }

    // 3. Plant-Based / Vegetariano (Incrível, Veg&Tal)
    if (plantBasedPattern.test(fullText)) {
      if (['Aves', 'Bovinos', 'Suínos'].includes(classeAtual)) {
        inconsistencies.push({
          produto_id: p.produto_id || p.id,
          nome,
          marca,
          fabricante: fab,
          ean,
          classe_atual: classeAtual,
          classe_sugerida: 'Plant-Based / Vegetariano',
          motivo: `Produto 100% vegetal/plant-based classificado como carne (${classeAtual})`
        });
        return;
      }
    }

    // 4. Suíno misclassified as Aves or Bovinos
    if (suinoPattern.test(fullText) && !avesPattern.test(fullText) && !bovinosPattern.test(fullText)) {
      if (classeAtual === 'Aves' || (classeAtual === 'Bovinos' && !fullText.includes('bovino'))) {
        if (!empanadosProcessadosPattern.test(fullText) && classeAtual !== 'Suínos') {
          inconsistencies.push({
            produto_id: p.produto_id || p.id,
            nome,
            marca,
            fabricante: fab,
            ean,
            classe_atual: classeAtual,
            classe_sugerida: 'Suínos',
            motivo: `Corte ou produto suíno classificado como ${classeAtual}`
          });
          return;
        }
      }
    }

    // 5. Aves misclassified as Bovinos or Suínos
    if (avesPattern.test(fullText) && !suinoPattern.test(fullText) && !bovinosPattern.test(fullText)) {
      if (classeAtual === 'Bovinos' || classeAtual === 'Suínos') {
        if (!empanadosProcessadosPattern.test(fullText)) {
          inconsistencies.push({
            produto_id: p.produto_id || p.id,
            nome,
            marca,
            fabricante: fab,
            ean,
            classe_atual: classeAtual,
            classe_sugerida: 'Aves',
            motivo: `Corte de frango/ave classificado como ${classeAtual}`
          });
          return;
        }
      }
    }

    // 6. Bovinos misclassified as Aves or Suínos
    if (bovinosPattern.test(fullText) && !avesPattern.test(fullText) && !suinoPattern.test(fullText)) {
      if (classeAtual === 'Aves' || classeAtual === 'Suínos') {
        if (!empanadosProcessadosPattern.test(fullText)) {
          inconsistencies.push({
            produto_id: p.produto_id || p.id,
            nome,
            marca,
            fabricante: fab,
            ean,
            classe_atual: classeAtual,
            classe_sugerida: 'Bovinos',
            motivo: `Corte bovino classificado como ${classeAtual}`
          });
          return;
        }
      }
    }

    // 7. Pescados misclassified as Aves, Bovinos, Suínos
    if (pescadosPattern.test(fullText) && !avesPattern.test(fullText) && !bovinosPattern.test(fullText) && !suinoPattern.test(fullText)) {
      if (['Aves', 'Bovinos', 'Suínos'].includes(classeAtual)) {
        inconsistencies.push({
          produto_id: p.produto_id || p.id,
          nome,
          marca,
          fabricante: fab,
          ean,
          classe_atual: classeAtual,
          classe_sugerida: 'Pescados',
          motivo: `Pescado/peixe classificado como ${classeAtual}`
        });
        return;
      }
    }

    // 8. Margarinas / Gorduras / Laticínios / Queijos misclassified as Bovinos or Aves
    if (laticiniosGordurasPattern.test(fullText) && !bovinosPattern.test(fullText) && !avesPattern.test(fullText) && !suinoPattern.test(fullText)) {
      if (['Aves', 'Bovinos', 'Suínos'].includes(classeAtual)) {
        inconsistencies.push({
          produto_id: p.produto_id || p.id,
          nome,
          marca,
          fabricante: fab,
          ean,
          classe_atual: classeAtual,
          classe_sugerida: 'Laticínios & Gorduras',
          motivo: `Laticínio/Margarina classificado como ${classeAtual}`
        });
        return;
      }
    }

    // 9. Sobremesas / Padaria / Pão de queijo misclassified as Bovinos or Aves
    if (sobremesasPadariaPattern.test(fullText) && !bovinosPattern.test(fullText) && !avesPattern.test(fullText) && !suinoPattern.test(fullText)) {
      if (['Aves', 'Bovinos', 'Suínos'].includes(classeAtual)) {
        inconsistencies.push({
          produto_id: p.produto_id || p.id,
          nome,
          marca,
          fabricante: fab,
          ean,
          classe_atual: classeAtual,
          classe_sugerida: 'Sobremesas & Panificação',
          motivo: `Sobremesa/Panificação classificado como ${classeAtual}`
        });
        return;
      }
    }

    // 10. Outros that could be classified
    if (classeAtual.toLowerCase() === 'outros') {
      let sug = 'Outros';
      if (vegetaisPattern.test(fullText)) sug = 'Vegetais';
      else if (plantBasedPattern.test(fullText)) sug = 'Plant-Based / Vegetariano';
      else if (suinoPattern.test(fullText)) sug = 'Suínos';
      else if (avesPattern.test(fullText)) sug = 'Aves';
      else if (bovinosPattern.test(fullText)) sug = 'Bovinos';
      else if (pescadosPattern.test(fullText)) sug = 'Pescados';
      else if (empanadosProcessadosPattern.test(fullText)) sug = 'Processados';
      else if (laticiniosGordurasPattern.test(fullText)) sug = 'Laticínios & Gorduras';
      else if (sobremesasPadariaPattern.test(fullText)) sug = 'Sobremesas & Panificação';

      if (sug !== 'Outros') {
        inconsistencies.push({
          produto_id: p.produto_id || p.id,
          nome,
          marca,
          fabricante: fab,
          ean,
          classe_atual: 'Outros',
          classe_sugerida: sug,
          motivo: `Produto com classe 'Outros' que possui regras claras de enquadramento em ${sug}`
        });
      }
    }
  });

  console.log(`\n🚨 Total de inconsistências identificadas: ${inconsistencies.length}`);

  // Group inconsistencies by reason / suggested class
  const bySuggested: Record<string, typeof inconsistencies> = {};
  inconsistencies.forEach(inc => {
    const key = `${inc.classe_atual} ➔ ${inc.classe_sugerida}`;
    if (!bySuggested[key]) bySuggested[key] = [];
    bySuggested[key].push(inc);
  });

  console.log('\n=== AGRUPAMENTO DE INCONSISTÊNCIAS POR TRANSIÇÃO ===');
  Object.entries(bySuggested)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([trans, list]) => {
      console.log(`\n📌 [${trans}]: ${list.length} produtos`);
      list.slice(0, 10).forEach(item => {
        console.log(`    - ${item.nome} (${item.marca}) | EAN: ${item.ean} | Motivo: ${item.motivo}`);
      });
      if (list.length > 10) {
        console.log(`    ... e mais ${list.length - 10} produtos.`);
      }
    });

  // Save report JSON for detailed inspection
  const reportPath = path.join(process.cwd(), 'staging', 'classificacao_classes_audit.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    total_unique_products: uniqueProducts.length,
    class_distribution: classCounts,
    class_by_fabricante: classByFabricante,
    class_by_marca: classByMarca,
    encoding_issues_count: encodingIssues.length,
    encoding_issues: encodingIssues,
    outros_count: outrosProducts.length,
    outros_products: outrosProducts,
    inconsistencies_count: inconsistencies.length,
    inconsistencies: inconsistencies
  }, null, 2), 'utf-8');

  console.log(`\n💾 Relatório detalhado salvo em: ${reportPath}`);
}

runAnalysis().catch(console.error);
