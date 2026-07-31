import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function validateAndSanitizeImageUrls() {
  console.log('🔍 === INICIANDO VALIDAÇÃO DE URLs DE IMAGEM NO SUPABASE ===');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL ou SUPABASE_KEY não configurados.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Busca todos os produtos com status_imagem = 'aprovado' e imagem_url preenchida
  const { data: produtos, error } = await supabase
    .from('produtos')
    .select('id, descricao_padronizada, imagem_url, status_imagem')
    .eq('status_imagem', 'aprovado')
    .not('imagem_url', 'is', null);

  if (error) {
    console.error('❌ Erro ao buscar produtos no Supabase:', error.message);
    process.exit(1);
  }

  console.log(`📦 Verificando acessibilidade HTTP de ${produtos.length} produtos com imagem aprovada...`);

  let brokenCount = 0;
  let okCount = 0;

  for (let i = 0; i < produtos.length; i++) {
    const prod = produtos[i];
    const url = prod.imagem_url;

    if (!url || typeof url !== 'string') continue;

    try {
      // Faz requisição com redirect manual para verificar se a imagem real existe
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });

      if (!res.ok || res.status === 404 || res.status === 403) {
        brokenCount++;
        console.log(`❌ [${brokenCount}] URL quebrada (${res.status}): ${prod.descricao_padronizada} -> ${url}`);

        // Atualiza status_imagem para sem_imagem para evitar piscamento/placeholder no PWA
        await supabase
          .from('produtos')
          .update({ status_imagem: 'sem_imagem', imagem_url: null })
          .eq('id', prod.id);
      } else {
        okCount++;
      }
    } catch (err: any) {
      brokenCount++;
      console.log(`⚠️ [${brokenCount}] Falha de conexão ao validar URL: ${prod.descricao_padronizada} -> ${err.message}`);

      await supabase
        .from('produtos')
        .update({ status_imagem: 'sem_imagem', imagem_url: null })
        .eq('id', prod.id);
    }

    if ((i + 1) % 100 === 0) {
      console.log(`⏳ Progresso: ${i + 1}/${produtos.length} validados (${brokenCount} quebradas)...`);
    }
  }

  console.log(`\n🎉 === RESUMO DA VALIDAÇÃO DE URLs DE IMAGEM ===`);
  console.log(`✅ Imagens acessíveis e OK: ${okCount}`);
  console.log(`⚠️  Imagens 404/quebradas higienizadas: ${brokenCount}`);
}

validateAndSanitizeImageUrls().catch(err => {
  console.error('❌ Erro fatal na validação:', err);
  process.exit(1);
});
