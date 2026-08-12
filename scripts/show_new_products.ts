import fs from 'fs';
import path from 'path';

const NOVOS_LOG_PATH = path.join(process.cwd(), 'staging', 'novos_produtos_log.json');

export interface NovoProdutoEntry {
  id: string;
  fornecedor?: string;
  marca: string;
  ean: string;
  dun?: string;
  descricao: string;
  classe?: string;
  conservacao?: string;
  criado_em: string;
}

export function showNewProducts() {
  if (!fs.existsSync(NOVOS_LOG_PATH)) {
    console.log('\x1b[1;33m⚠️ Nenhum registro de novos produtos em staging/novos_produtos_log.json.\x1b[0m');
    return;
  }

  try {
    const raw = fs.readFileSync(NOVOS_LOG_PATH, 'utf-8');
    const items: NovoProdutoEntry[] = JSON.parse(raw);
    console.log('\x1b[1;36m────────────────────────────────────\x1b[0m');
    console.log(`\x1b[1;32m✨ NOVOS PRODUTOS INCLUÍDOS NA BASE (${items.length})\x1b[0m`);
    console.log('\x1b[1;36m────────────────────────────────────\x1b[0m');

    if (!Array.isArray(items) || items.length === 0) {
      console.log('Nenhum novo produto registrado.');
      return;
    }

    items.forEach((item, idx) => {
      const eanStr = item.ean ? `EAN: ${item.ean}` : 'Sem EAN';
      const dunStr = item.dun ? ` | DUN: ${item.dun}` : '';
      console.log(`\x1b[1;33m[${idx + 1}/${items.length}]\x1b[0m \x1b[1m${item.marca || 'N/D'}\x1b[0m - \x1b[0;36m${eanStr}${dunStr}\x1b[0m`);
      console.log(`   📦 ${item.descricao}`);
      if (item.classe || item.conservacao) {
        console.log(`   🏷️  Classe: ${item.classe || 'N/D'} | ❄️ Conservação: ${item.conservacao || 'N/D'}`);
      }
      console.log(`   📅 Data de Inclusão: ${item.criado_em ? new Date(item.criado_em).toLocaleString('pt-BR') : 'Recente'}`);
      console.log('\x1b[0;36m------------------------------------\x1b[0m');
    });
  } catch (err: any) {
    console.error('❌ Erro ao ler registro de novos produtos:', err.message);
  }
}

if (require.main === module) {
  showNewProducts();
}
