/**
 * Script de Sincronização Supabase com Resiliência a Conflitos de EAN/DUN - PaletScan ETL
 * Autor: Engenheiro de Dados Sênior
 * 
 * Este módulo realiza:
 * 1. Leitura dos dados normalizados em staging/friboi_staging.json.
 * 2. Conversão determinística dos IDs textuais em UUIDs v5 válidos via namespace estático.
 * 3. Atualização rigorosa das Chaves Estrangeiras (fabricante_id, marca_id, produto_id).
 * 4. Pré-deduplicação e tratamento de colisões de EAN/DUN cross-scraper.
 * 5. Carga relacional ordenada (.upsert) no Supabase com fallback item por item e registro de conflitos em staging/conflicts_log.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { v5 as uuidv5 } from 'uuid';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { sanitizeDatabase } from './sanitize_supabase_db';
import { formatProductDescription } from '../core/normalizers/text_parser';

// Carrega variáveis de ambiente (.env)
dotenv.config();

// Namespace UUIDv5 estático e determinístico do PaletScan ETL
export const PALETSCAN_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * Converte qualquer string textual (ex: "prod_friboi_1005", "marca_friboi")
 * em um UUID v5 determinístico e válido.
 */
export function toUUID5(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error(`Entrada inválida para conversão UUIDv5: ${input}`);
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(input)) {
    return input;
  }
  return uuidv5(input, PALETSCAN_NAMESPACE);
}

// Tipos para payload do Staging
interface StagingFabricante {
  id: string;
  nome: string;
  cnpj: string | null;
  site_oficial: string | null;
  ativo: boolean;
  criado_em: string;
}

interface StagingMarca {
  id: string;
  fabricante_id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  ativo: boolean;
  criado_em: string;
}

interface StagingProduto {
  id: string;
  marca_id: string;
  descricao_padronizada: string;
  descricao_original: string;
  classe: string;
  conservacao: string;
  peso_gramas: number | null;
  fracionado: boolean;
  imagem_url: string | null;
  status_imagem: string;
  criado_em: string;
}

interface StagingCodigoBarras {
  id: string;
  produto_id: string;
  tipo: string;
  codigo: string;
  embalagem: string | null;
  quantidade_embalagem: number | null;
  criado_em: string;
}

interface StagingData {
  fabricantes: StagingFabricante[];
  marcas: StagingMarca[];
  produtos: StagingProduto[];
  codigos_barras: StagingCodigoBarras[];
  pending_images_approval?: any[];
}

interface ConflictLogEntry {
  id: string;
  produto_id: string;
  tipo: string;
  codigo: string;
  error_message: string;
  timestamp: string;
}

const CONFLICTS_LOG_PATH = path.join(process.cwd(), 'staging', 'conflicts_log.json');

/**
 * Registra conflitos de EAN/DUN no arquivo staging/conflicts_log.json
 */
function logBarcodeConflict(item: any, errorMessage: string) {
  let existingConflicts: ConflictLogEntry[] = [];
  if (fs.existsSync(CONFLICTS_LOG_PATH)) {
    try {
      const content = fs.readFileSync(CONFLICTS_LOG_PATH, 'utf-8');
      existingConflicts = JSON.parse(content);
    } catch {
      existingConflicts = [];
    }
  }

  const newEntry: ConflictLogEntry = {
    id: item.id,
    produto_id: item.produto_id,
    tipo: item.tipo || 'DESCONHECIDO',
    codigo: item.codigo,
    error_message: errorMessage,
    timestamp: new Date().toISOString()
  };

  existingConflicts.push(newEntry);

  const stagingDir = path.dirname(CONFLICTS_LOG_PATH);
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true });
  }

  fs.writeFileSync(CONFLICTS_LOG_PATH, JSON.stringify(existingConflicts, null, 2), 'utf-8');
}

/**
 * Executa o upsert em lote dividindo os itens em chunks menores.
 * Suporta fallback resiliente item-por-item se houver colisões de chaves únicas (código de barras).
 */
