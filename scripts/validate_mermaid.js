const fs = require('fs');
const path = require('path');
const https = require('https');

const docsDir = path.join(__dirname, '..', 'docs');

// Function to find all markdown files
function getMarkdownFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getMarkdownFiles(filePath));
    } else if (file.endsWith('.md')) {
      results.push(filePath);
    }
  });
  return results;
}

// Function to extract mermaid blocks
function extractMermaidBlocks(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const regex = /```mermaid\r?\n([\s\S]*?)```/g;
  const blocks = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    blocks.push({
      file: path.relative(path.join(__dirname, '..'), filePath),
      code: match[1].trim()
    });
  }
  return blocks;
}

// Check syntax rules that break Mermaid 11 parser
function lintMermaidCode(block) {
  const errors = [];
  const lines = block.code.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // 1. Check for unquoted parentheses or special chars inside edge labels |...|
    const edgeLabelMatch = line.match(/-->\s*\|([^|]+)\|/);
    if (edgeLabelMatch) {
      const label = edgeLabelMatch[1];
      if (/[(){}\[\]<>]/.test(label)) {
        errors.push(`Linha ${lineNum}: Caracteres proibidos em rótulo de aresta |${label}|: parênteses, chaves ou < >.`);
      }
      if (label.includes('/')) {
        errors.push(`Linha ${lineNum}: Barra / em rótulo de aresta |${label}|.`);
      }
    }

    // 2. Check for unescaped / unquoted < or > inside node labels
    if (/\["[^"]*<[^"]*"\]/.test(line) || /\["[^"]*>[^"]*"\]/.test(line)) {
      errors.push(`Linha ${lineNum}: Símbolo < ou > dentro de nó: "${trimmed}". Use texto explicativo.`);
    }

    // 3. Check for cylinder syntax conflicts [("...")] with internal parens
    if (/\[\(".*\(.*\).*"\)\]/.test(line)) {
      errors.push(`Linha ${lineNum}: Parênteses aninhados dentro de delimitador cilíndrico [("...")]: "${trimmed}".`);
    }

    // 4. Check for unescaped {id} inside brackets
    if (/\["[^"]*\{[^}]*\}[^"]*"\]/.test(line)) {
      errors.push(`Linha ${lineNum}: Chaves { } dentro de rótulo de nó colchete: "${trimmed}".`);
    }

    // 5. Check for wildcard * or _ inside quotes without care
    if (/\["[^"]*\*_[^"]*"\]/.test(line)) {
      errors.push(`Linha ${lineNum}: Padrão de wildcard perigoso *_ dentro de nó: "${trimmed}".`);
    }
  });

  return errors;
}

// Main execution
const files = getMarkdownFiles(docsDir);
let allBlocks = [];
files.forEach(f => {
  allBlocks = allBlocks.concat(extractMermaidBlocks(f));
});

console.log(`🔍 Total de arquivos MD analisados: ${files.length}`);
console.log(`📊 Total de diagramas Mermaid encontrados: ${allBlocks.length}\n`);

let totalErrors = 0;
allBlocks.forEach(b => {
  const errors = lintMermaidCode(b);
  if (errors.length > 0) {
    console.log(`❌ ERRO no arquivo: ${b.file}`);
    errors.forEach(e => console.log(`   └─ ${e}`));
    console.log(`   Código do diagrama:\n${b.code}\n-------------------`);
    totalErrors += errors.length;
  } else {
    console.log(`✅ OK: ${b.file} (${b.code.split('\n')[0]})`);
  }
});

if (totalErrors > 0) {
  console.log(`\n❌ Validação FALHOU com ${totalErrors} erro(s)!`);
  process.exit(1);
} else {
  console.log(`\n✨ Todos os ${allBlocks.length} diagramas passaram nas regras de validação!`);
}
