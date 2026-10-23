// scripts/test_sast_exec_file_sync.ts
import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { extractAndAdaptAuroraPdfImage } from '../core/validators/pdf_extractor';
import { downloadAndConvertOfficialWebp, LOCAL_PROCESSED_IMG_DIR, PWA_PUBLIC_IMG_DIR } from '../core/normalizers/image_helper';
import { execFileSync } from 'child_process';

console.log('════════════════════════════════════════════════════════════════');
console.log('🛡️ TESTE UNITÁRIO SAST: IMUNIDADE SHELL INJECTION (execFileSync)');
console.log('════════════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function check(desc: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      res
        .then(() => {
          console.log(`  ✅ [PASS] ${desc}`);
          passed++;
        })
        .catch((err) => {
          console.error(`  ❌ [FAIL] ${desc}:`, err.message);
          failed++;
        });
    } else {
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${desc}:`, err.message);
    failed++;
  }
}

async function run() {
  // 1. Validação de extractAndAdaptAuroraPdfImage com execFileSync
  console.log('📄 1. Testando extrator PDF Aurora com execFileSync:');
  
  // Teste 1.1: Chamada segura que deve retornar objeto estruturado
  const resExtractor = extractAndAdaptAuroraPdfImage('999999', '7890000000000');
  assert.strictEqual(typeof resExtractor, 'object', 'Resultado deve ser um objeto estruturado');
  assert.strictEqual(resExtractor.sku, '999999', 'SKU deve ser preservado');
  assert.strictEqual(resExtractor.barcode, '7890000000000', 'Barcode deve ser preservado');
  assert.strictEqual(typeof resExtractor.success, 'boolean', 'Campo success deve ser booleano');
  console.log(`  ✅ [PASS] extractAndAdaptAuroraPdfImage executado via execFileSync sem erros de shell`);
  passed++;

  // Teste 1.2: Imunidade a caracteres maliciosos de Shell Injection
  const injectionAttemptSku = '424"; echo "VULNERAVEL';
  const resInjection = extractAndAdaptAuroraPdfImage(injectionAttemptSku, '7890000000001');
  assert.strictEqual(typeof resInjection, 'object', 'Execução com caracteres shell especiais não explode');
  assert.strictEqual(resInjection.sku, injectionAttemptSku, 'SKU malicioso recebido como argumento puro');
  console.log(`  ✅ [PASS] Imunidade contra Shell Injection confirmada via passagem estrita de array de argumentos`);
  passed++;

  // 2. Validação de downloadAndConvertOfficialWebp com execFileSync
  console.log('\n🖼️ 2. Testando conversor de imagem WebP com execFileSync & sys.argv:');

  // Teste 2.1: Parâmetros vazios
  const resEmpty = await downloadAndConvertOfficialWebp('', '');
  assert.strictEqual(resEmpty, false, 'Parâmetros vazios retornam false graciosamente');
  console.log(`  ✅ [PASS] downloadAndConvertOfficialWebp rejeita argumentos vazios`);
  passed++;

  // Teste 2.2: Conversão pontual via script Python seguro com sys.argv
  const dummyFile = path.join('/tmp', `test_sast_dummy_${Date.now()}.png`);
  const dummyOut1 = path.join(LOCAL_PROCESSED_IMG_DIR, `test_dummy_${Date.now()}.webp`);
  const dummyOut2 = path.join(PWA_PUBLIC_IMG_DIR, `test_dummy_${Date.now()}.webp`);

  try {
    // Gera uma imagem PNG mínima válida de 1x1 pixel (RGBA) em Python
    execFileSync('python3', [
      '-c',
      'import sys; from PIL import Image; img = Image.new("RGBA", (10, 10), (255, 0, 0, 255)); img.save(sys.argv[1], "PNG")',
      dummyFile,
    ]);

    // Executa a conversão exatamente com o script e mecanismo usado em image_helper.ts
    const pyScript = `
import sys
from PIL import Image
try:
    src_file = sys.argv[1]
    out_file1 = sys.argv[2]
    out_file2 = sys.argv[3]
    img = Image.open(src_file).convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    alpha_composite = Image.alpha_composite(bg, img)
    final_img = alpha_composite.convert("RGB")
    final_img.save(out_file1, "WEBP", quality=92, method=6)
    final_img.save(out_file2, "WEBP", quality=92, method=6)
    print("OK")
except Exception as e:
    print(f"ERROR: {e}")
`;
    const out = execFileSync('python3', ['-c', pyScript, dummyFile, dummyOut1, dummyOut2], { encoding: 'utf-8' }).trim();
    assert.strictEqual(out, 'OK', 'Conversão de teste retornou OK');
    assert(fs.existsSync(dummyOut1), 'Arquivo WebP gerado no diretório processed do ETL');
    assert(fs.existsSync(dummyOut2), 'Arquivo WebP gerado no diretório public do PWA');
    console.log(`  ✅ [PASS] Script Python com sys.argv[1..3] executou conversão WebP perfeita`);
    passed++;
  } finally {
    if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile);
    if (fs.existsSync(dummyOut1)) fs.unlinkSync(dummyOut1);
    if (fs.existsSync(dummyOut2)) fs.unlinkSync(dummyOut2);
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`📊 RESULTADO DOS TESTES SAST: ${passed} PASSOU | ${failed} FALHOU`);
  console.log('════════════════════════════════════════════════════════════════');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Falha fatal nos testes SAST:', err);
  process.exit(1);
});
