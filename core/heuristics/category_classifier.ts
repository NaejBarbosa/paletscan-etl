/**
 * Heurística de Classificação de Categorias e Conservação - PaletScan ETL
 * Taxonomia Canônica Oficial e Resolução de Sobreposições Semânticas
 */

export interface ProductClassification {
  classe: string;
  conservacao: 'Resfriado' | 'Congelado' | 'Temperatura Ambiente' | 'Outros';
}

/**
 * Decodifica sequências Unicode escapadas como \u00ed para 'í'.
 */
export function decodeUnicodeEscapes(str: string): string {
  if (!str) return '';
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Classifica a classe canônica do produto e o estado de conservação
 */
export function classifyProduct(title: string, rawClasse?: string, rawConservacao?: string): ProductClassification {
  const cleanTitle = decodeUnicodeEscapes(title || '').trim();
  const cleanRawClasse = decodeUnicodeEscapes(rawClasse || '').trim();
  const cleanRawConservacao = decodeUnicodeEscapes(rawConservacao || '').trim();

  const titleLower = cleanTitle.toLowerCase();
  const rawClasseLower = cleanRawClasse.toLowerCase();
  const text = `${titleLower} ${rawClasseLower} ${cleanRawConservacao.toLowerCase()}`;

  // 1. Determinando Conservação
  let conservacao: 'Resfriado' | 'Congelado' | 'Temperatura Ambiente' | 'Outros' = 'Resfriado';
  if (/congelad[oa]|iqf|interfolhad[oa]|\bice\b/i.test(text)) {
    conservacao = 'Congelado';
  } else if (/resfriad[oa]|fresc[oa]|maturad[oa]/i.test(text)) {
    conservacao = 'Resfriado';
  } else if (/conserva|seco|lata|lote|temperatura ambiente|esterilizad[oa]|desidratad[oa]/i.test(text)) {
    conservacao = 'Temperatura Ambiente';
  } else if (cleanRawConservacao) {
    const rc = cleanRawConservacao.toLowerCase();
    if (rc.includes('congel')) conservacao = 'Congelado';
    else if (rc.includes('resfri')) conservacao = 'Resfriado';
    else if (rc.includes('ambien')) conservacao = 'Temperatura Ambiente';
  }

  // 2. Determinando Classe Padronizada Canônica
  let classe = 'Bovinos';

  // REGEX COM PRIORIDADE SEMÂNTICA RIGOROSA

  // 1. Sobremesas & Panificação
  const isSobremesa = /\b(pudim|mousse|torta doce|torta holandesa|torta alem[aã]|torta mousse|torta de lim[aã]o|torta de maracuj[aá]|torta de chocolate|miss daisy|bolo|bolinho doce|panetone|chocotone|panettone|chocottone|p[aã]o de queijo|petit gateau|churros|waffle|cookie|croissant|brownie|sorvete|gelato|docinho|brigadeiro|beijinho|donuts?)\b/i.test(titleLower);

  // 2. Vegetais & Congelados (vegetais puros, batatas, legumes, polpas, polenta, anéis de cebola)
  const isVegetalPuro = (
    /\b(seleta( mista| de legumes)?|mix de legumes|mix de vegetais|legumes congelados|vegetais congelados|ervilha|ervilhas|milho verde|milho|batata (palito|r[uú]stica|canoa|noisette|pr[eé]-frita|congelada|especial)|batatas?|mandioca( supreme)?|aipim|macaxeira|br[oó]colis|couve-flor|couve flor|espinafre|cenoura( em cubos)?|palmito|champignon|cogumelo|jardineira|petit pois|polpa de fruta|a[çc]a[íi]|polenta( palito)?|an[eé]is de cebola)\b/i.test(titleLower) ||
    (/\bbatatas?\b/i.test(rawClasseLower) || /\bvegeta(l|is)\b/i.test(rawClasseLower))
  ) && !/\b(frango|bovino|carne|su[íi]no|peixe|bacalhau|hamb[uú]rguer|kibe|nugget|steak|empanado|lingui[çc]a|salsicha|torta|quiche|lasanha|pizza|escondidinho)\b/i.test(titleLower);

  // 3. Plant-Based & Vegetarianos (análogos de carne 100% vegetal / sem carne)
  const isPlantBased = (
    /\b(incr[ií]vel|plant.?based|plantplus|100%\s*vegetal|vegetariano|vegano|sem carne|carne de soja|prote[ií]na de soja|futuro burger|notco|hamb[uú]rguer vegetal|kibe vegetal|nuggets? vegetal|alm[oô]ndega (à base de|a base de) vegetal|lingui[çc]a (à base de|a base de) vegetal|empanado vegetal|veg nuggets|torta de abobrinha|lanche vegetal)\b/i.test(titleLower) ||
    (/\bplant based\b/i.test(rawClasseLower) || /\bvegetariano\b/i.test(rawClasseLower) || /\bvegano\b/i.test(rawClasseLower))
  ) && !isVegetalPuro;

  // 4. Laticínios, Margarinas & Gorduras
  const isLaticinioGordura = (
    /\b(margarina|manteiga|requeij[aã]o|queijo prato|queijo mussarela|queijo mu[çs]arela|queijo parmes[aã]o|queijo provolone|queijo gouda|queijo cheddar|queijo coalho|queijo brie|queijo gorgonzola|ricota|creme de leite|iogurte|nata|doriana|claybom|del[ií]cia|qualy|gordura vegetal|gordura de palma|gordura hidrogenada|bebida l[aá]ctea|leite|chantilly|maionese)\b/i.test(titleLower) ||
    (/\bqueijo\b/i.test(titleLower) && !/\b(hamb[uú]rguer|pizza|lasanha|empanado|steak|nuggets?|lingui[çc]a|salgado|coxinha|pastel|croquete|polpetone|bife|parmegiana|hot pocket|mac'n cheese|massa|penne|nhoque)\b/i.test(titleLower)) ||
    (/\bbanha\b/i.test(titleLower) && !/\bbanha su[íi]na\b/i.test(titleLower)) ||
    (/\bmargarina/i.test(rawClasseLower) || /\bl[aá]cteo/i.test(rawClasseLower))
  ) && !/\b(pizza|lasanha|lingui[çc]a|hamb[uú]rguer|empanado|nugget|hot pocket|mac'n cheese|p[aã]o de queijo)\b/i.test(titleLower);

  // 5. Pescados
  const isPescado = /\b(peixe|pescad[oa]|pescadinha|til[aá]pia|salm[aã]o|bacalhau|camar[aã]o|merluza|merluz[aã]o|ca[çc][aã]o|atum|sardinha|polvo|lula|polaca( do alasca)?|tainha|surubim|pintado|pacu|dourado|tambaqui|pirarucu|truta|marisco|mexilh[aã]o|kani( kama)?|pescada|linguado|anchoita|seafood|porquinho|tucunar[eé]|cavalinha|sushis?|sashimi|sardinhas?)\b/i.test(titleLower) ||
    /\bpescad/i.test(rawClasseLower) || /\bpeixe/i.test(rawClasseLower);

  // 6. Ovinos & Caprinos (com fronteiras de palavra \b)
  const isOvino = /\b(ovinos?|cordeiros?|carneiros?|caprinos?|cabritos?|espinazo|hasta|mam[aã]o|nirea)\b/i.test(titleLower) ||
    /\bovinos?\b/i.test(rawClasseLower) || /\bcordeiros?\b/i.test(rawClasseLower) || /\bcaprinos?\b/i.test(rawClasseLower);

  // 7. Processados & Embutidos (Pizzas, Lasanhas, Pratos Prontos, Hambúrgueres, Linguiças, Salsichas, Mortadelas, Presuntos, etc.)
  const isProcessado = (
    /\b(hamb[uú]rguer|burguer|burger|kibe|quibe|lingui[çc]a|salsicha|mortadela|presunto|nugget|nuggets?|chicken|fingers|crispy|empessado|kebab|lasanha|pizza|prato pronto|escondidinho|alm[oô]ndega|empanado|steak|emp nacho|emp fgo|iscas de frango|croquete|torta salgada|panqueca|quiche|coxinha|pastel|salgadinho|bolinho|esfirra|hot pocket|hot bowls|feijoada|apresuntado|massa pronta|nhoque|penne|fettuccine|capeletti|ravioli|canelone|prato congelado|prato|sandu[íi]che|chorip[aá]n|polpetone|tekitos|salame|salaminho|copa fatiada|frios|defumad[oa]|fatiad[oa]|yakissoba|mac'n cheese|meu menu)\b/i.test(titleLower) ||
    (/\bprocessad/i.test(rawClasseLower) || /\bembutid/i.test(rawClasseLower) || /\bindustrializ/i.test(rawClasseLower) || /\bempanad/i.test(rawClasseLower) || /\bfrios\b/i.test(rawClasseLower) || /\bmassas\b/i.test(rawClasseLower) || /\blanches\b/i.test(rawClasseLower))
  ) && !isPlantBased && !isSobremesa;

  // 8. Suínos (Cortes in natura / temperados suínos)
  const isSuino = (
    /\b(su[íi]n[oa]s?|pork|porco|costela su[íi]na|costelinha( su[íi]na)?|bacon|pernil|bochecha su[íi]na|copa|paleta su[íi]na|picanha su[íi]na|joelho su[íi]no|joelho de porco|eisbein|leit[aã]o|torresmo|panceta|pancetta|bisteca su[íi]na|bisteca|barriga su[íi]na|barriga aperitivo|orelha su[íi]na|focinho|rabada su[íi]na|p[eé] su[íi]no|pesco[çc]o su[íi]no|jerked su[íi]no|alcatra su[íi]na|fil[eé] mignon su[íi]no|sobrepaleta su[íi]na|sobrepaleta cong sui|retalho cost sui|rtsv retalho cost sui|maminha su[íi]na|papada|banha su[íi]na|tender(?!izado)|lombo(?!.*(bacalhau|bovin))|lombinho)\b/i.test(titleLower) ||
    (/\bsuin/i.test(rawClasseLower) || /\bsuín/i.test(rawClasseLower) || /\bsu\\u00edn/i.test(rawClasseLower))
  ) && !isPescado && !isPlantBased && !isProcessado && !/\blombo bovin/i.test(titleLower);

  // 9. Aves (Cortes in natura / temperados de frango, peru, etc.)
  const isAve = (
    /\b(frango|franga|galinha|galo|ave|aves|coxa de frango|sobrecoxa|peito de frango|peito de peru|asa de frango|asinha|coxinha da asa|tulipa|drumet|tutu|peru|chester|sassami|filezinho( de frango| temperado)?|moela|cora[çc][aã]o de frango|cora[çc][aã]o(?!.*montana)|f[ií]gado(?!.*montana)|frango a passarinho|galeto|sobrepaleta de frango|frangote|cortes de frango|meio da asa|picanha de frango|peito desfiado de frango|sambiquira)\b/i.test(titleLower) ||
    ((rawClasseLower === 'aves' || rawClasseLower === 'ave') && !/\b(bovino|su[íi]no|peixe|legume|vegetal|batata|seleta|margarina|queijo|bacon|costela|pernil|alcatra|contrafil[eé]|mignon|picanha|ac[eé]m|cupim|patinho|merluza|til[aá]pia|polaca)\b/i.test(titleLower))
  ) && !isPescado && !isPlantBased && !isVegetalPuro && !isProcessado;

  // 10. Bovinos (Cortes in natura / temperados bovinos, jerked beef)
  const isBovino = (
    /\b(bovin[oa]s?|beef|boi|vaca|alcatra|contrafil[eé]|contra fil[eé]|fil[eé] mignon|mignon|picanha|costela|ac[eé]m|patinho|cox[aã]o mole|cox[aã]o duro|maminha|fraldinha|frald[aã]o|cupim|capa de fil[eé]|m[uú]sculo|costela bovina|costel[aã]o|rabada|rabo mi[uú]dos|bucho|dobradinha|ossobuco|paleta bovina|paleta|lagarto|ch[aã] de fora|ch[aã] de dentro|mo[íi]da bovina|carne mo[íi]da|carne mo[íi]da bovina|miolo de alcatra|bife|carpaccio|short rib|tomahawk|t-bone|brisket|peito( bovino|\s*\(brisket\))|entrec[oô]te|ribeye|angus|wazyu|wagyu|jerked beef|carne seca|carne-seca|charque|vazio|red montana|bassi|1953|maturatta|friboi|lombo bovino|iscas( perdigão na brasa)?|bananinha|cora[çc][aã]o mi[uú]dos montana|f[ií]gado mi[uú]dos montana|carne industrial diafragma|recorte traseiro palatare)\b/i.test(titleLower) ||
    /\bbovin/i.test(rawClasseLower)
  ) && !isSuino && !isAve && !isPescado && !isPlantBased && !isProcessado && !isOvino;

  // Atribuição hierárquica por prioridade
  if (isSobremesa) {
    classe = 'Sobremesas & Panificação';
  } else if (isVegetalPuro) {
    classe = 'Vegetais & Congelados';
  } else if (isPlantBased) {
    classe = 'Plant-Based & Vegetarianos';
  } else if (isLaticinioGordura) {
    classe = 'Laticínios, Margarinas & Gorduras';
  } else if (isPescado) {
    classe = 'Pescados';
  } else if (isOvino) {
    classe = 'Ovinos & Caprinos';
  } else if (isProcessado) {
    classe = 'Processados & Embutidos';
  } else if (isSuino) {
    classe = 'Suínos';
  } else if (isAve) {
    classe = 'Aves';
  } else if (isBovino) {
    classe = 'Bovinos';
  } else {
    // Fallback inteligente caso rawClasse traga informação útil
    if (/\bbovin/i.test(rawClasseLower)) classe = 'Bovinos';
    else if (/\bsuin/i.test(rawClasseLower) || /\bsuín/i.test(rawClasseLower) || /\bsu\\u00edn/i.test(rawClasseLower)) classe = 'Suínos';
    else if (/\bave/i.test(rawClasseLower) || /\bfrango/i.test(rawClasseLower)) classe = 'Aves';
    else if (/\bpescad/i.test(rawClasseLower) || /\bpeixe/i.test(rawClasseLower)) classe = 'Pescados';
    else if (/\bvegeta/i.test(rawClasseLower) || /\bbatata/i.test(rawClasseLower)) classe = 'Vegetais & Congelados';
    else if (/\bmargarina/i.test(rawClasseLower) || /\bl[aá]cteo/i.test(rawClasseLower)) classe = 'Laticínios, Margarinas & Gorduras';
    else if (/\bprocessad/i.test(rawClasseLower) || /\bindustrializ/i.test(rawClasseLower) || /\bembutid/i.test(rawClasseLower) || /\bempanad/i.test(rawClasseLower)) classe = 'Processados & Embutidos';
    else if (/\bovino\b/i.test(rawClasseLower) || /\bcordeiro/i.test(rawClasseLower)) classe = 'Ovinos & Caprinos';
    else classe = 'Outros';
  }

  return { classe, conservacao };
}

