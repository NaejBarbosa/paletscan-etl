/**
 * Módulo de Normalização de Texto e Extração de Pesos - PaletScan ETL
 * Autor: Engenheiro de Dados Sênior
 */

export interface ParsedProductText {
  title_clean: string;
  formatted_description: string;
  peso_gramas: number | null;
  fracionado: boolean;
  peso_str: string | null;
}

// Palavras que devem permanecer em minúsculas (preposições/conectivos em Português)
const LOWERCASE_WORDS = new Set([
  'de', 'do', 'da', 'dos', 'das',
  'com', 'sem', 'em', 'para', 'por',
  'e', 'a', 'o', 'as', 'os'
]);

// Mapa de correções específicas de acentuação e termos técnicos de carnes
const ACCENT_CORRECTIONS: Record<string, string> = {
  'file': 'Filé',
  'FILE': 'Filé',
  'moida': 'Moída',
  'MOIDA': 'Moída',
  'acem': 'Acém',
  'ACEM': 'Acém',
  'coxao': 'Coxão',
  'COXAO': 'Coxão',
  'musculo': 'Músculo',
  'MUSCULO': 'Músculo',
  'fraldinha': 'Fraldinha',
  'picanha': 'Picanha',
  'maminha': 'Maminha',
  'alcatra': 'Alcatra',
  'contra': 'Contra',
  'cupim': 'Cupim',
  'costela': 'Costela',
  'patinho': 'Patinho',
  'paleta': 'Paleta',
  'lagarto': 'Lagarto',
  'linguica': 'Linguiça',
  'LINGUICA': 'Linguiça',
  'hamburguer': 'Hambúrguer',
  'HAMBURGUER': 'Hambúrguer',
  'churrasco': 'Churrasco',
  'congelado': 'Congelado',
  'resfriado': 'Resfriado',
  'fracionado': 'Fracionado',
  'fracionada': 'Fracionada',
};

/**
 * Converte uma string (mesmo em ALL CAPS) para Title Case preservando acentos em PT-BR
 * e corrigindo palavras conhecidas (como Filé, Moída, Acém).
 */
