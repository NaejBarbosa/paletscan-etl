import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const targetEans = [
  '7899567259746',
  '7898542028421',
  '7896031252784',
  '7898302288683',
  '7894351092394'
];

async function diagnose() {
  console.log('🔍 === DIAGNÓSTICO DOS 5 EANS SOLICITADOS ===\n');

  for (const ean of targetEans) {
    console.log(`--------------------------------------------------`);
    console.log(`📌 EAN: ${ean}`);

    // 1. Buscar na tabela codigos_barras no Supabase
    const { data: cbData, error: cbErr } = await supabase
      .from('codigos_barras')
      .select('*, produtos(*, marcas(*, fabricantes(*)))')
      .eq('codigo', ean);

    if (cbErr) {
      console.error(`❌ Erro ao consultar codigos_barras no Supabase:`, cbErr.message);
    } else if (cbData && cbData.length > 0) {
      cbData.forEach(item => {
        const p = item.produtos;
        console.log(`  [Supabase DB]`);
        console.log(`    Produto ID:          ${p?.id}`);
        console.log(`    Descrição:           ${p?.descricao_padronizada}`);
        console.log(`    Descrição Original:  ${p?.descricao_original}`);
        console.log(`    Marca:               ${p?.marcas?.nome}`);
        console.log(`    Fabricante:          ${p?.marcas?.fabricantes?.nome}`);
        console.log(`    Status Imagem:       ${p?.status_imagem}`);
        console.log(`    Imagem URL Supabase: ${p?.imagem_url}`);
      });
    } else {
      console.log(`  ⚠️ EAN não encontrado na tabela codigos_barras do Supabase.`);
    }

    // 2. Verificar em repo_pwa/produtos.json
    const pwaJsonPath = '/root/repo_pwa/produtos.json';
    if (fs.existsSync(pwaJsonPath)) {
      const pwaItems = JSON.parse(fs.readFileSync(pwaJsonPath, 'utf-8'));
      const foundInPwa = pwaItems.filter((i: any) => i.produtoEan === ean || i.sku === ean);
      if (foundInPwa.length > 0) {
        foundInPwa.forEach((p: any) => {
          console.log(`  [PWA produtos.json]`);
          console.log(`    Título:              ${p.title || p.produtoDescr}`);
          console.log(`    Marca:               ${p.marcaNome}`);
          console.log(`    Imagem URL PWA:      ${p.imagemUrl || p.imagem_url}`);
          console.log(`    Status Imagem PWA:   ${p.statusImagem || p.status_imagem}`);
        });
      } else {
        console.log(`  ⚠️ EAN não encontrado no produtos.json do PWA.`);
      }
    }

    // 3. Verificar arquivo de imagem local em repo_pwa/public/imagens_produtos/<ean>.webp
    const localImgPath = `/root/repo_pwa/public/imagens_produtos/${ean}.webp`;
    if (fs.existsSync(localImgPath)) {
      const stats = fs.statSync(localImgPath);
      console.log(`  🖼️ [Imagem Local no PWA]`);
      console.log(`    Caminho: /imagens_produtos/${ean}.webp (${stats.size} bytes)`);
    } else {
      console.log(`  🖼️ [Imagem Local no PWA] Não existe arquivo físico ${ean}.webp em public/imagens_produtos/`);
    }
  }
}

diagnose().catch(console.error);
