import fs from 'fs';
import path from 'path';

const ATUALIZADOS_LOG_PATH = path.join(process.cwd(), 'staging', 'produtos_atualizados_log.json');

export interface AlteracaoCampoEntry {
  campo: string;
  de: any;
  para: any;
}

export interface ProdutoAtualizadoEntry {
  id: string;
  marca: string;
  ean: string;
  dun?: string;
  descricao: string;
  alteracoes: AlteracaoCampoEntry[];
  atualizado_em: string;
}

export function showUpdatedProducts() {
  if (!fs.existsSync(ATUALIZADOS_LOG_PATH)) {
    console.log('\x1b[1;33mℹ️ Nenhum registro de produtos alterados em staging/produtos_atualizados_log.json.\x1b[0m');
    return;
  }

  try {
    const raw = fs.readFileSync(ATUALIZADOS_LOG_PATH, 'utf-8');
    const items: ProdutoAtualizadoEntry[] = JSON.parse(raw);

    console.log('\x1b[1;36m────────────────────────────────────\x1b[0m');
    console.log(`\x1b[1;33m📝 PRODUTOS ALTERADOS/ATUALIZADOS NA BASE (${items.length})\x1b[0m`);
    console.log('\x1b[1;36m────────────────────────────────────\x1b[0m');

    if (!Array.isArray(items) || items.length === 0) {
      console.log('Nenhum produto sofreu alterações de dados nesta execução (0 alterados).');
      return;
    }

    items.forEach((item, idx) => {
      const eanStr = item.ean ? `EAN: ${item.ean}` : 'Sem EAN';
      const dunStr = item.dun ? ` | DUN: ${item.dun}` : '';
      console.log(`\x1b[1;33m[${idx + 1}/${items.length}]\x1b[0m \x1b[1m${item.marca || 'N/D'}\x1b[0m - \x1b[0;36m${eanStr}${dunStr}\x1b[0m`);
      console.log(`   📦 ${item.descricao}`);
      console.log(`   └─ 🔄 Alterações:`);
      item.alteracoes.forEach((alt) => {
        console.log(`      • \x1b[1;35m${alt.campo}\x1b[0m: de "\x1b[0;31m${alt.de}\x1b[0m" ➔ "\x1b[0;32m${alt.para}\x1b[0m"`);
      });
      console.log(`   📅 Data da Alteração: ${item.atualizado_em ? new Date(item.atualizado_em).toLocaleString('pt-BR') : 'Recente'}`);
      console.log('\x1b[0;36m------------------------------------\x1b[0m');
    });
  } catch (err: any) {
    console.error('❌ Erro ao ler registro de produtos alterados:', err.message);
  }
}

if (require.main === module) {
  showUpdatedProducts();
}
