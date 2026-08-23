/**
 * Heurística de Classificação de Categorias e Conservação - PaletScan ETL
 * Taxonomia Canônica Oficial e Resolução de Sobreposições Semânticas
 */

export interface ProductClassification {
  classe: string;
  conservacao: 'Resfriado' | 'Congelado' | 'Temperatura Ambiente';
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
function normalizeForMatching(str?: string | null): string {
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
  let conservacao: 'Resfriado' | 'Congelado' | 'Temperatura Ambiente' = 'Resfriado';
  if (/congelad[oa]|iqf|interfolhad[oa]|\bice\b/i.test(text)) {
    conservacao = 'Congelado';
  } else if (/resfriad[oa]|fresc[oa]|maturad[oa]/i.test(text)) {
    conservacao = 'Resfriado';
  } else if (/conserva|seco|lata|lote|temperatura ambiente|esterilizad[oa]|desidratad[oa]|cesta/i.test(text)) {
    conservacao = 'Temperatura Ambiente';
  } else if (normRawConservacao) {
    if (normRawConservacao.includes('congel')) conservacao = 'Congelado';
    else if (normRawConservacao.includes('resfri')) conservacao = 'Resfriado';
    else if (normRawConservacao.includes('ambien')) conservacao = 'Temperatura Ambiente';
  }

  // 2. Classe Canônica Oficial (10 Classes - 0% Outros)
  let classe = 'Processados & Embutidos';

  // 1. Sobremesas & Panificação
  const isSobremesa = /\b(pudim|mousse|torta doce|torta holandesa|torta alema|torta mousse|torta de limao|torta de maracuja|torta de chocolate|miss daisy|bolo|bolinho doce|panetone|chocotone|panettone|chocottone|pao de queijo|petit gateau|churros|waffle|cookie|croissant|brownie|sorvete|gelato|docinho|brigadeiro|beijinho|donuts?)\b/i.test(normTitle);

  // 2. Vegetais & Congelados
  const isVegetalPuro = (
    /\b(seleta( mista| de legumes)?|mix de legumes|mix de vegetais|legumes congelados|vegetais congelados|ervilha|ervilhas|milho verde|milho|batata (palito|rustica|canoa|noisette|pre-frita|congelada|especial)|batatas?|mandioca( supreme)?|aipim|macaxeira|brocolis|couve-flor|couve flor|espinafre|cenoura( em cubos)?|palmito|champignon|cogumelo|jardineira|petit pois|polpa de fruta|acai|polenta( palito)?|aneis de cebola|vagem|alho picado|cebola (picada|cubo)|morango|mirtilo|amora|framboesa|frutas vermelhas)\b/i.test(normTitle) ||
    ((/\bbatatas?\b/i.test(normRawClasse) || /\bvegeta(l|is)\b/i.test(normRawClasse)) && !/\b(frango|bovino|carne|suino|peixe|bacalhau)\b/i.test(normTitle))
  ) && !/\b(frango|bovino|carne|suino|peixe|bacalhau|hamburguer|kibe|nugget|steak|empanado|linguica|salsicha|torta|quiche|lasanha|pizza|escondidinho)\b/i.test(normTitle);

  // 3. Plant-Based & Vegetarianos
  const isPlantBased = (
    /\b(incrivel|plant.?based|plantplus|100%\s*vegetal|vegetariano|vegano|sem carne|carne de soja|proteina de soja|futuro burger|notco|hamburguer vegetal|kibe vegetal|nuggets? vegetal|almondega (a base de )?vegetal|linguica (a base de )?vegetal|empanado vegetal|veg nuggets|torta de abobrinha|lanche vegetal)\b/i.test(normTitle) ||
    (/\bplant based\b/i.test(normRawClasse) || /\bvegetariano\b/i.test(normRawClasse) || /\bvegano\b/i.test(normRawClasse))
  ) && !isVegetalPuro;

  // 4. Laticínios, Margarinas & Gorduras
  const isLaticinioGordura = (
    /\b(margarina|manteiga|requeijao|queijo prato|queijo mussarela|queijo muçarela|queijo parmesao|queijo provolone|queijo gouda|queijo cheddar|queijo coalho|queijo brie|queijo gorgonzola|ricota|creme de leite|iogurte|nata|doriana|claybom|delicia|qualy|gordura vegetal|gordura de palma|gordura hidrogenada|oleo de algodao|bebida lactea|leite|chantilly|maionese|pasta de alho)\b/i.test(normTitle) ||
    (/\bqueijo\b/i.test(normTitle) && !/\b(hamburguer|pizza|lasanha|empanado|steak|nuggets?|linguica|salgado|coxinha|pastel|croquete|polpetone|bife|parmegiana|hot pocket|mac'n cheese|massa|penne|nhoque|rechead|frango|peru|chester)\b/i.test(normTitle)) ||
    (/\bbanha\b/i.test(normTitle) && !/\bbanha suina\b/i.test(normTitle)) ||
    ((/\bmargarina/i.test(normRawClasse) || /\blacteo/i.test(normRawClasse)) && !/\b(frango|peru|bovino|suino)\b/i.test(normTitle))
  ) && !/\b(pizza|lasanha|linguica|hamburguer|empanado|nugget|hot pocket|mac'n cheese|pao de queijo|peru|frango)\b/i.test(normTitle);

  // 5. Pescados
  const isPescado = /\b(peixe|pescad[oa]s?|pescadinha|tilapia|salmao|bacalhau|camarao|merluza|merluzao|cacao|atum|sardinhas?|polvo|lula|polaca( do alasca)?|tainha|surubim|pintado|pacu|dourado|tambaqui|pirarucu|truta|marisco|mexilhao|kani( kama)?|pescada|linguado|anchoita|seafood|porquinho|tucunare|cavalinha|sushis?|sashimi|panga|corvina|saithe|traira|palombeta)\b/i.test(normTitle) ||
    ((/\bpescad/i.test(normRawClasse) || /\bpeixe/i.test(normRawClasse)) && !/\b(frango|bovino|suino)\b/i.test(normTitle));

  // 6. Ovinos & Caprinos
  const isOvino = /\b(ovin[oa]s?|cordeir[oa]s?|carneir[oa]s?|caprin[oa]s?|cabrit[oa]s?|espinazo|hasta|mamao|nirea)\b/i.test(normTitle) ||
    ((/\bovinos?\b/i.test(normRawClasse) || /\bcordeiros?\\b/i.test(normRawClasse) || /\bcaprinos?\b/i.test(normRawClasse)) && !/\b(frango|bovino|suino)\b/i.test(normTitle));

  // 7. Bovinos Nobres / Brisket / Steaks
  const isBovinoSteakOrCut = /\b(ancho|chorizo|denver|cowboy|short rib|picanha steak|coracao alcatra|coracao da alcatra|contra - file steak|contra file steak|file de costela ancho|peito bovino|peito \(brisket\)|ponta de peito|peito 1953|peito maturatta|peito friboi|peito bassi|peito black friboi|peito do chef|peito com osso - do chef|peito e costela do dianteiro|gordura do peito|jerked beef|charque|peito perdigao montana|peito resfriado perdigao montana|peito congelado perdigao montana|peito perdigao na brasa|peito com gordura perdigao na brasa|raquete uruguaia|fralda red uruguaia|acem com pescoco|acem e pescoco|sadia - peito sadia bassi angus)\b/i.test(normTitle) ||
    (/\bpeito( \(pedacos\))? - friboi\b/i.test(normTitle)) ||
    (/\bpeito - 1953\b/i.test(normTitle));

  // 8. Processados & Embutidos
  const isProcessado = (
    /\b(hamburguer|burguer|burger|cheeseburguer|churrasburguer|kibe|quibe|linguica|salsicha|mortadela|presunto|apresuntado|paio|nugget|nuggets?|tekitos|auroggets|bolovo|hot dog|empessado|kebab|lasanha|pizza|prato pronto|marmita|marmitas|escondidinho|almondega|almondegas|empanad[oa]s?|steak (de frango|de peru|de queijo|empanado|tradicional|recheado)|emp nacho|emp fgo|iscas de frango|iscas (de peixe )?empanad|iscas (de frango )?tempura|tirinhas de frango|chicken crocante|chicken fingers|croquete|torta|empada|empadao|empadinha|panqueca|quiche|coxinhas?(?!(\s+(d[aeo]s?|de)?\s*(asas?|chester|frango\s+na\s+brasa)|\s+asas?))|pastel|pasteis|salgadinho|salgadinhos|bolinho|bolinhos|esfirra|esfirras|hot pocket|hot hit|hot bowls|feijoada|caldinho de feijao|caldo verde|arroz carreteiro|arroz broc|massa pronta|nhoque|penne|fettuccine|capeletti|ravioli|canelone|prato congelado|sanduiche|choripan|polpetone|salame|salaminho|copa fatiada|blanquet|fiambre|frios|pao de alho|pat[eê]|embutid[oa]s?|defumado fatiado|peito de (peru|frango) defumado|peito de (peru|frango) fatiado|peito fgo defumado|peito peru defumado|peito de chester desfiado sabor defumado|delice de peru|frango defumado|frango cozido defumado|yakissoba|yakisoba|mac'n cheese|mac&cheese|mac & cheese|meu menu|milanesa|hdf hamb|cesta|cestas|kit|kits|combo|comemorativ|ingredientes para feijoada)\b/i.test(normTitle)
  ) && !isPlantBased && !isSobremesa && !isBovinoSteakOrCut;

  // 9. Aves
  const isAve = (
    /\b(frang[oa]s?|galinhas?|galos?|aves?|coxas?|sobrecoxas?|asas?|asinhas?|coxinhas?\s+(d[aeo]s?|de)?\s*asas?|coxas?\s+das?\s+asas?|tulipas?|drumets?|drumettes?|tutus?|perus?|chester|fiesta|sassamis?|filezinhos?|moelas?|cora[cç][aã]o(?!.*(montana|alcatra))|cora[cç][oõ]es(?!.*(montana|alcatra))|f[ií]gados?(?!.*(montana|charque|bertin))|frango a passarinho|galetos?|frangotes?|sobrepaletas?\s+(de\s+)?frango|picanha\s+de\s+frango|cortes\s+de\s+frango|meios?\s+d[ao]s?\s+asas?|sambiquiras?|dorsos?|carca[cç]as?\s+(de\s+)?(frango|ave|galinha|peru)|pesco[cç]os?\s+(de\s+)?frango|pescocinho|file\s+de\s+peito|meio\s+peito|file\s+peito|file\s+de\s+coxa|file\s+de\s+sobrecoxa|file\s+de\s+coxas?\s+e\s+sobrecoxas?|peito\s+com\s+osso|peito\s+sem\s+osso|peito\s+sem\s+pele|peito\s+com\s+pele|peito\s+desossado|peito\s+interfolhado|peito\s+envelopado|peito\s+individual|peito\s+inteiro|peito\s+a\s+passarinho|peito\s+bandeja|peito\s+flow\s+pack|frango\s+maravilha|buffalo wings|coxinha\s+chester)\b/i.test(normTitle) ||
    ((normRawClasse === 'aves' || normRawClasse === 'ave') && !/\b(bovino|suino|peixe|legume|vegetal|batata|seleta|margarina|queijo|bacon|costela|pernil|alcatra|contrafile|mignon|picanha|acem|cupim|patinho|merluza|tilapia|polaca)\b/i.test(normTitle))
  ) && !isPescado && !isPlantBased && !isVegetalPuro && !isProcessado && !isBovinoSteakOrCut;

  // 10. Suínos
  const isSuino = (
    /\b(suin[oa]s?|pork|porco|costela suina|costelinha( suina)?|bacon|pernil|bochecha suina|copa(?!col)|paleta suina|picanha suina|joelho suino|joelho de porco|eisbein|leitao|torresmo|panceta|pancetta|bisteca suina|bisteca|barriga suina|barriga aperitivo|barriga com pele|toucinho|orelha|focinho|rabada suina|rabo salgado|pe salgado|pe suino|mascara e orelha|pescoco suino|jerked suino|alcatra suina|file mignon suino|sobrepaleta suina|sobrepaleta cong sui|retalho cost sui|rtsv retalho cost sui|maminha suina|papada|banha suina|tender(?!izado)|lombo(?!.*(bacalhau|bovin))|lombinho)\b/i.test(normTitle) ||
    (/\\bsuin/i.test(normRawClasse) || /\\bsu\\u00edn/i.test(normRawClasse))
  ) && !isPescado && !isPlantBased && !isProcessado && !/\blombo bovin/i.test(normTitle);

  // 11. Bovinos
  const isBovino = (
    /\b(bovin[oa]s?|beef|boi|vaca|alcatra|contrafile|contra\s*-\s*file|contra file|file mignon|mignon|picanha|costela|acem|patinho|coxao mole|coxao duro|maminha|fraldinha|fraldao|cupim|capa de file|musculo|costela bovina|costelao|rabada|rabo( miudos)?|bucho|dobradinha|ossobuco|paleta bovina|paleta|lagarto|cha de fora|cha de dentro|moida bovina|carne moida|carne moida bovina|miolo de alcatra|bife|carpaccio|short rib|tomahawk|t-bone|brisket|peito( bovino|\s*\(brisket\))|entrecote|ribeye|angus|wazyu|wagyu|jerked beef|carne seca|carne-seca|charque|vazio|red montana|bassi|1953|maturatta|friboi|lombo bovino|iscas( perdigao na brasa)?|bananinha|coracao.*montana|figado.*montana|miudos.*montana|carne industrial diafragma|recorte traseiro palatare|ponta de peito|peito e costela do dianteiro|peito com osso - do chef|gordura do peito|peito perdigao montana|peito resfriado perdigao montana|peito congelado perdigao montana|peito perdigao na brasa|peito com gordura perdigao na brasa|chorizo|denver|cowboy|ancho|raquete uruguaia|fralda red uruguaia|acem com pescoco|acem e pescoco|sadia - peito sadia bassi angus)\b/i.test(normTitle) ||
    (/\bpeito( \(pedacos\))? - friboi\b/i.test(normTitle)) ||
    (/\bpeito - 1953\b/i.test(normTitle)) ||
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
    else if (/\bovino\b/i.test(normRawClasse) || /\bcordeiro/i.test(normRawClasse)) classe = 'Ovinos & Caprinos';
    else classe = 'Processados & Embutidos';
  }

  return { classe, conservacao };
}