async function upsertInBatches<T extends { id: string; codigo?: string }>(
  supabase: SupabaseClient,
  tableName: string,
  items: T[],
  batchSize = 200,
  handleConflicts = false
): Promise<{ totalSynced: number; conflictCount: number }> {
  if (items.length === 0) return { totalSynced: 0, conflictCount: 0 };

  // Para códigos de barras, garante deduplicação estrita por 'codigo' e upsert por conflito em 'codigo'
  if (tableName === 'codigos_barras') {
    const seenCodes = new Set<string>();
    const deduped: T[] = [];
    for (const item of items) {
      const codeKey = (item.codigo || '').trim();
      if (codeKey && !seenCodes.has(codeKey)) {
        seenCodes.add(codeKey);
        deduped.push(item);
      }
    }
    items = deduped;
  }

  const onConflictCol = tableName === 'codigos_barras' ? 'codigo' : 'id';

  let totalSynced = 0;
  let conflictCount = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);

    const upsertOptions = tableName === 'codigos_barras'
      ? { onConflict: 'codigo' }
      : { onConflict: 'id' };

    const { error } = await supabase
      .from(tableName)
      .upsert(chunk, upsertOptions);

    if (!error) {
      totalSynced += chunk.length;
      process.stdout.write(`  \r⏳ Sincronizando ${tableName}: ${totalSynced}/${items.length} registros...\n`);
    } else {
      if (handleConflicts) {
        console.log(`\n⚠️  Lote de '${tableName}' encontrou duplicidades/conflitos. Ativando modo de resiliência (item por item)...`);
        
        for (const item of chunk) {
          const { error: itemError } = await supabase
            .from(tableName)
            .upsert([item], upsertOptions);

          if (!itemError) {
            totalSynced++;
          } else {
            const isUniqueViolation = 
              itemError.code === '23505' || 
              /unique constraint|duplicate key|codigo/i.test(itemError.message);

            if (isUniqueViolation) {
              conflictCount++;
              logBarcodeConflict(item, itemError.message);
              console.log(`   ⚠️ Conflito no código de barras ${item.codigo} (Engolido & Registrado em conflicts_log.json)`);
            } else {
              console.error(`❌ Erro irrecuperável no item ${item.id}:`, itemError.message);
            }
          }
        }
      } else {
        console.error(`❌ Erro de upsert na tabela '${tableName}' (lote ${i / batchSize + 1}):`, error.message);
        throw error;
      }
    }
  }

  process.stdout.write(`\n`);
  return { totalSynced, conflictCount };
}

/**
 * Pipeline principal de transformação UUID e carga resiliente no Supabase
 */
