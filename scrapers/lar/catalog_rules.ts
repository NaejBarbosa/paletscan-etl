/**
 * Catálogo Oficial Auditado de Especificações de Produtos - Lar Cooperativa Agroindustrial
 * 
 * Fonte da Verdade: Catálogo Web Oficial Lar (lar.ind.br) e embalagens de chão de fábrica.
 * Este mapeamento garante que produtos industrializados com pesos fixos padronizados
 * não sejam degradados para "fracionado/pesar" ou fiquem sem valor de pesagem na descrição.
 */

export interface LarProductSpec {
  descr: string;
  peso_gramas: number | null;
  fracionado: boolean;
  marca?: string;
}

export const LAR_OFFICIAL_CATALOG: Record<string, LarProductSpec> = {
  // --- Cortes Lar IQF 1kg / 2kg ---
  '7896419732556': { descr: 'Filé de Coxa e Sobrecoxa IQF 1kg', peso_gramas: 1000, fracionado: false },
  '7896419732501': { descr: 'Coxinha da Asa IQF 1kg', peso_gramas: 1000, fracionado: false },
  '7896419732518': { descr: 'Filé de Peito IQF 1kg', peso_gramas: 1000, fracionado: false },
  '7896419732525': { descr: 'Filezinho Sassami IQF 1kg', peso_gramas: 1000, fracionado: false },

  // --- Miúdos e Frango Desfiado Lar ---
  '7896419729211': { descr: 'Fígado 700g', peso_gramas: 700, fracionado: false },
  '7896419731177': { descr: 'Frango Desfiado 1kg', peso_gramas: 1000, fracionado: false },
  '7896419731160': { descr: 'Frango Desfiado 400g', peso_gramas: 400, fracionado: false },
  '7896419729204': { descr: 'Moela 700g', peso_gramas: 700, fracionado: false },
  '7896419729198': { descr: 'Coração 700g', peso_gramas: 700, fracionado: false },
  '7896419729181': { descr: 'Coração Temperado 700g', peso_gramas: 700, fracionado: false },
  '7896419728863': { descr: 'Filé de Peito Moído 375g', peso_gramas: 375, fracionado: false },

  // --- Cortes Temperados e Almofada Lar ---
  '7896419728931': { descr: 'Frango a Passarinho Temperado 700g', peso_gramas: 700, fracionado: false },
  '7896419728955': { descr: 'Coxinhas das Asas Temperadas 700g', peso_gramas: 700, fracionado: false },
  '7896419728948': { descr: 'Meio das Asas Temperadas 700g', peso_gramas: 700, fracionado: false },
  '7896419724087': { descr: 'Coxa de Frango Pacote 1kg', peso_gramas: 1000, fracionado: false },
  '7896419715016': { descr: 'Sassami de Frango Pacote 1kg', peso_gramas: 1000, fracionado: false },
  '7896419729235': { descr: 'Meio da Asa Pacote 1kg', peso_gramas: 1000, fracionado: false },
  '7896419733164': { descr: 'Meio Peito sem Osso e sem Pele Pacote 1kg', peso_gramas: 1000, fracionado: false },

  // --- Linguiças Lar ---
  '7896419727439': { descr: 'Linguiça de Frango Petisco 700g', peso_gramas: 700, fracionado: false },
  '7896419728108': { descr: 'Linguiça de Frango Fininha 700g', peso_gramas: 700, fracionado: false },
  '7896419728115': { descr: 'Linguiça de Frango Grossa 700g', peso_gramas: 700, fracionado: false },
  '7896419728092': { descr: 'Linguiça de Frango Fininha 700g', peso_gramas: 700, fracionado: false },
  '7896419722656': { descr: 'Linguiça de Frango Fininha 1kg', peso_gramas: 1000, fracionado: false },
  '7896419722663': { descr: 'Linguiça de Frango Grossa 1kg', peso_gramas: 1000, fracionado: false },
  '7896419722274': { descr: 'Linguiça de Frango Grossa 5kg', peso_gramas: 5000, fracionado: false },

  // --- Aves Inteiras e Especiais Lar ---
  '7896419730842': { descr: 'Ave Natalina Temperada Congelada ±3,7kg', peso_gramas: 3700, fracionado: false },
  '7896419730224': { descr: 'Frango Inteiro Temperado ±2,6kg', peso_gramas: 2600, fracionado: false },

  // --- Linha Envelopados Lar (Congelados Industriais - Não Fracionados / Não Pesáveis Manualmente) ---
  '7896419720386': { descr: 'Filé de Peito Envelopado', peso_gramas: null, fracionado: false },
  '7896419720966': { descr: 'Filé de Peito Envelopado', peso_gramas: null, fracionado: false },
  '7896419720447': { descr: 'Filezinho Sassami Envelopado', peso_gramas: null, fracionado: false },
  '7896419720393': { descr: 'Peito com Osso Envelopado', peso_gramas: null, fracionado: false },
  '7896419720980': { descr: 'Peito com Osso Envelopado', peso_gramas: null, fracionado: false },
  '7896419720959': { descr: 'Coxas e Sobrecoxas Envelopadas', peso_gramas: null, fracionado: false },
  '7896419719977': { descr: 'Coxas e Sobrecoxas Envelopadas', peso_gramas: null, fracionado: false },
  '7896419721116': { descr: 'Coxas e Sobrecoxas com Porção Dorsal Envelopadas', peso_gramas: null, fracionado: false },
  '7896419723233': { descr: 'Coxas e Sobrecoxas sem Osso sem Pele Envelopadas', peso_gramas: null, fracionado: false },
  '7896419723400': { descr: 'Coxas e Sobrecoxas sem Osso Envelopadas', peso_gramas: null, fracionado: false },
  '7896419720676': { descr: 'Sobrecoxas Envelopadas', peso_gramas: null, fracionado: false },
  '7896419723424': { descr: 'Sobrecoxas Envelopadas', peso_gramas: null, fracionado: false },
  '7896419720799': { descr: 'Coxinhas das Asas Envelopadas', peso_gramas: null, fracionado: false },
  '7896419720973': { descr: 'Coxinhas das Asas Envelopadas', peso_gramas: null, fracionado: false },
  '7896419721475': { descr: 'Asas Envelopadas', peso_gramas: null, fracionado: false },
  '7896419721536': { descr: 'Filé de Coxas Sobrecoxas Envelopadas', peso_gramas: null, fracionado: false },
  '7896419720997': { descr: 'Sambiquira Envelopada', peso_gramas: null, fracionado: false },

  // --- Vegetais Congelados Lar ---
  '7896419720287': { descr: 'Anéis de Cebola 400g', peso_gramas: 400, fracionado: false },
  '7896419720270': { descr: 'Anéis de Cebola 1,1kg', peso_gramas: 1100, fracionado: false },
  '7896419724582': { descr: 'Ervilha 1,1kg', peso_gramas: 1100, fracionado: false },
  '7896419724599': { descr: 'Ervilha 300g', peso_gramas: 300, fracionado: false },
  '7896419720003': { descr: 'Couve-Flor 1,1kg', peso_gramas: 1100, fracionado: false },
  '7896419724612': { descr: 'Brócolis 300g', peso_gramas: 300, fracionado: false },
  '7896419720010': { descr: 'Brócolis 1,1kg', peso_gramas: 1100, fracionado: false },
  '7896419724537': { descr: 'Mix de Vegetais 300g', peso_gramas: 300, fracionado: false },
  '7896419724490': { descr: 'Seleta de Legumes 300g', peso_gramas: 300, fracionado: false },
  '7896419724483': { descr: 'Seleta de Legumes 1,1kg', peso_gramas: 1100, fracionado: false },
  '7896419730705': { descr: 'Batata Palito 1,5kg', peso_gramas: 1500, fracionado: false },
  '7896419730729': { descr: 'Batata Airfryer 1,005kg', peso_gramas: 1005, fracionado: false },
  '7896419730347': { descr: 'Batata Palito 700g', peso_gramas: 700, fracionado: false },
  '7896419712770': { descr: 'Polenta Palito 400g', peso_gramas: 400, fracionado: false },
  '7896419724384': { descr: 'Polenta Palito 1,1kg', peso_gramas: 1100, fracionado: false },

  // --- Empanados Lar ---
  '7896419713852': { descr: 'Steak Empanado 100g', peso_gramas: 100, fracionado: false },
  '7896419723479': { descr: 'Steak Empanado 100g', peso_gramas: 100, fracionado: false },
  '7896419725336': { descr: 'Empanitos Empanado 700g', peso_gramas: 700, fracionado: false },
  '7896419714071': { descr: 'Empanitos Empanado 1,5kg', peso_gramas: 1500, fracionado: false },
  '7896419714064': { descr: 'Tirinhas Empanadas 1,5kg', peso_gramas: 1500, fracionado: false },
  '7896419725343': { descr: 'Tirinhas Empanadas 700g', peso_gramas: 700, fracionado: false },
  '7896419715566': { descr: 'Filezinho Sassami Empanado 1,5kg', peso_gramas: 1500, fracionado: false },
  '7896419716129': { descr: 'Filezinho Sassami Empanado 700g', peso_gramas: 700, fracionado: false },
  '7896419725329': { descr: 'Filé de Coxa e Sobrecoxa Empanado 700g', peso_gramas: 700, fracionado: false },
  '7896419717560': { descr: 'Filé de Coxa e Sobrecoxa Empanado 1,5kg', peso_gramas: 1500, fracionado: false },
  '7896419725480': { descr: 'Filé de Peito à Milanesa 700g', peso_gramas: 700, fracionado: false },
  '7896419725459': { descr: 'Iscas de Filé de Peito Empanadas 700g', peso_gramas: 700, fracionado: false },
  '7896419729143': { descr: 'Hambúrguer Empanado de Frango 100g', peso_gramas: 100, fracionado: false },
  '7896419730156': { descr: 'Mini Hambúrguer Empanado de Frango 300g', peso_gramas: 300, fracionado: false },

  // --- Cortes IQF 1kg Lar ---
  '7896419713784': { descr: 'Coxinha da Asa IQF 1kg', peso_gramas: 1000, fracionado: false },
  '7896419716280': { descr: 'Filé de Peito IQF 1kg', peso_gramas: 1000, fracionado: false },
  '7896419715092': { descr: 'Meio da Asa IQF 1kg', peso_gramas: 1000, fracionado: false },
  '7896419716273': { descr: 'Filé de Coxa e Sobrecoxa IQF 1kg', peso_gramas: 1000, fracionado: false },
  '7896419715047': { descr: 'Sobrecoxa IQF 1kg', peso_gramas: 1000, fracionado: false },
  '7896419714224': { descr: 'Coxa IQF 1kg', peso_gramas: 1000, fracionado: false },
  '7896419714231': { descr: 'Filezinho Sassami IQF 1kg', peso_gramas: 1000, fracionado: false },
  '7896419701637': { descr: 'Frango a Passarinho IQF 1kg', peso_gramas: 1000, fracionado: false },

  // --- Cortes IQF 700g Lar ---
  '7896419727774': { descr: 'Coxinhas das Asas IQF 700g', peso_gramas: 700, fracionado: false },
  '7896419727798': { descr: 'Filezinho Sassami IQF 700g', peso_gramas: 700, fracionado: false },
  '7896419727804': { descr: 'Filé de Peito IQF 700g', peso_gramas: 700, fracionado: false },
  '7896419727811': { descr: 'Coxas IQF 700g', peso_gramas: 700, fracionado: false },
  '7896419727828': { descr: 'Sobrecoxas IQF 700g', peso_gramas: 700, fracionado: false },
  '7896419727835': { descr: 'Frango a Passarinho IQF 700g', peso_gramas: 700, fracionado: false },
  '7896419727859': { descr: 'Filé de Coxa e Sobrecoxa IQF 700g', peso_gramas: 700, fracionado: false },
  '7896419730194': { descr: 'Coxinha da Asa Temperadas IQF 700g', peso_gramas: 700, fracionado: false },
  '7896419730200': { descr: 'Frango a Passarinho Temperado IQF 700g', peso_gramas: 700, fracionado: false },
  '7896419730187': { descr: 'Meio da Asa Temperado IQF 700g', peso_gramas: 700, fracionado: false },
  '7896419730217': { descr: 'Filezinho Sassami Temperado IQF 700g', peso_gramas: 700, fracionado: false },
  '7896419730767': { descr: 'Sobrecoxa Temperada IQF 700g', peso_gramas: 700, fracionado: false },
  '7896419730774': { descr: 'Filé de Coxa e Sobrecoxa Temperado IQF 700g', peso_gramas: 700, fracionado: false },

  // --- Bandejas Resfriadas Lar ---
  '7896419728047': { descr: 'Coxinha da Asa Bandeja 600g', peso_gramas: 600, fracionado: false },
  '7896419728030': { descr: 'Moela Bandeja 600g', peso_gramas: 600, fracionado: false },
  '7896419727996': { descr: 'Meio da Asa Bandeja 600g', peso_gramas: 600, fracionado: false },
  '7896419728023': { descr: 'Filé de Peito Bandeja 600g', peso_gramas: 600, fracionado: false },
  '7896419728887': { descr: 'Coração Bandeja 1kg', peso_gramas: 1000, fracionado: false },
  '7896419728085': { descr: 'Filezinho Sassami Bandeja 600g', peso_gramas: 600, fracionado: false },
  '7896419728009': { descr: 'Sobrecoxa Bandeja 600g', peso_gramas: 600, fracionado: false },
  '7896419728900': { descr: 'Coxas e Sobrecoxas Bandeja 1kg', peso_gramas: 1000, fracionado: false },
  '7896419727279': { descr: 'Moela Bandeja 600g', peso_gramas: 600, fracionado: false },
  '7896419727286': { descr: 'Coração Bandeja 600g', peso_gramas: 600, fracionado: false },
  '7896419727309': { descr: 'Coxinha da Asa Bandeja 600g', peso_gramas: 600, fracionado: false },
  '7896419727316': { descr: 'Filé de Peito Bandeja 600g', peso_gramas: 600, fracionado: false },
  '7896419727323': { descr: 'Filezinho Sassami Bandeja 600g', peso_gramas: 600, fracionado: false },
  '7896419728078': { descr: 'Coração Bandeja 600g', peso_gramas: 600, fracionado: false },
  '7896419728870': { descr: 'Filé de Peito Bandeja 1kg', peso_gramas: 1000, fracionado: false },
  '7896419728894': { descr: 'Coxinha da Asa Bandeja 1kg', peso_gramas: 1000, fracionado: false },
  '7896419728917': { descr: 'Filezinho Sassami Bandeja 1kg', peso_gramas: 1000, fracionado: false },

  // --- Linha Minuto Lar ---
  '7896419728849': { descr: 'Coxinha da Asa Assada Linha Minuto 300g', peso_gramas: 300, fracionado: false },
  '7896419728825': { descr: 'Filezinho Sassami Assado Linha Minuto 300g', peso_gramas: 300, fracionado: false },
  '7896419728818': { descr: 'Meio da Asa Assada Linha Minuto 300g', peso_gramas: 300, fracionado: false },
  '7896419728757': { descr: 'Meio Peito Cozido em Cubos Linha Minuto 300g', peso_gramas: 300, fracionado: false },
  '7896419728740': { descr: 'Meio Peito Cozido em Tiras Linha Minuto 300g', peso_gramas: 300, fracionado: false },

  // --- Peixes Lar ---
  '7896419731900': { descr: 'Filé de Tilápia 600g', peso_gramas: 600, fracionado: false },
  '7896419731917': { descr: 'Filé de Tilápia 600g', peso_gramas: 600, fracionado: false },
  '7896419731801': { descr: 'Filé de Tilápia 800g', peso_gramas: 800, fracionado: false }
};

/**
 * Consulta a especificação oficial de um produto Lar pelo EAN ou SKU.
 */
export function getLarOfficialSpec(ean?: string | null, sku?: string | null): LarProductSpec | null {
  if (ean && LAR_OFFICIAL_CATALOG[ean]) {
    return LAR_OFFICIAL_CATALOG[ean];
  }
  if (sku && LAR_OFFICIAL_CATALOG[sku]) {
    return LAR_OFFICIAL_CATALOG[sku];
  }
  return null;
}
