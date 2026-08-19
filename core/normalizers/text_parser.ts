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

// Mapa de correções específicas de acentuação e termos técnicos de alimentos/carnes
const ACCENT_CORRECTIONS: Record<string, string> = {
  'file': 'Filé',
  'filezinho': 'Filezinho',
  'moida': 'Moída',
  'acem': 'Acém',
  'coxao': 'Coxão',
  'musculo': 'Músculo',
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
  'hamburguer': 'Hambúrguer',
  'churrasco': 'Churrasco',
  'congelado': 'Congelado',
  'congelada': 'Congelada',
  'resfriado': 'Resfriado',
  'resfriada': 'Resfriada',
  'coracao': 'Coração',
  'coxa': 'Coxa',
  'coxas': 'Coxas',
  'sobrecoxa': 'Sobrecoxa',
  'sobrecoxas': 'Sobrecoxas',
  'coxinha': 'Coxinha',
  'coxinhas': 'Coxinhas',
  'empanado': 'Empanado',
  'empanados': 'Empanados',
  'empanadas': 'Empanadas',
  'suino': 'Suíno',
  'suina': 'Suína',
  'bovino': 'Bovino',
  'bovina': 'Bovina',
  'passarinho': 'Passarinho',
  'bolonhesa': 'Bolonhesa',
  'saude': 'Saúde',
  'proteina': 'Proteína',
  'peito': 'Peito',
  'frango': 'Frango',
  'tilapia': 'Tilápia',
  'polenta': 'Polenta',
  'batata': 'Batata',
  'aneis': 'Anéis',
  'cebola': 'Cebola',
  'airfryer': 'Airfryer',
};

/**
 * Converte uma string (mesmo em ALL CAPS) para Title Case padronizado em PT-BR,
 * higienizando unidades (kg/g) e acentuações.
 */
