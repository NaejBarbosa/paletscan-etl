/**
 * Pipeline de Upload de Mídia e Atualização de Imagens - PaletScan ETL
 * Autor: Engenheiro de Dados Sênior
 * 
 * Este módulo realiza:
 * 1. Leitura das imagens otimizadas .webp em images/processed/.
 * 2. Extração do SKU a partir do nome do arquivo (ex: 1005.webp -> SKU "1005").
 * 3. Cálculo do UUIDv5 determinístico idêntico ao sync.ts.
 * 4. Upload para o bucket 'produtos-imagens' no Supabase Storage.
 * 5. Geração da URL pública e UPDATE na tabela 'produtos' (imagem_url, status_imagem = 'aprovado').
 * 6. Mover arquivo processado para a pasta images/archived/ após o sucesso.
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { toUUID5 } from './sync.js';

dotenv.config();

const BASE_DIR = path.resolve(process.cwd());
const PROCESSED_DIR = path.join(BASE_DIR, 'images', 'processed');
const ARCHIVED_DIR = path.join(BASE_DIR, 'images', 'archived');
const BUCKET_NAME = 'produtos-imagens';

export async function syncImagesToSupabase() {
  console.log('🖼️  === INICIANDO PIPELINE DE UPLOAD DE IMAGENS E MÍDIA ===');

  if (!fs.existsSync(PROCESSED_DIR)) {
    console.log(`⚠️ Diretório ${PROCESSED_DIR} não existe.`);
    return;
  }

  // Garante a existência do diretório de arquivamento
  if (!fs.existsSync(ARCHIVED_DIR)) {
    fs.mkdirSync(ARCHIVED_DIR, { recursive: true });
  }

  // Lê todos os arquivos .webp do diretório processed
  const files = fs.readdirSync(PROCESSED_DIR).filter(file => file.endsWith('.webp'));

  if (files.length === 0) {
    console.log(`ℹ️ Nenhuma imagem .webp encontrada em ${PROCESSED_DIR} para processar.`);
    return;
  }

  console.log(`📦 Encontradas ${files.length} imagens em ${PROCESSED_DIR} para upload.`);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('sua-instancia')) {
    console.log('\n⚠️  SUPABASE_URL ou SUPABASE_KEY não configurados no arquivo .env.');
    console.log('💡 As imagens foram validadas e aguardam credenciais do Supabase para upload.');
    
    // Demonstração local da lógica de mapeamento UUID
    for (const filename of files.slice(0, 3)) {
      const sku = path.basename(filename, '.webp');
      const rawProductId = `prod_friboi_${sku}`;
      const productUuid = toUUID5(rawProductId);
      console.log(`   📌 Teste de SKU "${sku}" -> UUIDv5: "${productUuid}" (Arquivo: ${filename})`);
    }
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let successCount = 0;
  let failCount = 0;

  for (const filename of files) {
    const sku = path.basename(filename, '.webp');
    const localFilePath = path.join(PROCESSED_DIR, filename);
    const archiveFilePath = path.join(ARCHIVED_DIR, filename);

    // Calcula o UUIDv5 do produto no mesmo padrão estrito do sync.ts
    const rawProductId = `prod_friboi_${sku}`;
    const productUuid = toUUID5(rawProductId);

    const storagePath = `friboi/${sku}.webp`;

    try {
      console.log(`\n📤 Uploading ${filename} (SKU: ${sku} -> UUID: ${productUuid})...`);
      const fileBuffer = fs.readFileSync(localFilePath);

      // Upload para o Supabase Storage bucket 'produtos-imagens'
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from(BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
          contentType: 'image/webp',
          upsert: true
        });

      if (uploadError) {
        console.error(`❌ Falha no upload para o Storage (${filename}):`, uploadError.message);
        failCount++;
        continue;
      }

      // Obtém URL pública da imagem
      const { data: urlData } = supabase
        .storage
        .from(BUCKET_NAME)
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;
      console.log(`🔗 URL Pública gerada: ${publicUrl}`);

      // UPDATE na tabela produtos
      const { error: updateError } = await supabase
        .from('produtos')
        .update({
          imagem_url: publicUrl,
          status_imagem: 'aprovado'
        })
        .eq('id', productUuid);

      if (updateError) {
        console.error(`❌ Falha no UPDATE da tabela produtos (UUID: ${productUuid}):`, updateError.message);
        failCount++;
        continue;
      }

      // Mover arquivo local para a pasta images/archived
      fs.renameSync(localFilePath, archiveFilePath);
      console.log(`✅ Sucesso! Imagem arquivada em: images/archived/${filename}`);
      successCount++;

    } catch (err: any) {
      console.error(`❌ Erro inesperado ao processar ${filename}:`, err.message || err);
      failCount++;
    }
  }

  console.log('\n🎉 === RESUMO DO PIPELINE DE UPLOAD DE IMAGENS ===');
  console.log(`✅ Uploads efetuados com sucesso: ${successCount}`);
  console.log(`❌ Falhas: ${failCount}`);
  console.log(`📁 Imagens restantes em processed: ${files.length - successCount}`);
}

// Execução via CLI
if (process.argv[1] && process.argv[1].endsWith('sync_images.ts')) {
  syncImagesToSupabase().catch(err => {
    console.error('❌ Erro durante a execução de sync_images:', err);
    process.exit(1);
  });
}
