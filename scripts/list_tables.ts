import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

const supabase = createClient(url, serviceKey);

async function listTables() {
  const { data, error } = await supabase
    .rpc('get_tables'); // Or query information_schema

  console.log('Testing table queries:');
  const tables = ['logs_sessao', 'logs', 'logs_auditoria', 'auditoria', 'usuarios', 'paletes', 'produtos', 'marcas', 'codigos_barras'];
  for (const table of tables) {
    const { count, error: err } = await supabase.from(table).select('*', { count: 'exact', head: true });
    console.log(`Table '${table}': count = ${count}, error = ${err ? err.message : 'none'}`);
  }
}

listTables();
