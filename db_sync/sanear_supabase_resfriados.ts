import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

async function sanearSupabase() {
  console.log('[*] Iniciando saneamento do Supabase para regra: Apenas Resfriados fracionados...');

  // 1. Remover registros órfãos ou indevidos de codigos_barras com tipo PESAR
  const { data: pesares, error: errPesares } = await supabase
    .from('codigos_barras')
    .select('id, codigo, tipo, produto_id')
    .ilike('tipo', '%PESAR%');

  if (errPesares) {
    console.error('[!] Erro ao buscar codigos_barras PESAR:', errPesares);
  } else if (pesares && pesares.length > 0) {
    console.log(`[+] Encontrados ${pesares.length} registros com tipo PESAR em codigos_barras. Excluindo...`);
    for (const p of pesares) {
      const { error: delErr } = await supabase
        .from('codigos_barras')
        .delete()
        .eq('id', p.id);
      if (delErr) {
        console.error(`[!] Erro ao deletar codigo_barras ${p.id}:`, delErr);
      } else {
        console.log(`[OK] Removido codigo_barras PESAR id=${p.id}, codigo=${p.codigo}`);
      }
    }
  } else {
    console.log('[+] Nenhum codigo_barras do tipo PESAR encontrado.');
  }

  // 2. Atualizar fracionado = false para TODOS os produtos que NÃO são 'Resfriado'
  const { data: naoResfriados, error: errNaoResf } = await supabase
    .from('produtos')
    .select('id, conservacao, fracionado')
    .eq('fracionado', true)
    .neq('conservacao', 'Resfriado');

  if (errNaoResf) {
    console.error('[!] Erro ao buscar produtos não resfriados com fracionado=true:', errNaoResf);
  } else if (naoResfriados && naoResfriados.length > 0) {
    console.log(`[+] Encontrados ${naoResfriados.length} produtos não resfriados com fracionado=true. Corrigindo para false...`);
    const ids = naoResfriados.map(p => p.id);
    // Atualiza em lotes de 100
    for (let i = 0; i < ids.length; i += 100) {
      const batchIds = ids.slice(i, i + 100);
      const { error: updErr } = await supabase
        .from('produtos')
        .update({ fracionado: false })
        .in('id', batchIds);
      if (updErr) {
        console.error(`[!] Erro ao atualizar lote de fracionado=false:`, updErr);
      } else {
        console.log(`[OK] Atualizados ${batchIds.length} produtos (fracionado = false)`);
      }
    }
  } else {
    console.log('[+] Todos os produtos não resfriados já estão com fracionado = false.');
  }

  // 3. Limpar (pesar) da descricao_padronizada de todos os produtos
  const { data: comPesar, error: errPesar } = await supabase
    .from('produtos')
    .select('id, descricao_padronizada')
    .ilike('descricao_padronizada', '%pesar%');

  if (errPesar) {
    console.error('[!] Erro ao buscar produtos com (pesar) na descrição:', errPesar);
  } else if (comPesar && comPesar.length > 0) {
    console.log(`[+] Encontrados ${comPesar.length} produtos com (pesar) na descrição. Higienizando...`);
    for (const p of comPesar) {
      let descr = p.descricao_padronizada;
      if (typeof descr === 'string') {
        const limpa = descr.replace(/\s*\([Pp]esar\)/gi, '').replace(/\s+/g, ' ').trim();
        const { error: updErr } = await supabase
          .from('produtos')
          .update({ descricao_padronizada: limpa })
          .eq('id', p.id);
        if (updErr) {
          console.error(`[!] Erro ao atualizar descricao do produto ${p.id}:`, updErr);
        }
      }
    }
    console.log(`[OK] Concluída a higienização de ${comPesar.length} descrições.`);
  }

  // 4. Verificação explícita do caso Lar 7896419721116
  const { data: prodLar } = await supabase
    .from('vw_produtos_com_marcas')
    .select('id, produto_id, descricao_padronizada, conservacao, fracionado, ean')
    .eq('ean', '7896419721116');
  console.log('[VERIFICAÇÃO] vw_produtos_com_marcas para 7896419721116:', prodLar);

  console.log('[+] Saneamento do Supabase concluído com sucesso!');
}

sanearSupabase().catch(err => {
  console.error('[!] Falha fatal no saneamento:', err);
  process.exit(1);
});
