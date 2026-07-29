const AZERBAIJANI_FOLD_MAP = new Map([
  ["ə", "e"],
  ["ğ", "g"],
  ["ı", "i"],
  ["ö", "o"],
  ["ş", "s"],
  ["ü", "u"],
  ["ç", "c"]
]);

const SEARCH_STOP_WORDS = new Set([
  "bir",
  "bu",
  "ucun",
  "ile",
  "olan",
  "mene",
  "lazim",
  "lazimdir",
  "axtariram",
  "goster",
  "mehsul",
  "material",
  "ve"
]);

const SYNONYM_GROUPS = [
  ["boya", "kraska", "краска", "paint", "emulsiya", "emulsion"],
  ["sement", "cement", "simento", "цемент", "beton", "concrete", "m400", "m500"],
  ["beton", "concrete", "hazirbeton", "sement", "цемент"],
  ["armatur", "rebar", "demir", "арматура", "metal"],
  ["suvaq", "shtukaturka", "штукатурка", "plaster", "gips", "rotband"],
  ["gips", "alcipan", "gipsokarton", "гипсокартон", "rotband", "suvaq"],
  ["macun", "spaklyovka", "spatlevka", "шпаклевка", "putty"],
  ["kabel", "cable", "кабель", "provod", "провод"],
  ["rozetka", "socket", "розетка"],
  ["avtomat", "mcb", "avtomatika", "avtomatikaacar", "автомат"],
  ["boru", "pipe", "truba", "труба", "ppr", "pvc", "hdpe"],
  ["kafel", "plitka", "плитка", "tile", "keramoqranit"],
  ["laminat", "laminate", "flooring", "doseme", "parket", "ламинат"],
  ["izolyasiya", "insulation", "изоляция", "xps", "eps", "dasyun", "mineralyun"],
  ["dam", "roof", "krovlya", "кровля", "profnastil", "kiremit", "membran"],
  ["alet", "tool", "instrument", "инструмент", "makita", "bosch", "dewalt"],
  ["icare", "rental", "arenda", "аренда", "kiraye"],
  ["temir", "renovasiya", "repair", "ремонт"],
  ["dizayn", "design", "interyer", "интерьер", "memarliq"],
  ["smeta", "estimate", "смета", "xerc", "hesablama"],
  ["kq", "kg", "kiloqram", "килограмм"],
  ["l", "lt", "litr", "л", "литр"]
];

export const foldCatalogSearchText = (value) => String(value || "")
  .trim()
  .toLocaleLowerCase("az-AZ")
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .split("")
  .map((character) => AZERBAIJANI_FOLD_MAP.get(character) || character)
  .join("")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const normalizedSynonymGroups = SYNONYM_GROUPS.map((group) =>
  [...new Set(group.map(foldCatalogSearchText).filter((value) => value.length > 1 || value === "l" || value === "л"))]
);

const synonymMap = new Map();
normalizedSynonymGroups.forEach((group) => {
  group.forEach((term) => {
    if (!synonymMap.has(term) || term === group[0]) synonymMap.set(term, group);
  });
});

const expandMeasurementToken = (token) => {
  const match = token.match(/^(\d+(?:[.,]\d+)?)(kq|kg|l|lt|л|mm|sm|m2|m3|m)$/);
  if (!match) return [];
  const [, amount, unit] = match;
  const unitVariants = synonymMap.get(unit) || [unit];
  return [...new Set([
    token,
    ...unitVariants.map((variant) => `${amount} ${variant}`),
    ...unitVariants.map((variant) => `${amount}${variant}`)
  ])];
};

export const expandCatalogSearchGroups = (value, { maxGroups = 8, maxVariants = 8 } = {}) => {
  const normalized = foldCatalogSearchText(value);
  if (!normalized) return [];

  const tokens = normalized
    .split(" ")
    .filter((token) => token.length > 1 || /^\d+$/.test(token) || token === "l" || token === "л")
    .filter((token) => !SEARCH_STOP_WORDS.has(token))
    .slice(0, maxGroups);

  const groups = tokens.map((token) => {
    const variants = [
      token,
      ...(synonymMap.get(token) || []),
      ...expandMeasurementToken(token)
    ];
    return [...new Set(variants)].slice(0, maxVariants);
  });

  return groups.length ? groups : [[normalized]];
};

export const catalogSearchSynonyms = normalizedSynonymGroups;
