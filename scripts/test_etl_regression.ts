import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { v5 as uuidv5 } from 'uuid';
import XLSX from 'xlsx';
import { toUUID5, PALETSCAN_NAMESPACE } from '../db_sync/sync';
import {
  formatProductDescription,
  normalizeEAN13,
  normalizeDUN14,
  sanitizeDescriptionAnomalies,
} from '../core/normalizers/text_parser';
import { classifyBrand, FABRICANTE_FRIBOI_ID } from '../core/heuristics/brand_classifier';
import { classifyProduct } from '../core/heuristics/category_classifier';

console.log('════════════════════════════════════════════════════════════════');
console.log('🧪 TESTE DE REGRESSÃO DO PALETSCAN ETL (NPM 12 / RUNTIME / CORE)');
console.log('════════════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function testCase(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${name}: ${err?.message || err}`);
    failed++;
  }
}

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('📦 1. Configuração do Projeto & Compatibilidade npm 12+:');

testCase('.npmrc habilita allow-remote=root para SheetJS xlsx', () => {
  const npmrcPath = path.join(ROOT_DIR, '.npmrc');
  assert(fs.existsSync(npmrcPath), '.npmrc deve existir na raiz do projeto');
  const content = fs.readFileSync(npmrcPath, 'utf-8');
  assert(/^\s*allow-remote\s*=\s*root\s*$/m.test(content), '.npmrc deve definir allow-remote=root');
});

testCase('package.json aprova install scripts de esbuild e define engines', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
  assert(pkg.allowScripts && typeof pkg.allowScripts === 'object', 'allowScripts deve existir no package.json');
  const esbuildApproval = Object.entries(pkg.allowScripts).find(
    ([key, val]) => key.startsWith('esbuild@') && val === true
  );
  assert(esbuildApproval, 'esbuild deve estar aprovado em allowScripts');
  assert(pkg.engines?.node, 'engines.node deve estar definido');
  assert(pkg.engines?.npm, 'engines.npm deve estar definido');
  assert(!pkg.devDependencies?.['@types/uuid'], 'stub obsoleto @types/uuid deve ter sido removido');
});

testCase('package-lock.json válido (lockfileVersion 3) com uuid >= 14', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package-lock.json'), 'utf-8'));
  assert.strictEqual(lock.lockfileVersion, 3, 'lockfileVersion deve ser 3');
  const uuidEntry = lock.packages?.['node_modules/uuid'];
  assert(uuidEntry?.version, 'uuid deve estar resolvido no lockfile');
  const major = parseInt(String(uuidEntry.version).split('.')[0], 10);
  assert(major >= 14, `Esperado uuid >= 14, obtido ${uuidEntry.version}`);
});

console.log('\n🔑 2. Integridade Determinística UUIDv5 (uuid@14) & SheetJS (xlsx):');

testCase('UUIDv5 determinístico consistente com PALETSCAN_NAMESPACE', () => {
  const expected = 'c7af7b32-ec4a-528f-968c-376b08f2d311';
  assert.strictEqual(uuidv5('prod_test', PALETSCAN_NAMESPACE), expected);
  assert.strictEqual(toUUID5('marca_friboi'), uuidv5('marca_friboi', PALETSCAN_NAMESPACE));
  assert.strictEqual(toUUID5(expected), expected);
});

testCase('SheetJS xlsx@0.20.3 gera e lê planilhas preservando strings EAN', () => {
  assert.strictEqual(XLSX.version, '0.20.3');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    { EAN: '0789490423896', Descricao: 'Bacon em Pedaços 1kg' },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const parsedWb = XLSX.read(buf, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(parsedWb.Sheets['Produtos']);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].EAN, '0789490423896');
});

console.log('\n🧹 3. Normalizadores de Códigos GS1, Textos e Heurísticas:');

testCase('normalizeEAN13 e normalizeDUN14 calculam dígitos verificadores Modulus 10', () => {
  assert.strictEqual(normalizeEAN13('789490423896'), '7894904238965');
  assert.strictEqual(normalizeEAN13('07894904238965'), '7894904238965');
  assert.strictEqual(normalizeDUN14(null, '7894904238965'), '17894904238962');
});

testCase('formatProductDescription e sanitizeDescriptionAnomalies preservam acentuação e peso', () => {
  const parsed = formatProductDescription('FILE DE PEITO DE FRANGO CONGELADO 1KG');
  assert.strictEqual(parsed.peso_gramas, 1000);
  assert.strictEqual(parsed.fracionado, false);
  assert(parsed.formatted_description.includes('Filé'), `Descrição inesperada: ${parsed.formatted_description}`);

  const cleaned = sanitizeDescriptionAnomalies('Coxinhahahahaha de Frango Frango');
  assert.strictEqual(cleaned.toLowerCase(), 'coxinha de frango');
});

testCase('classifyBrand e classifyProduct mantêm taxonomia canônica sem falsos positivos', () => {
  const brand = classifyBrand('Seara Gourmet', 'Bacon');
  assert.strictEqual(brand.fabricante_id, FABRICANTE_FRIBOI_ID);
  assert.strictEqual(brand.nome, 'Seara Gourmet');

  const noLarFalsePositive = classifyBrand('Desconhecida', 'Picanha Retangular 1kg');
  assert.notStrictEqual(noLarFalsePositive.nome, 'Lar');

  const ave = classifyProduct('Peito de Frango Congelado IQF 1kg');
  assert.strictEqual(ave.classe, 'Aves');
  assert.strictEqual(ave.conservacao, 'Congelado');

  const proc = classifyProduct('Linguiça Calabresa Defumada 2,5kg');
  assert.strictEqual(proc.classe, 'Processados & Embutidos');
});

console.log('\n📋 4. Manifesto de Schema & Script de Aliases:');

testCase('core/manifest/schema_manifest.json e paletscan_aliases.sh íntegros', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'core', 'manifest', 'schema_manifest.json'), 'utf-8')
  );
  assert(manifest.properties?.produtos, 'schema_manifest.json deve definir produtos');

  const aliases = fs.readFileSync(path.join(ROOT_DIR, 'paletscan_aliases.sh'), 'utf-8');
  assert(aliases.includes('npm run full'), 'paletscan_aliases.sh deve referenciar npm run full');
  assert(aliases.includes('NVM_DIR'), 'paletscan_aliases.sh deve configurar NVM_DIR');
});

console.log('\n════════════════════════════════════════════════════════════════');
console.log(`📊 RESULTADO DA REGRESSÃO: ${passed} PASSOU | ${failed} FALHOU`);
console.log('════════════════════════════════════════════════════════════════');

if (failed > 0) process.exit(1);
