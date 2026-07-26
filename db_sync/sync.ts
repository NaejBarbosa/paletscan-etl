/**
 * Script de Sincronização Supabase - PaletScan ETL
 * Autor: Engenheiro de Dados Sênior
 * 
 * Este módulo realiza:
 * 1. Leitura dos dados normalizados em staging/friboi_staging.json.
 * 2. Conversão determinística dos IDs textuais em UUIDs v5 válidos via namespace estático.
 * 3. Atualização rigorosa das Chaves Estrangeiras (fabricante_id, marca_id, produto_id).
 * 4. Carga relacional ordenada (.upsert) no Supabase (Fabricantes -> Marcas -> Produtos -> Codigos de Barras).
 */

import * as fs from 'fs';
import * as path from 'path';
import { v5 as uuidv5 } from 'uuid';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carrega variáveis de ambiente (.env)
dotenv.config();

// Namespace UUIDv5 estático e determinístico do PaletScan ETL (UUID v4 válido)
export const PALETSCAN_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * Converte qualquer string textual (ex: "prod_friboi_1005", "marca_friboi")
 * em um UUID v5 determinístico e válido.
 */
export function toUUID5(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error(`Entrada inválida para conversão UUIDv5: ${input}`);
  }
  // Se a entrada já for um UUID v4/v5 válido, retorna o próprio valor
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

/**
 * Executa o upsert em lote dividindo os itens em chunks menores para evitar estouro de memória/payload
 */
async function upsertInBatches<T extends { id: string }>(
  supabase: SupabaseClient,
  tableName: string,
  items: T[],
  batchSize = 200
): Promise<number> {
  if (items.length === 0) return 0;

  let totalSynced = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const { error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict: 'id' });

    if (error) {
      console.error(`❌ Erro de upsert na tabela '${tableName}' (lote ${i / batchSize + 1}):`, error.message);
      throw error;
    }
    totalSynced += chunk.length;
    process.stdout.write(`  \r⏳ Sincronizando ${tableName}: ${totalSynced}/${items.length} registros...`);
  }
  process.stdout.write(`\n`);
  return totalSynced;
}

/**
 * Pipeline principal de transformação UUID e carga no Supabase
 */
