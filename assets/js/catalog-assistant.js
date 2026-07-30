(function exposeConsteraCatalogAssistant(root) {
  const foldMap = new Map([
    ["ə", "e"],
    ["ğ", "g"],
    ["ı", "i"],
    ["ö", "o"],
    ["ş", "s"],
    ["ü", "u"],
    ["ç", "c"]
  ]);
  const fold = (value) => String(value || "")
    .trim()
    .toLocaleLowerCase("az-AZ")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split("")
    .map((character) => foldMap.get(character) || character)
    .join("")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const profiles = [
    {
      key: "house",
      terms: ["ev", "villa", "bina", "kottec", "tikinti", "temel", "bunovre"],
      title: "Tikinti materialları",
      searches: ["sement", "armatur", "tikinti bloku", "izolyasiya", "elektrik kabeli", "su borusu"]
    },
    {
      key: "renovation",
      terms: ["temir", "renovasiya", "yenileme", "interyer"],
      title: "Təmir materialları",
      searches: ["suvaq", "macun", "daxili boya", "laminat", "kafel", "elektrik aksesuarları"]
    },
    {
      key: "bathroom",
      terms: ["hamam", "vanna", "sanitar", "dus"],
      title: "Hamam və sanitar qovşağı",
      searches: ["hidroizolyasiya", "kafel", "kafel yapışdırıcısı", "santexnika", "sanitar keramika", "ventilyator"]
    },
    {
      key: "roof",
      terms: ["dam", "krovlya", "mansard"],
      title: "Dam sistemi",
      searches: ["dam örtüyü", "membran", "istilik izolyasiyası", "yağış oluk sistemi", "dam bərkidicisi"]
    },
    {
      key: "facade",
      terms: ["fasad", "xarici divar", "eksteryer"],
      title: "Fasad sistemi",
      searches: ["fasad boyası", "fasad suvağı", "xps", "daş yun", "fasad dübeli", "hidroizolyasiya"]
    },
    {
      key: "electric",
      terms: ["elektrik", "kabel", "rozetka", "isiq", "avtomat"],
      title: "Elektrik sistemi",
      searches: ["elektrik kabeli", "avtomat açar", "elektrik panosu", "rozetka", "LED işıqlandırma"]
    },
    {
      key: "plumbing",
      terms: ["santexnika", "su", "kanalizasiya", "boru", "nasos"],
      title: "Su və kanalizasiya sistemi",
      searches: ["PPR boru", "kanalizasiya borusu", "fitinq", "su nasosu", "vana"]
    },
    {
      key: "paint",
      terms: ["boya", "kraska", "reng", "astar"],
      title: "Boya sistemi",
      searches: ["daxili boya", "fasad boyası", "astar", "macun", "boya alətləri"]
    },
    {
      key: "floor",
      terms: ["doseme", "laminat", "parket", "kafel", "plitka"],
      title: "Döşəmə sistemi",
      searches: ["laminat", "parket", "keramoqranit", "kafel yapışdırıcısı", "döşəmə altlığı"]
    },
    {
      key: "insulation",
      terms: ["izolyasiya", "isti", "ses", "akustika", "hidro"],
      title: "İzolyasiya sistemi",
      searches: ["daş yun", "XPS", "EPS", "hidroizolyasiya", "buxar baryeri", "akustik izolyasiya"]
    }
  ];

  const unique = (items) => [...new Set(items.filter(Boolean))];
  const containsTerm = (text, value) => {
    const term = fold(value);
    return text === term
      || text.startsWith(`${term} `)
      || text.endsWith(` ${term}`)
      || text.includes(` ${term} `);
  };

  const analyze = (input) => {
    const source = String(input || "").trim().slice(0, 500);
    const normalized = fold(source);
    const matched = profiles.filter((profile) =>
      profile.terms.some((term) => containsTerm(normalized, term))
    );
    const measurement = normalized.match(/(\d+(?:[.,]\d+)?)\s*(m2|m 2|kvadrat|m3|m 3|metr)/);
    const prefersRealMedia = /\b(real|foto|sekil|resmi|orijinal)\b/.test(normalized);
    const prefersVerifiedPrice = /\b(qiymet|neceye|manat|azn|ucuz|bahali)\b/.test(normalized);
    const rentalIntent = /\b(icare|kiraye|arenda|texnika|ekskavator|kran)\b/.test(normalized);
    const serviceIntent = /\b(xidmet|usta|briqada|podratci|qurasdirma|montaj)\b/.test(normalized);
    const packageIntent = /\b(paket|acar teslim|full|hamisi)\b/.test(normalized);
    const profileSearches = matched.flatMap((profile) => profile.searches);
    const fallback = source && !profileSearches.length ? [source.slice(0, 120)] : [];
    const searches = unique([...profileSearches, ...fallback]).slice(0, 8).map((query) => ({
      label: query,
      query
    }));
    const links = [];
    if (rentalIntent) links.push({ label: "Avadanlıq icarəsi", href: "rental.html" });
    if (serviceIntent) links.push({ label: "Tikinti və təmir xidmətləri", href: "services.html" });
    if (packageIntent) links.push({ label: "Hazır tikinti və təmir paketləri", href: "packages.html" });
    const title = matched.length
      ? unique(matched.map((profile) => profile.title)).join(" + ")
      : rentalIntent ? "Avadanlıq icarəsi"
        : serviceIntent ? "Tikinti xidməti"
          : "Kataloq seçimi";
    const area = measurement ? `${measurement[1].replace(",", ".")} ${measurement[2].replace(/\s/g, "")}` : "";
    const summaryParts = [
      area ? `${area} ölçüsü qeydə alındı` : "",
      searches.length ? `${searches.length} uyğun material istiqaməti hazırlandı` : "",
      links.length ? `${links.length} əlavə bölmə tapıldı` : ""
    ].filter(Boolean);
    return {
      source,
      title,
      summary: summaryParts.join(" · ") || "Axtarış ifadəsi kataloq üçün hazırlandı",
      searches,
      links,
      sourceFilter: prefersRealMedia ? "sourced-image" : prefersVerifiedPrice ? "sourced" : "all",
      rfqRecommended: Boolean(measurement || searches.length > 3 || rentalIntent || serviceIntent),
      area
    };
  };

  root.ConstEraCatalogAssistant = Object.freeze({ analyze });
})(globalThis);
