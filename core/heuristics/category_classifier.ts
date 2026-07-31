/**
 * Heurística de Classificação de Categorias e Conservação - PaletScan ETL
 */

export interface ProductClassification {
  classe: string;
  conservacao: 'Resfriado' | 'Congelado' | 'Temperatura Ambiente' | 'Outros';
}

/**
 * Classifica a classe do produto (Bovinos, Suínos, Aves, Pescados, Processados, etc.)
 * e o estado de conservação (Resfriado, Congelado, Temperatura Ambiente)
 */
export function classifyProduct(title: string, rawClasse?: string, rawConservacao?: string): ProductClassification {
  const text = `${title} ${rawClasse || ''} ${rawConservacao || ''}`.toLowerCase();

  // Determinando Conservação
  let conservacao: 'Resfriado' | 'Congelado' | 'Temperatura Ambiente' | 'Outros' = 'Resfriado';
  if (/congelad[oa]|iqf|interfolhad[oa]/i.test(text)) {
    conservacao = 'Congelado';
  } else if (/resfriad[oa]|fresc[oa]/i.test(text)) {
    conservacao = 'Resfriado';
  } else if (/conserva|seco|lata|lote|temperatura ambiente/i.test(text)) {
    conservacao = 'Temperatura Ambiente';
  }

  // Determinando Classe
  let classe = 'Bovinos';

  if (/su[íi]no|pork|lombo|costelinha|bacon|bochecha|copa|pernil|paleta su[íi]na|tender/i.test(text)) {
    classe = 'Suínos';
  } else if (/frango|ave|coxa|sobrecoxa|peito|asa|tutu|peru|chester|nuggets|sassami/i.test(text)) {
    classe = 'Aves';
  } else if (/peixe|pescado|tilap|salm[aã]o|bacalhau|camar[aã]o|merluza|ca[çc][aã]o/i.test(text)) {
    classe = 'Pescados';
  } else if (/margarina|manteiga|gordura|requeij[aã]o/i.test(text)) {
    classe = 'Margarinas & Gorduras';
  } else if (/hamb[úu]rguer|kibe|lingui[çc]a|salsicha|mortadela|presunto|nugget|empessado|kebab|lasanha|pizza|prato pronto|escondidinho/i.test(text)) {
    classe = 'Processados';
  } else if (rawClasse && rawClasse.trim().length > 0) {
    classe = rawClasse.charAt(0).toUpperCase() + rawClasse.slice(1).toLowerCase();
  }

  return { classe, conservacao };
}
