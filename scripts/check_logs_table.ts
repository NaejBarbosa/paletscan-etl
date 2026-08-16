import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.SUPABASE_URL || 'https://xyujqsitpshfqnlogeib.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabaseService = createClient(url, serviceKey);
const supabaseAnon = createClient(url, anonKey);

async function checkLogs() {
  console.log('--- SERVICE ROLE QUERY ---');
  const { data: sData, error: sErr } = await supabaseService.from('logs_sessao').select('*').limit(10);
  console.log('Service role count:', sData?.length, '| Error:', sErr?.message || 'none');
  if (sData && sData.length > 0) console.log('Sample service role log:', sData[0]);

  console.log('\n--- ANON ROLE QUERY ---');
  const { data: aData, error: aErr } = await supabaseAnon.from('logs_sessao').select('*').limit(10);
  console.log('Anon role count:', aData?.length, '| Error:', aErr?.message || 'none');
}

checkLogs();