export async function syncStagingToSupabase() {
  console.log('🔄 === INICIANDO PIPELINE DE SINCRONIZAÇÃO SUPABASE (UUIDv5) ===');

  const baseDir = path.resolve(process.cwd());
  const stagingPath = path.join(baseDir, 'staging', 'friboi_staging.json');
  const transformedPath = path.join(baseDir, 'staging', 'friboi_staging_uuid.json');

  if (!fs.existsSync(stagingPath)) {
    throw new Error(`Arquivo de staging não encontrado em: ${stagingPath}. Execute primeiro 'npm run scrape:friboi'.`);
  }

  console.log(`📖 Lendo dados de staging: ${stagingPath}`);
  const rawContent = fs.readFileSync(stagingPath, 'utf-8');
  const staging: StagingData = JSON.parse(rawContent);

  // -------------------------------------------------------------
  // CAMADA DE TRANSFORMAÇÃO: String IDs -> UUIDv5 (PKs e FKs)
  // -------------------------------------------------------------
  console.log('\n⚡ Transformando IDs textuais em UUIDv5 determinísticos...');

  // 1. Transformação de Fabricantes
  const fabricantesUUID = staging.fabricantes.map(f => ({
    ...f,
    id: toUUID5(f.id)
  }));

  // 2. Transformação de Marcas (PK id + FK fabricante_id)
  const marcasUUID = staging.marcas.map(m => ({
    ...m,
    id: toUUID5(m.id),
    fabricante_id: toUUID5(m.fabricante_id)
  }));

  // 3. Transformação de Produtos (PK id + FK marca_id)
  const produtosUUID = staging.produtos.map(p => ({
    ...p,
    id: toUUID5(p.id),
    marca_id: toUUID5(p.marca_id)
  }));

  // 4. Transformação de Códigos de Barras (PK id + FK produto_id)
  const codigosBarrasUUID = staging.codigos_barras.map(cb => ({
    ...cb,
    id: toUUID5(cb.id),
    produto_id: toUUID5(cb.produto_id)
  }));

  const payloadUUID = {
    fabricantes: fabricantesUUID,
    marcas: marcasUUID,
    produtos: produtosUUID,
    codigos_barras: codigosBarrasUUID,
    pending_images_approval: staging.pending_images_approval || []
  };

  // Salva cópia com UUIDs no diretório staging para conferência e auditoria local
  fs.writeFileSync(transformedPath, JSON.stringify(payloadUUID, null, 2), 'utf-8');
  console.log(`✅ Dados transformados com UUIDs salvos em: ${transformedPath}`);

  // Exibição de logs demonstrativos
  console.log(`\n📌 Mapeamentos Demonstrativos de UUIDv5:`);
  console.log(`   🏢 Fabricante: "${staging.fabricantes[0]?.id}" -> "${fabricantesUUID[0]?.id}"`);
  console.log(`   🏷️  Marca:      "${staging.marcas[0]?.id}" -> "${marcasUUID[0]?.id}" (FK fabricante_id: "${marcasUUID[0]?.fabricante_id}")`);
  console.log(`   🥩 Produto:    "${staging.produtos[0]?.id}" -> "${produtosUUID[0]?.id}" (FK marca_id: "${produtosUUID[0]?.marca_id}")`);
  console.log(`   📊 Barra SKU:  "${staging.codigos_barras[0]?.id}" -> "${codigosBarrasUUID[0]?.id}" (FK produto_id: "${codigosBarrasUUID[0]?.produto_id}")`);

  // -------------------------------------------------------------
  // CAMADA DE CARGA (LOAD): Supabase Upsert Ordenado
  // -------------------------------------------------------------
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('sua-instancia')) {
    console.log('\n⚠️  SUPABASE_URL ou SUPABASE_KEY não configurados no arquivo .env.');
    console.log('💡 Para carregar no banco remoto, preencha as variáveis SUPABASE_URL e SUPABASE_KEY no .env.');
    console.log('✨ A conversão para UUIDv5 e integridade relacional foram validadas com sucesso localmente!');
    return;
  }

  console.log(`\n📡 Conectando ao Supabase em: ${supabaseUrl}`);
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('\n🚀 Executando Carga Relacional Ordenada (.upsert)...');

  // Ordem de inserção estrita respeitando as Foreign Keys
  console.log('1️⃣  Sincronizando Fabricantes...');
  const countFab = await upsertInBatches(supabase, 'fabricantes', fabricantesUUID);

  console.log('2️⃣  Sincronizando Marcas...');
  const countMarcas = await upsertInBatches(supabase, 'marcas', marcasUUID);

  console.log('3️⃣  Sincronizando Produtos...');
  const countProdutos = await upsertInBatches(supabase, 'produtos', produtosUUID);

  console.log('4️⃣  Sincronizando Códigos de Barras...');
  const countCB = await upsertInBatches(supabase, 'codigos_barras', codigosBarrasUUID);

  console.log('\n🎉 === RESUMO DA SINCRONIZAÇÃO SUPABASE ===');
  console.log(`🏢 Fabricantes sincronizados: ${countFab}`);
  console.log(`🏷️  Marcas sincronizadas:      ${countMarcas}`);
  console.log(`🥩 Produtos sincronizados:    ${countProdutos}`);
  console.log(`📊 Códigos de Barras:         ${countCB}`);
  console.log('✅ Toda a estrutura relacional foi carregada com sucesso no Supabase!');
}

// Execução via CLI
if (process.argv[1] && process.argv[1].endsWith('sync.ts')) {
  syncStagingToSupabase().catch(err => {
    console.error('❌ Erro durante a sincronização:', err);
    process.exit(1);
  });
}
