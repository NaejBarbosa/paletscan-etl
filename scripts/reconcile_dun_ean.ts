import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

if (!SUPABASE_KEY) {
  console.error('❌ Chave do Supabase não configurada.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function calcDvGs1(str: string): number {
  let soma = 0;
  const reverso = str.split('').reverse();
  for (let i = 0; i < reverso.length; i++) {
    const peso = (i % 2 === 0) ? 3 : 1;
    soma += parseInt(reverso[i], 10) * peso;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

function derivarEanDeDun(dun: string): string | null {
  if (!/^\d{14}$/.test(dun)) return null;
  const ean12 = dun.substring(1, 13);
  const dv = calcDvGs1(ean12);
  return ean12 + dv;
}

async function reconcileDunEan() {
  console.log('🔄 Iniciando Reconciliação GS1 de Códigos DUN & EAN...');

  let allCbs: any[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('codigos_barras')
      .select('id, produto_id, codigo, tipo, embalagem, quantidade_embalagem')
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (error) {
      console.error('❌ Erro ao buscar codigos_barras:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    allCbs = allCbs.concat(data);
    page++;
    if (data.length < 1000) break;
  }
  console.log(`📦 Total de codigos_barras no Supabase: ${allCbs.length}`);

  const eanMap = new Map<string, string>();
  const dunMap = new Map<string, any>();
  const prodByEan = new Map<string, string>();

  allCbs.forEach((c) => {
    const cod = String(c.codigo || '').trim();
    if (/^\d{13}$/.test(cod)) {
      eanMap.set(c.produto_id, cod);
      prodByEan.set(cod, c.produto_id);
    } else if (/^\d{14}$/.test(cod)) {
      dunMap.set(c.produto_id, c);
    }
  });

  let reconciliados = 0;
  let eansCriados = 0;
  const prodsToDelete: string[] = [];

  for (const [dunProdId, dunCb] of dunMap.entries()) {
    if (eanMap.has(dunProdId)) continue;

    const dunCode = String(dunCb.codigo).trim();
    const eanDerivado = derivarEanDeDun(dunCode);
    if (!eanDerivado) continue;

    const targetEanProdId = prodByEan.get(eanDerivado);

    if (targetEanProdId) {
      const { error: updErr } = await supabase
        .from('codigos_barras')
        .update({ produto_id: targetEanProdId })
        .eq('id', dunCb.id);

      if (updErr) {
        console.error(`⚠️ Erro ao transferir DUN ${dunCode} para produto ${targetEanProdId}:`, updErr.message);
      } else {
        reconciliados++;
        prodsToDelete.push(dunProdId);
        console.log(`✅ [Reconciliado] DUN ${dunCode} vinculado ao produto EAN ${eanDerivado} (prod_id: ${targetEanProdId})`);
      }
    } else {
      const newId = crypto.randomUUID();
      const { error: insErr } = await supabase
        .from('codigos_barras')
        .insert({
          id: newId,
          produto_id: dunProdId,
          codigo: eanDerivado,
          tipo: 'EAN',
          embalagem: 'UNIDADE',
          quantidade_embalagem: 1,
        });

      if (insErr) {
        console.error(`⚠️ Erro ao inserir EAN ${eanDerivado} para produto ${dunProdId}:`, insErr.message);
      } else {
        eansCriados++;
        eanMap.set(dunProdId, eanDerivado);
        prodByEan.set(eanDerivado, dunProdId);
        console.log(`✨ [EAN Derivado Criado] EAN ${eanDerivado} inserido para produto ${dunProdId} (DUN ${dunCode})`);
      }
    }
  }

  console.log(`\n🎉 Reconciliação concluída com sucesso!`);
  console.log(`- DUNs transferidos para produtos com EAN existentes: ${reconciliados}`);
  console.log(`- EANs derivados criados para produtos que só tinham DUN: ${eansCriados}`);

  if (prodsToDelete.length > 0) {
    console.log(`🧹 Removendo ${prodsToDelete.length} produtos duplicados órfãos da tabela produtos...`);
    for (const pId of prodsToDelete) {
      const { error: delErr } = await supabase.from('produtos').delete().eq('id', pId);
      if (delErr) {
        console.warn(`⚠️ Não foi possível deletar produto órfão ${pId}: ${delErr.message}`);
      }
    }
    console.log(`✅ Limpeza de órfãos concluída.`);
  }
}

reconcileDunEan();