export async function syncStagingToSupabase() {
  console.log('🔄 === INICIANDO PIPELINE DE SINCRONIZAÇÃO RESILIENTE SUPABASE (UUIDv5) ===');

  const baseDir = path.resolve(process.cwd());
  const stagingDir = path.join(baseDir, 'staging');

  if (!fs.existsSync(stagingDir)) {
    throw new Error(`Diretório de staging não encontrado em: ${stagingDir}.`);
  }

  // Lista todos os arquivos *_staging.json (ignorando *_uuid.json)
  const stagingFiles = fs.readdirSync(stagingDir)
    .filter(file => file.endsWith('_staging.json') && !file.endsWith('_uuid.json'))
    .map(file => path.join(stagingDir, file));

  if (stagingFiles.length === 0) {
    throw new Error(`Nenhum arquivo de staging encontrado em: ${stagingDir}`);
  }

  console.log(`📁 Arquivos de staging identificados para sincronização (${stagingFiles.length}):`);
  stagingFiles.forEach(f => console.log(`   - ${path.basename(f)}`));

  const allNovosProdutosLog: any[] = [];
  const allProdutosAtualizadosLog: any[] = [];
  let totalFabricantesSynced = 0;
  let totalMarcasSynced = 0;
  let totalProdutosSynced = 0;
  let totalCodigosSynced = 0;
  let totalConflictsGlobal = 0;

  for (const stagingPath of stagingFiles) {
    const filename = path.basename(stagingPath);
    const transformedPath = path.join(stagingDir, filename.replace('_staging.json', '_staging_uuid.json'));

    console.log(`\n==================================================`);
    console.log(`📖 Processando staging: ${filename}`);
    console.log(`==================================================`);
    const rawContent = fs.readFileSync(stagingPath, 'utf-8');
    const staging: StagingData = JSON.parse(rawContent);

    // -------------------------------------------------------------
    // PRÉ-DEDUPLICAÇÃO E VALIDAÇÃO EAN: Garantir EAN numérico único
    // -------------------------------------------------------------
    const seenCodesInStaging = new Set<string>();
    const deduplicatedCodigos: typeof staging.codigos_barras = [];

    for (const cb of staging.codigos_barras) {
      const codeClean = (cb.codigo || '').trim();
      if (!codeClean) continue;

      if (seenCodesInStaging.has(codeClean)) {
        logBarcodeConflict(
          { ...cb, id: toUUID5(cb.id), produto_id: toUUID5(cb.produto_id) },
          `Duplicidade de código detectada no staging: ${codeClean}`
        );
        continue;
      }
      seenCodesInStaging.add(codeClean);
      deduplicatedCodigos.push(cb);
    }

    const eanProductIds = new Set<string>();
    for (const cb of deduplicatedCodigos) {
      if (cb.codigo && /^\d+$/.test(cb.codigo.trim())) {
        eanProductIds.add(cb.produto_id);
      }
    }

    const produtosFiltrados = staging.produtos.filter(p => eanProductIds.has(p.id));
    const marcasAtivasIds = new Set(produtosFiltrados.map(p => p.marca_id));
    const marcasFiltradas = staging.marcas.filter(m => marcasAtivasIds.has(m.id));

    console.log(`🔍 Validação EAN: ${staging.produtos.length} produtos recebidos -> ${produtosFiltrados.length} mantidos (com ao menos 1 EAN único).`);

    // -------------------------------------------------------------
    // CAMADA DE TRANSFORMAÇÃO: String IDs -> UUIDv5 (PKs e FKs)
    // -------------------------------------------------------------
    console.log('\n⚡ Transformando IDs textuais em UUIDv5 determinísticos...');

    const fabricantesUUID = staging.fabricantes.map(f => ({
      ...f,
      id: toUUID5(f.id)
    }));

    const marcasUUID = marcasFiltradas.map(m => ({
      ...m,
      id: toUUID5(m.id),
      fabricante_id: toUUID5(m.fabricante_id)
    }));

    const produtosUUID = produtosFiltrados.map(p => {
      const rawText = p.descricao_original
        || (typeof p.descricao_padronizada === 'string' ? p.descricao_padronizada : (p.descricao_padronizada as any)?.formatted_description || (p.descricao_padronizada as any)?.title_clean)
        || p.descricao
        || '';
      const parsedText = formatProductDescription(rawText);

      return {
        ...p,
        id: toUUID5(p.id),
        marca_id: toUUID5(p.marca_id),
        descricao_padronizada: parsedText.formatted_description,
        peso_gramas: parsedText.peso_gramas !== null ? parsedText.peso_gramas : p.peso_gramas,
        fracionado: parsedText.fracionado,
        updated_at: new Date().toISOString(),
      };
    });

    const codigosBarrasUUID: StagingCodigoBarras[] = [];
    const produtosValidosUUIDSet = new Set(produtosUUID.map(p => p.id));

    for (const cb of deduplicatedCodigos) {
      const prodUuid = toUUID5(cb.produto_id);
      if (!produtosValidosUUIDSet.has(prodUuid)) continue;
      if (!cb.codigo || !/^\d+$/.test(cb.codigo.trim())) continue;

      let tipoNormalizado = (cb.tipo || '').trim();
      if (tipoNormalizado.toUpperCase().includes('EAN')) {
        tipoNormalizado = 'EAN';
      } else if (tipoNormalizado.toUpperCase().includes('DUN')) {
        tipoNormalizado = 'DUN';
      }

      codigosBarrasUUID.push({
        ...cb,
        id: toUUID5(cb.id),
        produto_id: prodUuid,
        tipo: tipoNormalizado
      });
    }

    const payloadUUID = {
      fabricantes: fabricantesUUID,
      marcas: marcasUUID,
      produtos: produtosUUID,
      codigos_barras: codigosBarrasUUID,
      pending_images_approval: staging.pending_images_approval || []
    };

    fs.writeFileSync(transformedPath, JSON.stringify(payloadUUID, null, 2), 'utf-8');
    console.log(`✅ Dados transformados com UUIDs salvos em: ${transformedPath}`);

    // -------------------------------------------------------------
    // CAMADA DE CARGA (LOAD): Supabase Upsert Ordenado Resiliente
    // -------------------------------------------------------------
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('sua-instancia')) {
      console.log('\n⚠️  SUPABASE_URL ou SUPABASE_KEY não configurados no arquivo .env.');
      continue;
    }

    console.log(`\n📡 Conectando ao Supabase em: ${supabaseUrl}`);
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Busca paginada de TODOS os produtos pré-existentes para detectar novos produtos e alterações/atualizações
    let existingProductIds = new Set<string>();
    let existingProductsMap = new Map<string, any>();
    try {
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data: exProds, error } = await supabase
          .from('produtos')
          .select('id, marca_id, descricao_padronizada, descricao_original, classe, conservacao, peso_gramas, fracionado, imagem_url, status_imagem')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (!error && exProds && exProds.length > 0) {
          exProds.forEach(p => {
            existingProductIds.add(p.id);
            existingProductsMap.set(p.id, p);
          });
          page++;
          if (exProds.length < pageSize) hasMore = false;
        } else {
          hasMore = false;
        }
      }
    } catch (err) {
      // Continua se a busca falhar
    }

    console.log('\n🚀 Executando Carga Relacional Ordenada Resiliente (.upsert)...');

    console.log('1️⃣  Sincronizando Fabricantes...');
    const resFab = await upsertInBatches(supabase, 'fabricantes', fabricantesUUID);

    console.log('2️⃣  Sincronizando Marcas...');
    const resMarcas = await upsertInBatches(supabase, 'marcas', marcasUUID);

    console.log('3️⃣  Sincronizando Produtos...');
    const resProdutos = await upsertInBatches(supabase, 'produtos', produtosUUID);

    console.log('4️⃣  Sincronizando Códigos de Barras (Modo Resiliente)...');
    const resCB = await upsertInBatches(supabase, 'codigos_barras', codigosBarrasUUID, 200, true);

    totalFabricantesSynced += resFab.totalSynced;
    totalMarcasSynced += resMarcas.totalSynced;
    totalProdutosSynced += resProdutos.totalSynced;
    totalCodigosSynced += resCB.totalSynced;
    totalConflictsGlobal += resCB.conflictCount;

    // -------------------------------------------------------------
    // DETECÇÃO DE NOVOS PRODUTOS INCLUÍDOS NESTE ARQUIVO
    // -------------------------------------------------------------
    const novosProdutos = produtosUUID.filter(p => !existingProductIds.has(p.id));
    const marcasMap = new Map(marcasFiltradas.map(m => [toUUID5(m.id), m.nome]));
    const cbMap = new Map(codigosBarrasUUID.map(c => [c.produto_id, c]));

    novosProdutos.forEach(p => {
      const cb = cbMap.get(p.id);
      allNovosProdutosLog.push({
        id: p.id,
        marca: marcasMap.get(p.marca_id) || 'N/D',
        ean: cb?.tipo === 'EAN' ? cb.codigo : (cb?.codigo || ''),
        dun: cb?.tipo === 'DUN' ? cb.codigo : '',
        descricao: p.descricao_padronizada || p.descricao_original,
        classe: p.classe,
        conservacao: p.conservacao,
        criado_em: p.criado_em || new Date().toISOString()
      });
    });

    // -------------------------------------------------------------
    // DETECÇÃO DE ALTERAÇÕES E ATUALIZAÇÕES EM PRODUTOS EXISTENTES
    // -------------------------------------------------------------
    const produtosExistentes = produtosUUID.filter(p => existingProductIds.has(p.id));

    for (const p of produtosExistentes) {
      const existing = existingProductsMap.get(p.id);
      if (!existing) continue;

      const alteracoes: { campo: string; de: any; para: any }[] = [];

      const imgEx = (existing.imagem_url || '').trim();
      const imgNew = (p.imagem_url || '').trim();
      if (imgEx !== imgNew) {
        alteracoes.push({ campo: 'Imagem (URL)', de: imgEx || 'Sem imagem', para: imgNew || 'Sem imagem' });
      }

      const stEx = (existing.status_imagem || '').trim();
      const stNew = (p.status_imagem || '').trim();
      if (stEx !== stNew) {
        alteracoes.push({ campo: 'Status da Imagem', de: stEx || 'N/D', para: stNew || 'N/D' });
      }

      const descEx = (existing.descricao_padronizada || '').trim();
      const descNew = (p.descricao_padronizada || '').trim();
      if (descEx !== descNew) {
        alteracoes.push({ campo: 'Descrição', de: descEx || 'N/D', para: descNew || 'N/D' });
      }

      const clEx = (existing.classe || '').trim();
      const clNew = (p.classe || '').trim();
      if (clEx !== clNew) {
        alteracoes.push({ campo: 'Classe', de: clEx || 'N/D', para: clNew || 'N/D' });
      }

      const consEx = (existing.conservacao || '').trim();
      const consNew = (p.conservacao || '').trim();
      if (consEx !== consNew) {
        alteracoes.push({ campo: 'Conservação', de: consEx || 'N/D', para: consNew || 'N/D' });
      }

      const pesoEx = existing.peso_gramas ?? null;
      const pesoNew = p.peso_gramas ?? null;
      if (pesoEx !== pesoNew) {
        alteracoes.push({ campo: 'Peso (g)', de: pesoEx ?? 'N/D', para: pesoNew ?? 'N/D' });
      }

      const fracEx = Boolean(existing.fracionado);
      const fracNew = Boolean(p.fracionado);
      if (fracEx !== fracNew) {
        alteracoes.push({ campo: 'Fracionado', de: fracEx, para: fracNew });
      }

      const marcaEx = (existing.marca_id || '').trim();
      const marcaNew = (p.marca_id || '').trim();
      if (marcaEx !== marcaNew) {
        alteracoes.push({ campo: 'Marca ID', de: marcaEx || 'N/D', para: marcaNew || 'N/D' });
      }

      if (alteracoes.length > 0) {
        const cb = cbMap.get(p.id);
        allProdutosAtualizadosLog.push({
          id: p.id,
          marca: marcasMap.get(p.marca_id) || 'N/D',
          ean: cb?.tipo === 'EAN' ? cb.codigo : (cb?.codigo || ''),
          dun: cb?.tipo === 'DUN' ? cb.codigo : '',
          descricao: p.descricao_padronizada || p.descricao_original,
          alteracoes,
          atualizado_em: new Date().toISOString()
        });
      }
    }
  }

  // -------------------------------------------------------------
  // SALVAMENTO E RELATÓRIO CONSOLIDADO DO ETL COMPLETO
  // -------------------------------------------------------------
  const novosLogPath = path.join(process.cwd(), 'staging', 'novos_produtos_log.json');
  fs.writeFileSync(novosLogPath, JSON.stringify(allNovosProdutosLog, null, 2), 'utf-8');

  const atualizadosLogPath = path.join(process.cwd(), 'staging', 'produtos_atualizados_log.json');
  fs.writeFileSync(atualizadosLogPath, JSON.stringify(allProdutosAtualizadosLog, null, 2), 'utf-8');

  console.log('\n🎉 === RESUMO FINAL DA SINCRONIZAÇÃO SUPABASE ===');
  console.log(`🏢 Fabricantes sincronizados: ${totalFabricantesSynced}`);
  console.log(`🏷️  Marcas sincronizadas:      ${totalMarcasSynced}`);
  console.log(`🥩 Produtos sincronizados:    ${totalProdutosSynced}`);
  console.log(`📊 Códigos de Barras:         ${totalCodigosSynced}`);

  if (allNovosProdutosLog.length > 0) {
    console.log('\n✨ ==================================================');
    console.log(`🆕 NOVOS PRODUTOS INCLUÍDOS NA BASE NESTA EXECUÇÃO (${allNovosProdutosLog.length}):`);
    console.log('==================================================');
    allNovosProdutosLog.forEach((item, idx) => {
      const eanStr = item.ean ? `EAN: ${item.ean}` : 'Sem EAN';
      console.log(`  ${idx + 1}. [${item.marca}] ${eanStr} | ${item.descricao}`);
    });
    console.log('==================================================');
  } else {
    console.log('\nℹ️  Nenhum produto novo incluído na base nesta execução (0 novos).');
  }

  if (allProdutosAtualizadosLog.length > 0) {
    console.log('\n🔄 ==================================================');
    console.log(`📝 PRODUTOS ALTERADOS / ATUALIZADOS NA BASE NESTA EXECUÇÃO (${allProdutosAtualizadosLog.length}):`);
    console.log('==================================================');
    allProdutosAtualizadosLog.forEach((item, idx) => {
      const eanStr = item.ean ? `EAN: ${item.ean}` : 'Sem EAN';
      console.log(`  ${idx + 1}. [${item.marca}] ${eanStr} | ${item.descricao}`);
      item.alteracoes.forEach((alt: any) => {
        console.log(`     └─ • ${alt.campo}: de "${alt.de}" ➔ "${alt.para}"`);
      });
    });
    console.log('==================================================');
  } else {
    console.log('ℹ️  Nenhum produto sofreu alterações de dados nesta execução.');
  }

  if (totalConflictsGlobal > 0) {
    console.log(`⚠️  Conflitos de EAN/DUN ignorados: ${totalConflictsGlobal} (ver staging/conflicts_log.json)`);
  }

  console.log('\n🧹 Executando higienização pós-sincronização no Supabase...');
  await sanitizeDatabase();
}

// Execução via CLI
if (process.argv[1] && process.argv[1].endsWith('sync.ts')) {
  syncStagingToSupabase().catch(err => {
    console.error('❌ Erro durante a sincronização:', err);
    process.exit(1);
  });
}
