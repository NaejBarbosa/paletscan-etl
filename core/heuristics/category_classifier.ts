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
 * Decodifica entidades HTML como &#038;, &amp;, &#8211; etc.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '-')
    .replace(/&quot;/g, '"');
}

/**
 * Normaliza texto para minúsculo sem acentos para matching seguro com \b.
 */
function normalizeForMatching(str: string): string {
  if (!str) return '';
  return decodeHtmlEntities(decodeUnicodeEscapes(str))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\t\r\n]+/g, ' ')
    .trim();
}

export function classifyProduct(title: string, rawClasse?: string, rawConservacao?: string): ProductClassification {
  const normTitle = normalizeForMatching(title);
  const normRawClasse = normalizeForMatching(rawClasse);
  const normRawConservacao = normalizeForMatching(rawConservacao);
  const text = `${normTitle} ${normRawClasse} ${normRawConservacao}`;

  // 1. Conservação
  let conservacao: 'Resfriado' | 'Congelado' | 'Temperatura Ambiente' | 'Outros' = 'Resfriado';
  if (/congelad[oa]|iqf|interfolhad[oa]|\bice\b/i.test(text)) {
    conservacao = 'Congelado';
  } else if (/resfriad[oa]|fresc[oa]|maturad[oa]/i.test(text)) {
    conservacao = 'Resfriado';
  } else if (/conserva|seco|lata|lote|temperatura ambiente|esterilizad[oa]|desidratad[oa]/i.test(text)) {
    conservacao = 'Temperatura Ambiente';
  } else if (normRawConservacao) {
    if (normRawConservacao.includes('congel')) conservacao = 'Congelado';
    else if (normRawConservacao.includes('resfri')) conservacao = 'Resfriado';
    else if (normRawConservacao.includes('ambien')) conservacao = 'Temperatura Ambiente';
  }

  // 2. Classe Canônica
  let classe = 'Bovinos';

  // 1. Sobremesas & Panificação
  const isSobremesa = /\b(pudim|mousse|torta doce|torta holandesa|torta alema|torta mousse|torta de limao|torta de maracuja|torta de chocolate|miss daisy|bolo|bolinho doce|panetone|chocotone|panettone|chocottone|pao de queijo|petit gateau|churros|waffle|cookie|croissant|brownie|sorvete|gelato|docinho|brigadeiro|beijinho|donuts?)\b/i.test(normTitle);

  // 2. Vegetais & Congelados
  const isVegetalPuro = (
    /\b(seleta( mista| de legumes)?|mix de legumes|mix de vegetais|legumes congelados|vegetais congelados|ervilha|ervilhas|milho verde|milho|batata (palito|rustica|canoa|noisette|pre-frita|congelada|especial)|batatas?|mandioca( supreme)?|aipim|macaxeira|brocolis|couve-flor|couve flor|espinafre|cenoura( em cubos)?|palmito|champignon|cogumelo|jardineira|petit pois|polpa de fruta|acai|polenta( palito)?|aneis de cebola)\b/i.test(normTitle) ||
    (/\bbatatas?\b/i.test(normRawClasse) || /\bvegeta(l|is)\b/i.test(normRawClasse))
  ) && !/\b(frango|bovino|carne|suino|peixe|bacalhau|hamburguer|kibe|nugget|steak|empanado|linguica|salsicha|torta|quiche|lasanha|pizza|escondidinho)\b/i.test(normTitle);

  // 3. Plant-Based & Vegetarianos
  const isPlantBased = (
    /\b(incrivel|plant.?based|plantplus|100%\s*vegetal|vegetariano|vegano|sem carne|carne de soja|proteina de soja|futuro burger|notco|hamburguer vegetal|kibe vegetal|nuggets? vegetal|almondega (a base de) vegetal|linguica (a base de) vegetal|empanado vegetal|veg nuggets|torta de abobrinha|lanche vegetal)\b/i.test(normTitle) ||
    (/\bplant based\b/i.test(normRawClasse) || /\bvegetariano\b/i.test(normRawClasse) || /\bvegano\b/i.test(normRawClasse))
  ) && !isVegetalPuro;

  // 4. Laticínios, Margarinas & Gorduras
  const isLaticinioGordura = (
    /\b(margarina|manteiga|requeijao|queijo prato|queijo mussarela|queijo muçarela|queijo parmesao|queijo provolone|queijo gouda|queijo cheddar|queijo coalho|queijo brie|queijo gorgonzola|ricota|creme de leite|iogurte|nata|doriana|claybom|delicia|qualy|gordura vegetal|gordura de palma|gordura hidrogenada|bebida lactea|leite|chantilly|maionese|pasta de alho)\b/i.test(normTitle) ||
    (/\bqueijo\b/i.test(normTitle) && !/\b(hamburguer|pizza|lasanha|empanado|steak|nuggets?|linguica|salgado|coxinha|pastel|croquete|polpetone|bife|parmegiana|hot pocket|mac'n cheese|massa|penne|nhoque)\b/i.test(normTitle)) ||
    (/\bbanha\b/i.test(normTitle) && !/\bbanha suina\b/i.test(normTitle)) ||
    (/\bmargarina/i.test(normRawClasse) || /\blacteo/i.test(normRawClasse))
  ) && !/\b(pizza|lasanha|linguica|hamburguer|empanado|nugget|hot pocket|mac'n cheese|pao de queijo)\b/i.test(normTitle);

  // 5. Pescados
  const isPescado = /\b(peixe|pescad[oa]|pescadinha|tilapia|salmao|bacalhau|camarao|merluza|merluzao|cacao|atum|sardinha|polvo|lula|polaca( do alasca)?|tainha|surubim|pintado|pacu|dourado|tambaqui|pirarucu|truta|marisco|mexilhao|kani( kama)?|pescada|linguado|anchoita|seafood|porquinho|tucunare|cavalinha|sushis?|sashimi|sardinhas?)\b/i.test(normTitle) ||
    /\bpescad/i.test(normRawClasse) || /\bpeixe/i.test(normRawClasse);

  // 6. Ovinos & Caprinos
  const isOvino = /\b(ovinos?|cordeiros?|carneiros?|caprinos?|cabritos?|espinazo|hasta|mamao|nirea)\b/i.test(normTitle) ||
    /\bovinos?\b/i.test(normRawClasse) || /\bcordeiros?\b/i.test(normRawClasse) || /\bcaprinos?\b/i.test(normRawClasse);

  // 7. Processados & Embutidos
  const isProcessado = (
    /\b(hamburguer|burguer|burger|cheeseburguer|churrasburguer|kibe|quibe|linguica|salsicha|mortadela|presunto|paio|nugget|nuggets?|chicken|fingers|crispy|supreme|tekitos|bolovo|hot dog|empessado|kebab|lasanha|pizza|prato pronto|marmita|escondidinho|almondega|empanado|steak|emp nacho|emp fgo|iscas de frango|croquete|torta salgada|panqueca|quiche|coxinha|pastel|salgadinho|bolinho|esfirra|hot pocket|hot hit|hot bowls|feijoada|caldinho de feijao|caldo verde|arroz carreteiro|arroz broc|apresuntado|massa pronta|nhoque|penne|fettuccine|capeletti|ravioli|canelone|prato congelado|prato|sanduiche|choripan|polpetone|salame|salaminho|copa fatiada|frios|defumad[oa]|fatiad[oa]|yakissoba|yakisoba|mac'n cheese|mac&cheese|mac & cheese|meu menu|milanesa|hdf hamb)\b/i.test(normTitle) ||
    (/\bprocessad/i.test(normRawClasse) || /\bembutid/i.test(normRawClasse) || /\bindustrializ/i.test(normRawClasse) || /\bempanad/i.test(normRawClasse) || /\bfrios\b/i.test(normRawClasse) || /\bmassas\b/i.test(normRawClasse) || /\blanches\b/i.test(normRawClasse))
  ) && !isPlantBased && !isSobremesa;

  // 8. Suínos
  const isSuino = (
    /\b(suin[oa]s?|pork|porco|costela suina|costelinha( suina)?|bacon|pernil|bochecha suina|copa(?!col)|paleta suina|picanha suina|joelho suino|joelho de porco|eisbein|leitao|torresmo|panceta|pancetta|bisteca suina|bisteca|barriga suina|barriga aperitivo|orelha|focinho|rabada suina|rabo salgado|pe salgado|pe suino|mascara e orelha|pescoco suino|jerked suino|alcatra suina|file mignon suino|sobrepaleta suina|sobrepaleta cong sui|retalho cost sui|rtsv retalho cost sui|maminha suina|papada|banha suina|tender(?!izado)|lombo(?!.*(bacalhau|bovin))|lombinho)\b/i.test(normTitle) ||
    (/\bsuin/i.test(normRawClasse) || /\bsu\\u00edn/i.test(normRawClasse))
  ) && !isPescado && !isPlantBased && !isProcessado && !/\blombo bovin/i.test(normTitle);

  // 9. Aves
  const isAve = (
    /\b(frango|franga|galinha|galo|ave|aves|coxa|sobrecoxa|file de peito|meio peito|peito sem pele|peito bandeja|peito( de frango| de peru)|asa|asinha|asa inteira|coxinha da asa|tulipa|drumet|tutu|peru|chester|fiesta|sassami|filezinho( de frango| temperado)?|moela|coracao( de frango)?(?!.*montana)|figado(?!.*montana)|frango a passarinho|galeto|sobrepaleta de frango|frangote|cortes de frango|meio da asa|picanha de frango|peito desfiado de frango|sambiquira)\b/i.test(normTitle) ||
    ((normRawClasse === 'aves' || normRawClasse === 'ave') && !/\b(bovino|suino|peixe|legume|vegetal|batata|seleta|margarina|queijo|bacon|costela|pernil|alcatra|contrafile|mignon|picanha|acem|cupim|patinho|merluza|tilapia|polaca)\b/i.test(normTitle))
  ) && !isPescado && !isPlantBased && !isVegetalPuro && !isProcessado;

  // 10. Bovinos
  const isBovino = (
    /\b(bovin[oa]s?|beef|boi|vaca|alcatra|contrafile|contra\s*-\s*file|contra file|file mignon|mignon|picanha|costela|acem|patinho|coxao mole|coxao duro|maminha|fraldinha|fraldao|cupim|capa de file|musculo|costela bovina|costelao|rabada|rabo( miudos)?|bucho|dobradinha|ossobuco|paleta bovina|paleta|lagarto|cha de fora|cha de dentro|moida bovina|carne moida|carne moida bovina|miolo de alcatra|bife|carpaccio|short rib|tomahawk|t-bone|brisket|peito( bovino|\s*\(brisket\))|entrecote|ribeye|angus|wazyu|wagyu|jerked beef|carne seca|carne-seca|charque|vazio|red montana|bassi|1953|maturatta|friboi|lombo bovino|iscas( perdigao na brasa)?|bananinha|coracao.*montana|figado.*montana|miudos.*montana|carne industrial diafragma|recorte traseiro palatare)\b/i.test(normTitle) ||
    /\bbovin/i.test(normRawClasse)
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
    if (/\bbovin/i.test(normRawClasse)) classe = 'Bovinos';
    else if (/\bsuin/i.test(normRawClasse) || /\bsu\\u00edn/i.test(normRawClasse)) classe = 'Suínos';
    else if (/\bave/i.test(normRawClasse) || /\bfrango/i.test(normRawClasse)) classe = 'Aves';
    else if (/\bpescad/i.test(normRawClasse) || /\bpeixe/i.test(normRawClasse)) classe = 'Pescados';
    else if (/\bvegeta/i.test(normRawClasse) || /\bbatata/i.test(normRawClasse)) classe = 'Vegetais & Congelados';
    else if (/\bmargarina/i.test(normRawClasse) || /\blacteo/i.test(normRawClasse)) classe = 'Laticínios, Margarinas & Gorduras';
    else if (/\bprocessad/i.test(normRawClasse) || /\bindustrializ/i.test(normRawClasse) || /\bembutid/i.test(normRawClasse) || /\bempanad/i.test(normRawClasse)) classe = 'Processados & Embutidos';
    else if (/\bovino\b/i.test(normRawClasse) || /\bcordeiro/i.test(normRawClasse)) classe = 'Ovinos & Caprinos';
    else classe = 'Outros';
  }

  return { classe, conservacao };
}