export function toTitleCase(input: string): string {
  if (!input) return '';

  // Remove espaços duplicados e limpa a string
  const cleanStr = input.trim().replace(/\s+/g, ' ');

  // Divide por palavras ou delimitadores mantendo a estrutura
  const words = cleanStr.split(' ');

  const titleCased = words.map((word, index) => {
    // Preserva abreviações completas como B2B, SKU, EAN, DUN, KG, 3D ou números isolados
    if (/^[A-Z0-9]{2,4}$/.test(word) && !/^[A-Z]+$/.test(word)) {
      return word;
    }

    // Trata palavras com parênteses (ex: "(3") ou "(PESAR)")
    const leadingSymbol = word.match(/^[(\["']+/)?.[0] || '';
    const trailingSymbol = word.match(/[)\].,"':;!?]+$/)?.[0] || '';
    
    const coreWord = word.slice(
      leadingSymbol.length,
      word.length - trailingSymbol.length
    );

    if (!coreWord) return word;

    const lowerCore = coreWord.toLowerCase();
    const upperCore = coreWord.toUpperCase();

    // Verificação em dicionário de correções de acentuação
    if (ACCENT_CORRECTIONS[lowerCore] || ACCENT_CORRECTIONS[upperCore]) {
      const corrected = ACCENT_CORRECTIONS[lowerCore] || ACCENT_CORRECTIONS[upperCore];
      return leadingSymbol + corrected + trailingSymbol;
    }

    // Se for preposição e não for a primeira palavra, mantém minúsculo
    if (index > 0 && LOWERCASE_WORDS.has(lowerCore)) {
      return leadingSymbol + lowerCore + trailingSymbol;
    }

    // Capitalização padrão PT-BR com suporte a caracteres acentuados
    const firstChar = coreWord.charAt(0).toUpperCase();
    const restChars = coreWord.slice(1).toLowerCase();
    
    // Tratamento especial para palavras compostas com hífen (ex: "Contra-Filé", "Pré-Cozido")
    if (restChars.includes('-')) {
      const subParts = (firstChar + restChars).split('-');
      const formattedSubParts = subParts.map((part, subIdx) => {
        const partLower = part.toLowerCase();
        if (ACCENT_CORRECTIONS[partLower]) return ACCENT_CORRECTIONS[partLower];
        if (subIdx > 0 && LOWERCASE_WORDS.has(partLower)) return partLower;
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      });
      return leadingSymbol + formattedSubParts.join('-') + trailingSymbol;
    }

    return leadingSymbol + firstChar + restChars + trailingSymbol;
  });

  return titleCased.join(' ');
}

/**
 * Extrai peso líquido em gramas e identifica se o produto é fracionado (peso variável).
 */
export function extractWeight(text: string): {
  peso_gramas: number | null;
  fracionado: boolean;
  peso_str: string | null;
} {
  if (!text) {
    return { peso_gramas: null, fracionado: true, peso_str: null };
  }

  const lowerText = text.toLowerCase();

  // Verificação de indicativos explícitos de produto fracionado / peso variável
  const isExplicitFracionado = /fracionad[oa]|peso\s*vari[áa]vel|pe[çc]a|pesar|aprox|\bkg\b(?!\s*\d)/i.test(lowerText);

  // Regex para captura de peso fixo em Kg (ex: "1kg", "1,5 kg", "2.5kg", "0,5kg")
  const kgMatch = lowerText.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  // Regex para captura de peso fixo em Gramas (ex: "500g", "350 g", "190g")
  const gMatch = lowerText.match(/(\d+(?:[.,]\d+)?)\s*g\b(?!r)/i);
  // Regex para pacotes multiplicadores (ex: "2 x 2,5kg", "2x2.5kg")
  const multiMatch = lowerText.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);

  if (multiMatch) {
    const qtd = parseFloat(multiMatch[1]);
    const val = parseFloat(multiMatch[2].replace(',', '.'));
    const unit = multiMatch[3].toLowerCase();
    
    let totalGrams = unit === 'kg' ? qtd * val * 1000 : qtd * val;
    return {
      peso_gramas: Math.round(totalGrams),
      fracionado: false,
      peso_str: `${qtd}x${val}${unit}`
    };
  }

  if (kgMatch && !isExplicitFracionado) {
    const val = parseFloat(kgMatch[1].replace(',', '.'));
    // Se o valor for muito grande (ex: 20kg em peças), pode ser fracionado ou caixa, mas se for peso fixo converte
    const totalGrams = Math.round(val * 1000);
    return {
      peso_gramas: totalGrams,
      fracionado: false,
      peso_str: `${val}kg`
    };
  }

  if (gMatch && !isExplicitFracionado) {
    const val = parseFloat(gMatch[1].replace(',', '.'));
    return {
      peso_gramas: Math.round(val),
      fracionado: false,
      peso_str: `${val}g`
    };
  }

  // Se tem indicativo fracionado ou não encontrou peso fixo de embalagem individual
  return {
    peso_gramas: null,
    fracionado: true,
    peso_str: null
  };
}

/**
 * Formata a string final no padrão padronizado PaletScan:
 * "Nome do Produto + Peso" (se peso fixo) OU "Nome do Produto (pesar)" (se fracionado)
 */
export function formatProductDescription(rawTitle: string): ParsedProductText {
  const cleanTitle = toTitleCase(rawTitle);
  const weightData = extractWeight(rawTitle);

  let formatted_description = cleanTitle;

  if (weightData.fracionado || weightData.peso_gramas === null) {
    // Se a descrição ainda não contém "(pesar)", ajusta
    if (!/\(pesar\)/i.test(formatted_description)) {
      // Remove termos redundantes como "Fracionada", "Fracionado" para deixar a string limpa
      formatted_description = formatted_description
        .replace(/\s+fracionad[oa]/gi, '')
        .trim();
      formatted_description = `${formatted_description} (pesar)`;
    }
  } else if (weightData.peso_str) {
    // Garante que o peso esteja presente na descrição final
    const weightRegex = new RegExp(weightData.peso_str.replace('.', '\\.'), 'i');
    if (!weightRegex.test(formatted_description)) {
      formatted_description = `${formatted_description} ${weightData.peso_str}`;
    }
  }

  return {
    title_clean: cleanTitle,
    formatted_description,
    peso_gramas: weightData.peso_gramas,
    fracionado: weightData.fracionado,
    peso_str: weightData.peso_str
  };
}

/**
 * Função auxiliar para calcular o dígito verificador Modulus 10 (GS1)
 * para payloads numéricos de 12 dígitos (EAN-13) ou 13 dígitos (DUN-14).
 */
export function calculateMod10CheckDigit(digitsStr: string, expectedLen: number): number {
  let sum = 0;
  const isOddMult3 = expectedLen === 13;

  for (let i = 0; i < digitsStr.length; i++) {
    const digit = parseInt(digitsStr[i], 10);
    const position1Based = i + 1;
    const isOddPosition = position1Based % 2 !== 0;

    let multiplier = 1;
    if (isOddMult3) {
      multiplier = isOddPosition ? 3 : 1;
    } else {
      multiplier = isOddPosition ? 1 : 3;
    }

    sum += digit * multiplier;
  }

  return (10 - (sum % 10)) % 10;
}

/**
 * Garante a integridade absoluta do EAN-13 (13 dígitos numéricos).
 * Preserva o EAN estritamente como string e calcula o 13º dígito verificador (Modulus 10)
 * caso a extração original contenha 12 dígitos (ou menos).
 */
export function normalizeEAN13(rawEan: string | number | undefined | null): string | null {
  if (rawEan === undefined || rawEan === null) return null;

  let clean = String(rawEan).trim().replace(/\D/g, '');
  if (!clean) return null;

  // Caso 1: 13 dígitos iniciando com '0789' ou '0790' -> EAN de 12 dígitos com zero à esquerda (sem dígito verificador)
  if (clean.length === 13 && (clean.startsWith('0789') || clean.startsWith('0790'))) {
    clean = clean.slice(1);
  }

  // Caso 2: Zeros à esquerda extras em códigos mais longos (ex: 00789...)
  if (clean.length > 13 && clean.startsWith('0')) {
    const unpadded = clean.replace(/^0+/, '');
    if (unpadded.length === 12 || unpadded.length === 13) {
      clean = unpadded;
    }
  }

  // Caso 3: Código com menos de 12 dígitos -> pad com zeros até 12 dígitos para cálculo do 13º dígito
  if (clean.length < 12) {
    clean = clean.padStart(12, '0');
  }

  // Caso 4: Código com 12 dígitos brutos -> calcula obrigatoriamente o 13º dígito verificador Modulus 10 (GS1)
  if (clean.length === 12) {
    const checkDigit = calculateMod10CheckDigit(clean, 12);
    return `${clean}${checkDigit}`;
  }

  // Caso 5: Código com 13 dígitos válidos -> retorna diretamente
  if (clean.length === 13) {
    return clean;
  }

  // Caso 6: Mais de 13 dígitos -> trunca para 13 dígitos
  if (clean.length > 13) {
    return clean.slice(0, 13);
  }

  return clean;
}

/**
 * Formata e valida o código DUN-14 (obrigatoriamente 14 dígitos numéricos).
 * Se o DUN fornecido for de 14 dígitos, preserva a string.
 * Se tiver 13 dígitos, calcula o 14º dígito verificador Modulus 10.
 * Caso contrário, deriva o DUN-14 oficial a partir do EAN-13 do produto
 * (Variante logística '1' + 12 primeiros dígitos do EAN-13 + Dígito Verificador Modulus 10).
 */
export function normalizeDUN14(rawDun?: string | number | null, ean13?: string | null): string | null {
  let cleanDun = rawDun ? String(rawDun).trim().replace(/\D/g, '') : '';

  if (cleanDun.length === 14) {
    return cleanDun;
  }

  if (cleanDun.length === 13) {
    const checkDigit = calculateMod10CheckDigit(cleanDun, 13);
    return `${cleanDun}${checkDigit}`;
  }

  if (ean13 && ean13.length === 13) {
    const eanBase12 = ean13.slice(0, 12);
    const dunBase13 = `1${eanBase12}`;
    const checkDigit = calculateMod10CheckDigit(dunBase13, 13);
    return `${dunBase13}${checkDigit}`;
  }

  return null;
}