export function toTitleCase(input: string): string {
  if (!input) return '';

  // Remove caracteres decorativos como bullet points (•, |, ~) e limpa espaços
  let cleanStr = input
    .replace(/[•|~]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  const words = cleanStr.split(' ');

  const titleCased = words.map((word, index) => {
    // Trata pesos com unidades de medida no final (ex: "1kg", "500g", "1,005kg", "700G", "5KG")
    const weightUnitMatch = word.match(/^(\d+(?:[.,]\d+)?)(kg|g)$/i);
    if (weightUnitMatch) {
      const numVal = weightUnitMatch[1];
      const unitVal = weightUnitMatch[2].toLowerCase();
      return `${numVal}${unitVal}`;
    }

    // Preserva abreviações operacionais conhecidas (ex: B2B, SKU, EAN, DUN, IQF, 3D)
    if (/^(B2B|SKU|EAN|DUN|IQF|PWA|3D|CX|UN)$/i.test(word)) {
      return word.toUpperCase();
    }

    // Trata símbolos nas pontas (parênteses, hífens isolados)
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

    // Se for preposição/conectivo e não for a primeira palavra, mantém minúsculo
    if (index > 0 && LOWERCASE_WORDS.has(lowerCore)) {
      return leadingSymbol + lowerCore + trailingSymbol;
    }

    // Capitalização padrão PT-BR com suporte a acentos
    const firstChar = coreWord.charAt(0).toUpperCase();
    const restChars = coreWord.slice(1).toLowerCase();

    // Tratamento de hífens internos (ex: "Contra-Filé", "Pré-Cozido")
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

  return titleCased.join(' ').replace(/\s+/g, ' ').trim();
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

  // Se o texto explicitamente diz que é pesagem variável / a granel / pesar (sem peso fixo numérico individual)
  if (
    /\b(peso\s+vari[aá]vel|a\s+granel)\b/i.test(lowerText) ||
    (/\b(pesar)\b/i.test(lowerText) && !/\b\d+(?:[.,]\d+)?\s*(kg|g|l|ml)\b/i.test(lowerText))
  ) {
    return { peso_gramas: null, fracionado: true, peso_str: null };
  }

  // Multiplicadores (ex: "2 x 2,5kg", "2x500g", "caixa 4x1kg", "12x1L")
  const multiMatch = lowerText.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)\b/i);
  if (multiMatch) {
    const qtd = parseFloat(multiMatch[1]);
    const val = parseFloat(multiMatch[2].replace(',', '.'));
    const unit = multiMatch[3].toLowerCase();
    let totalGrams = 0;
    if (unit === 'kg' || unit === 'l') {
      totalGrams = qtd * val * 1000;
    } else {
      totalGrams = qtd * val;
    }
    return {
      peso_gramas: Math.round(totalGrams),
      fracionado: false,
      peso_str: `${qtd}x${val}${unit}`
    };
  }

  // Regex para captura de peso/volume em Litros (ex: "1L", "12L", "1,5 L")
  const literMatch = lowerText.match(/(\d+(?:[.,]\d+)?)\s*l\b/i);
  if (literMatch && !lowerText.includes('linguica') && !lowerText.includes('linguiça')) {
    const rawValStr = literMatch[1];
    const val = parseFloat(rawValStr.replace(',', '.'));
    return {
      peso_gramas: Math.round(val * 1000),
      fracionado: false,
      peso_str: `${rawValStr}l`
    };
  }

  // Regex para captura de volume em Mililitros (ex: "500ml", "200 ml")
  const mlMatch = lowerText.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (mlMatch) {
    const rawValStr = mlMatch[1];
    const val = parseFloat(rawValStr.replace(',', '.'));
    return {
      peso_gramas: Math.round(val),
      fracionado: false,
      peso_str: `${rawValStr}ml`
    };
  }

  // Regex para captura de peso fixo em Kg (ex: "1kg", "1,5 kg", "1,005kg", "5 kg")
  const kgMatch = lowerText.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (kgMatch) {
    const rawValStr = kgMatch[1];
    const val = parseFloat(rawValStr.replace(',', '.'));
    const totalGrams = Math.round(val * 1000);
    return {
      peso_gramas: totalGrams,
      fracionado: false,
      peso_str: `${rawValStr}kg`
    };
  }

  // Regex para captura de peso fixo em Gramas (ex: "500g", "350 g", "700g")
  const gMatch = lowerText.match(/(\d+(?:[.,]\d+)?)\s*g\b(?!r|[a-z])/i);
  if (gMatch) {
    const rawValStr = gMatch[1];
    const val = parseFloat(rawValStr.replace(',', '.'));
    return {
      peso_gramas: Math.round(val),
      fracionado: false,
      peso_str: `${rawValStr}g`
    };
  }

  // Se não possui peso numérico especificado -> produto fracionado / peso variável por peça/bandeja
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
export function formatProductDescription(
  rawTitle: string,
  knownWeightGrams?: number | null,
  isExplicitlyFracionado?: boolean
): ParsedProductText {
  const cleanTitle = toTitleCase(rawTitle);
  let weightData = extractWeight(rawTitle);

  // Se o título não continha peso, mas temos um peso conhecido no catálogo e não é fracionado
  if (
    weightData.peso_gramas === null &&
    knownWeightGrams !== undefined &&
    knownWeightGrams !== null &&
    knownWeightGrams > 0 &&
    isExplicitlyFracionado !== true
  ) {
    const pesoG = Math.round(knownWeightGrams);
    const pesoStr =
      pesoG >= 1000
        ? `${(pesoG / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}kg`
        : `${pesoG}g`;
    weightData = {
      peso_gramas: pesoG,
      fracionado: false,
      peso_str: pesoStr
    };
  } else if (isExplicitlyFracionado === true) {
    weightData.fracionado = true;
  } else if (isExplicitlyFracionado === false && weightData.peso_gramas !== null) {
    weightData.fracionado = false;
  }

  let formatted_description = cleanTitle;

  if (weightData.fracionado || weightData.peso_gramas === null) {
    // Garante sufixo "(pesar)" para produtos fracionados/sem peso fixo
    if (!/\(pesar\)/i.test(formatted_description)) {
      formatted_description = formatted_description
        .replace(/\s+fracionad[oa]/gi, '')
        .trim();
      formatted_description = `${formatted_description} (pesar)`;
    }
  } else if (weightData.peso_str) {
    // Se a descrição limpa contiver "(pesar)", remove já que possui peso fixo
    formatted_description = formatted_description.replace(/\s*\(pesar\)/gi, '').trim();

    // Se a descrição limpa ainda não contiver o peso, anexa
    const numPart = weightData.peso_str.replace(/[^\d.,]/g, '');
    const unitPart = weightData.peso_str.replace(/[\d.,]/g, '');
    const weightRegex = new RegExp(`\\b${numPart.replace('.', '[.,]')}\\s*${unitPart}\\b`, 'i');

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
 * Cálculo do dígito verificador Modulus 10 (GS1)
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

export function normalizeEAN13(rawEan: string | number | undefined | null): string | null {
  if (rawEan === undefined || rawEan === null) return null;

  let clean = String(rawEan).trim().replace(/\D/g, '');
  if (!clean) return null;

  if (clean.length === 13 && (clean.startsWith('0789') || clean.startsWith('0790'))) {
    clean = clean.slice(1);
  }

  if (clean.length > 13 && clean.startsWith('0')) {
    const unpadded = clean.replace(/^0+/, '');
    if (unpadded.length === 12 || unpadded.length === 13) {
      clean = unpadded;
    }
  }

  if (clean.length < 12) {
    clean = clean.padStart(12, '0');
  }

  if (clean.length === 12) {
    const checkDigit = calculateMod10CheckDigit(clean, 12);
    return `${clean}${checkDigit}`;
  }

  if (clean.length === 13) {
    return clean;
  }

  if (clean.length > 13) {
    return clean.slice(0, 13);
  }

  return clean;
}

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
