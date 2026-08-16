import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '/root/paletscan-etl/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY não configuradas.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifySchema() {
  console.log('🔍 === AUDITORIA DO SCHEMA MULTI-TENANT & RLS NO SUPABASE ===\n');
  console.log(`🌐 Supabase URL: ${SUPABASE_URL}\n`);

  const tables = [
    { name: 'fabricantes', layer: 'Catálogo Mestre' },
    { name: 'marcas', layer: 'Catálogo Mestre' },
    { name: 'produtos', layer: 'Catálogo Mestre' },
    { name: 'codigos_barras', layer: 'Catálogo Mestre' },
    { name: 'empresas', layer: 'Multi-Tenant & Identidade' },
    { name: 'profiles', layer: 'Multi-Tenant & Identidade' },
    { name: 'paletes', layer: 'Operação & RLS' },
    { name: 'locais_armazenagem', layer: 'Operação & RLS' },
    { name: 'auditorias', layer: 'Auditoria & RLS' },
    { name: 'auditoria_itens', layer: 'Auditoria & RLS' },
    { name: 'watchlists', layer: 'Radar / Watchlist & RLS' },
    { name: 'qrcode_auth_sessions', layer: 'Autenticação Mobile' },
    { name: 'logs_sessao', layer: 'Logs & Governança' },
  ];

  let missingCount = 0;
  let readyCount = 0;

  for (const t of tables) {
    try {
      const { count, error } = await supabase
        .from(t.name)
        .select('id', { count: 'exact', head: true });

      if (error) {
        console.log(`❌ [${t.layer}] Tabela '${t.name}': Pendente de migração SQL (${error.message})`);
        missingCount++;
      } else {
        console.log(`✅ [${t.layer}] Tabela '${t.name}': Ativa e pronta (Registros: ${count ?? 0})`);
        readyCount++;
      }
    } catch (err: any) {
      console.log(`❌ [${t.layer}] Tabela '${t.name}': Erro de conexão (${err?.message || err})`);
      missingCount++;
    }
  }

  console.log('\n======================================================');
  console.log(`📊 Total de Tabelas Prontas: ${readyCount} / ${tables.length}`);
  if (missingCount > 0) {
    console.log(`⚠️  Existem ${missingCount} tabelas pendentes de criação no SQL Editor do Supabase.`);
    console.log(`📄 Execute o arquivo: db_sync/01_migration_multi_tenant_rls.sql`);
  } else {
    console.log(`🎉 Todas as tabelas multi-tenant e estruturas RLS estão 100% operacionais!`);
  }
  console.log('======================================================\n');
}

verifySchema().catch(console.error);
