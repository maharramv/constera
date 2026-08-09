(async () => {
if (window.ConstEraCatalogReady) await window.ConstEraCatalogReady;

const marketplace = window.CONSTERA_MARKETPLACE || {
  categories: [],
  serviceCategories: [],
  packageCategories: [],
  rentalCategories: [],
  brands: [],
  suppliers: [],
  products: [],
  services: [],
  packages: [],
  rentals: []
};

const storage = {
  read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Məhdud və məxfi brauzer rejimlərində lokal idarəetmə dəyişiklikləri könüllüdür.
    }
  }
};

document.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches("[data-product-image]")) return;

  const fallback = document.createElement("span");
  fallback.className = "product-image-fallback";
  fallback.textContent = image.dataset.productFallback || "CE";
  fallback.setAttribute("role", "img");
  fallback.setAttribute("aria-label", image.alt || "Məhsul şəkli mövcud deyil");
  image.replaceWith(fallback);
}, true);

const adminProductStorageKey = "constera-admin-products";
const adminSupplierStorageKey = "constera-admin-suppliers";
const cartStorageKey = "constera-cart";
const projectBasketStorageKey = "constera-project-basket";
const projectProfileStorageKey = "constera-project-profile";
const adminEntityConfigs = {
  service: {
    storageKey: "constera-admin-services",
    arrayKey: "services",
    categoriesKey: "serviceCategories",
    idPrefix: "admin-service",
    titleField: "title",
    label: "xidmət"
  },
  package: {
    storageKey: "constera-admin-packages",
    arrayKey: "packages",
    categoriesKey: "packageCategories",
    idPrefix: "admin-package",
    titleField: "title",
    label: "paket"
  },
  rental: {
    storageKey: "constera-admin-rentals",
    arrayKey: "rentals",
    categoriesKey: "rentalCategories",
    idPrefix: "admin-rental",
    titleField: "name",
    label: "icarə"
  }
};
const adminBackupKeys = [
  adminProductStorageKey,
  adminSupplierStorageKey,
  adminEntityConfigs.service.storageKey,
  adminEntityConfigs.package.storageKey,
  adminEntityConfigs.rental.storageKey,
  "constera-rfq-drafts",
  "constera-tenders",
  "constera-ai-estimates",
  "constera-favorites",
  "constera-compare",
  cartStorageKey,
  projectBasketStorageKey,
  projectProfileStorageKey
];

const getCart = () => storage.read(cartStorageKey)
  .map((item) => ({
    id: String(item?.id || ""),
    quantity: Number(item?.quantity || 1),
    offerId: String(item?.offerId || "")
  }))
  .filter((item) => item.id && Number.isFinite(item.quantity) && item.quantity > 0);
const saveCart = (items) => storage.write(cartStorageKey, items.slice(0, 100));
const getCartCount = () => getCart().reduce((sum, item) => sum + item.quantity, 0);
const updateCartIndicators = () => {
  const count = getCartCount();
  document.querySelectorAll("[data-cart-count]").forEach((node) => {
    node.textContent = count.toLocaleString("az-AZ");
  });
};

const projectEntityTypes = new Set(["product", "service", "package", "rental"]);
const getProjectBasket = () => storage.read(projectBasketStorageKey)
  .map((item) => ({
    type: String(item?.type || ""),
    id: String(item?.id || ""),
    quantity: Math.max(1, Number(item?.quantity || 1)),
    addedAt: String(item?.addedAt || "")
  }))
  .filter((item) => projectEntityTypes.has(item.type) && item.id);
const saveProjectBasket = (items) => storage.write(projectBasketStorageKey, items.slice(0, 200));
const getProjectBasketCount = () => getProjectBasket().length;
const updateProjectBasketIndicators = () => {
  const count = getProjectBasketCount();
  document.querySelectorAll("[data-project-basket-count]").forEach((node) => {
    node.textContent = count.toLocaleString("az-AZ");
  });
};
const isInProjectBasket = (type, id) => getProjectBasket()
  .some((item) => item.type === type && item.id === id);
const projectActionButton = (type, id, className = "button button-outline") => {
  const selected = isInProjectBasket(type, id);
  return `<button class="${className} product-cart${selected ? " is-active" : ""}" type="button" data-action="project" data-entity-type="${escapeAttr(type)}" data-id="${escapeAttr(id)}" aria-pressed="${selected}">${selected ? "Layihədədir" : "Layihəyə əlavə et"}</button>`;
};

const getCategory = (id) => marketplace.categories.find((category) => category.id === id);
const getBrand = (name) => marketplace.brands.find((brand) => brand.name === name);
const getServiceCategory = (id) =>
  (marketplace.serviceCategories || []).find((category) => category.id === id);
const getPackageCategory = (id) =>
  (marketplace.packageCategories || []).find((category) => category.id === id);
const getRentalCategory = (id) =>
  (marketplace.rentalCategories || []).find((category) => category.id === id);

const projectEntityConfig = {
  product: { items: () => marketplace.products || [], title: "name", label: "Material", detail: "product-detail.html", param: "product" },
  service: { items: () => marketplace.services || [], title: "title", label: "Xidmət", detail: "service-detail.html", param: "service" },
  package: { items: () => marketplace.packages || [], title: "title", label: "Hazır paket", detail: "package-detail.html", param: "package" },
  rental: { items: () => marketplace.rentals || [], title: "name", label: "İcarə", detail: "rental-detail.html", param: "rental" }
};
const getProjectEntity = (type, id) => projectEntityConfig[type]?.items().find((item) => item.id === id) || null;
const getProjectProfile = () => {
  const value = storage.read(projectProfileStorageKey);
  return value && !Array.isArray(value) ? value : {};
};
const getResolvedProjectBasket = () => getProjectBasket().map((entry) => ({
  ...entry,
  entity: getProjectEntity(entry.type, entry.id),
  config: projectEntityConfig[entry.type]
})).filter((entry) => entry.entity && entry.config);
const getProjectEntityTitle = (entry) => entry.entity[entry.config.title] || "Məlumat";
const getProjectEntityPriceAmount = (entry) => {
  const amount = Number(entry.entity.priceAmount);
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (entry.type === "product" && entry.entity.priceStatus !== "confirmed") return null;
  return amount;
};

const normalize = (value) => String(value || "").trim().toLowerCase();
const normalizeSearchText = (value) => normalize(value)
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .replace(/ə/g, "e")
  .replace(/ı/g, "i")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();
const searchSynonymMap = {
  boya: ["kraska", "краска", "paint", "emulsiya", "emulsion", "interyer boya", "eksteryer boya"],
  kraska: ["boya", "краска", "paint", "emulsiya"],
  краска: ["boya", "kraska", "paint", "emulsiya"],
  paint: ["boya", "kraska"],
  sement: ["cement", "simento", "цемент", "beton", "m400", "m500"],
  cement: ["sement", "beton"],
  цемент: ["sement", "cement", "beton"],
  beton: ["hazır beton", "sement", "concrete"],
  armatur: ["rebar", "metal", "demir", "dəmir", "арматура"],
  арматура: ["armatur", "rebar", "demir", "metal"],
  demir: ["dəmir", "armatur", "metal"],
  dəmir: ["demir", "armatur", "metal"],
  suvaq: ["shtukaturka", "штукатурка", "plaster", "gips", "rotband"],
  shtukaturka: ["suvaq", "plaster"],
  штукатурка: ["suvaq", "shtukaturka", "plaster"],
  gips: ["suvaq", "rotband", "alcipan", "gipsokarton"],
  macun: ["şpaklyovka", "spaklyovka", "шпаклевка", "putty", "şpatlevka"],
  şpaklyovka: ["macun", "spaklyovka", "putty"],
  spaklyovka: ["macun", "şpaklyovka", "putty"],
  kabel: ["cable", "кабель", "elektrik kabeli", "provod", "провод"],
  кабель: ["kabel", "cable", "provod"],
  cable: ["kabel", "elektrik"],
  rozetka: ["socket", "elektrik rozetkası"],
  avtomat: ["avtomatik açar", "mcb", "schneider", "legrand"],
  boru: ["pipe", "ppr", "pvc", "hdpe", "truba", "труба"],
  truba: ["boru", "pipe"],
  труба: ["boru", "truba", "pipe"],
  kafel: ["plitka", "плитка", "plitə", "keramoqranit", "tile"],
  plitka: ["kafel", "plitə", "tile"],
  плитка: ["kafel", "plitka", "tile"],
  laminat: ["laminate", "flooring", "döşəmə"],
  dosheme: ["döşəmə", "flooring", "laminat", "parket"],
  döşəmə: ["dosheme", "flooring", "laminat", "parket"],
  izolyasiya: ["insulation", "xps", "eps", "daş yun", "mineral yun"],
  dam: ["roof", "profnastil", "kirəmit", "membran"],
  alət: ["alet", "tool", "makita", "bosch", "dewalt"],
  alet: ["alət", "tool"],
  icare: ["icarə", "rental", "kirayə", "arenda", "аренда", "avadanlıq icarəsi"],
  icarə: ["icare", "rental", "kirayə"],
  аренда: ["icarə", "icare", "rental", "kirayə"],
  temir: ["təmir", "renovasiya", "repair", "ремонт"],
  təmir: ["temir", "renovasiya", "repair"],
  ремонт: ["təmir", "temir", "renovasiya", "repair"],
  dizayn: ["design", "interyer", "memarlıq"],
  smeta: ["estimate", "смета", "xərc", "material hesabı"],
  kq: ["kg", "kiloqram", "килограмм"],
  kg: ["kq", "kiloqram", "килограмм"],
  l: ["lt", "litr", "л", "литр"],
  lt: ["l", "litr", "л", "литр"]
};

const normalizedSearchSynonymMap = {};
Object.entries(searchSynonymMap).forEach(([key, values]) => {
  const group = [...new Set([
    normalizeSearchText(key),
    ...values.flatMap((value) => normalizeSearchText(value).split(" "))
  ].filter(Boolean))];
  group.forEach((term) => {
    normalizedSearchSynonymMap[term] = [...new Set([...(normalizedSearchSynonymMap[term] || []), ...group])];
  });
});

const searchStopWords = new Set([
  "bir", "bu", "ucun", "ile", "olan", "mene", "lazim", "lazimdir",
  "axtariram", "goster", "mehsul", "material", "ve"
]);

const expandSearchMeasurement = (token) => {
  const match = token.match(/^(\d+(?:[.,]\d+)?)(kq|kg|l|lt|л|mm|sm|m2|m3|m)$/);
  if (!match) return [];
  const [, amount, unit] = match;
  const variants = normalizedSearchSynonymMap[unit] || [unit];
  return [...new Set([
    token,
    ...variants.map((variant) => `${amount} ${variant}`),
    ...variants.map((variant) => `${amount}${variant}`)
  ])];
};

const expandSearchGroups = (value) => {
  const tokens = normalizeSearchText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 || /^\d+$/.test(token) || token === "l" || token === "л")
    .filter((token) => !searchStopWords.has(token))
    .slice(0, 8);
  return tokens.map((token) => [...new Set([
    token,
    ...(normalizedSearchSynonymMap[token] || []),
    ...expandSearchMeasurement(token)
  ])].slice(0, 8));
};

const expandSearchTokens = (value) => [...new Set(expandSearchGroups(value).flat())];
const matchesExpandedSearch = (searchable, value) => {
  const groups = expandSearchGroups(value);
  if (!groups.length) return true;
  const text = normalizeSearchText(searchable);
  return groups.every((group) => group.some((token) => text.includes(token)));
};
const getProductSearchRelevance = (product, value) => {
  const query = normalizeSearchText(value);
  if (!query) return 0;

  const directTokens = query.split(/\s+/).filter((token) => token.length > 1);
  const expandedTokens = expandSearchTokens(value).filter((token) => !directTokens.includes(token));
  const name = normalizeSearchText(product.name);
  const brand = normalizeSearchText(product.brand);
  const sku = normalizeSearchText(product.sku);
  const barcode = normalizeSearchText(product.barcode);
  const subcategory = normalizeSearchText(product.subcategory);
  const category = normalizeSearchText(product.category);
  const specs = normalizeSearchText((product.specs || []).join(" "));
  let score = 0;

  if (name === query) score += 400;
  else if (name.startsWith(query)) score += 280;
  else if (name.includes(query)) score += 220;

  if (sku === query) score += 240;
  else if (sku.includes(query)) score += 160;
  if (barcode === query) score += 360;
  else if (barcode.includes(query)) score += 190;
  if (brand === query) score += 180;
  else if (brand.includes(query)) score += 120;
  if (subcategory.includes(query)) score += 90;
  if (category.includes(query)) score += 60;

  directTokens.forEach((token) => {
    if (name.includes(token)) score += 70;
    if (brand.includes(token)) score += 45;
    if (sku.includes(token)) score += 40;
    if (barcode.includes(token)) score += 55;
    if (subcategory.includes(token)) score += 30;
    if (specs.includes(token)) score += 15;
  });
  expandedTokens.forEach((token) => {
    if (name.includes(token)) score += 8;
    else if (subcategory.includes(token) || specs.includes(token)) score += 3;
  });

  return score;
};
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
const escapeAttr = escapeHtml;
const compactSymbol = (value, fallback = "") => {
  const source = String(value || "").trim();
  if (!source) return fallback;
  return source.replace(/\s+/g, " ").slice(0, 2).toUpperCase();
};
const getSafeHttpsUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
};
const getSafeImageUrl = (value) => {
  const path = String(value || "").trim();
  if (/^(?:\/|assets\/)[^\\]*$/i.test(path) && !path.startsWith("//")) return path;
  return getSafeHttpsUrl(path);
};
const getPublicImageUrl = (item, value = item?.imageUrl) => {
  const imageUrl = getSafeImageUrl(value);
  if (!imageUrl) return "";
  if (!getSafeHttpsUrl(imageUrl)) return imageUrl;
  return item?.mediaLicensed === true ? imageUrl : "";
};
const marketplaceRanking = window.CONSTERA_MARKETPLACE_RANKING || {};
const hasSourcedData = (item) => marketplaceRanking.hasHttpsSource
  ? marketplaceRanking.hasHttpsSource(item)
  : Boolean(getSafeHttpsUrl(item?.sourceUrl));
const hasRealMedia = (item) => Boolean(getPublicImageUrl(item));
const getSourceQualityScore = (item, kind = "product") => marketplaceRanking.getSourceQualityScore
  ? marketplaceRanking.getSourceQualityScore(item, kind)
  : (hasSourcedData(item) ? 500 : 0) + (hasRealMedia(item) ? 180 : 0);
const compareSourceQuality = (left, right, kind = "product") => marketplaceRanking.compareSourceQuality
  ? marketplaceRanking.compareSourceQuality(left, right, kind)
  : getSourceQualityScore(right, kind) - getSourceQualityScore(left, kind)
    || String(left?.name || left?.title || "").localeCompare(String(right?.name || right?.title || ""), "az");
const sortBySourceQuality = (items, kind = "product") => marketplaceRanking.sortBySourceQuality
  ? marketplaceRanking.sortBySourceQuality(items, kind)
  : [...(items || [])].sort((left, right) => compareSourceQuality(left, right, kind));
const createProductMedia = (product, fallbackText) => {
  const imageUrl = getPublicImageUrl(product);
  return imageUrl
    ? `<img data-product-image data-product-fallback="${escapeAttr(fallbackText)}" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(product.name)}" width="640" height="480" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer">`
    : `<span class="product-image-fallback" role="img" aria-label="${escapeAttr(product.name)} üçün şəkil mövcud deyil">${escapeHtml(fallbackText)}</span>`;
};
const getResponsivePageSize = (desktop, mobile) =>
  window.matchMedia("(max-width: 820px)").matches ? mobile : desktop;
const createProgressiveGrid = (grid, pagination, renderItem, pageSize) => {
  const button = pagination?.querySelector("[data-load-more]");
  const status = pagination?.querySelector("[data-pagination-status]");
  let items = [];
  let visibleCount = pageSize;
  let totalCount = 0;
  let requestMore = null;
  let loading = false;

  const paint = () => {
    const visibleItems = items.slice(0, visibleCount);
    grid.innerHTML = visibleItems.map(renderItem).join("");
    if (status) status.textContent = `${visibleItems.length} / ${totalCount || items.length} göstərilir`;
    if (button) {
      button.hidden = visibleItems.length >= items.length && items.length >= totalCount;
      button.disabled = loading;
      button.textContent = loading ? "Yüklənir..." : "Daha çox göstər";
    }
    if (pagination) pagination.hidden = items.length === 0;
  };

  button?.addEventListener("click", async () => {
    if (visibleCount < items.length) {
      visibleCount += pageSize;
      paint();
      return;
    }
    if (!requestMore || items.length >= totalCount || loading) return;
    loading = true;
    paint();
    try {
      await requestMore();
    } finally {
      loading = false;
      paint();
    }
  });

  return {
    setItems(nextItems, options = {}) {
      items = nextItems;
      totalCount = Number(options.total ?? nextItems.length);
      requestMore = options.requestMore || null;
      visibleCount = options.preserveVisible
        ? Math.min(Math.max(visibleCount + pageSize, pageSize), items.length)
        : pageSize;
      paint();
    }
  };
};
const downloadTextFile = (filename, text, mime = "text/plain;charset=utf-8") => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
const updatePageDescription = (description) => {
  const text = String(description || "").trim();
  if (!text) return;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", text);
  window.consteraRefreshSeo?.();
};

const parseProductPriceAmount = (product) => {
  if (product?.priceStatus !== "confirmed") return null;
  if (Number.isFinite(Number(product.priceAmount))) return Number(product.priceAmount);
  const match = String(product.price || "").replace(/\s/g, "").replace(",", ".").match(/\d+(?:\.\d{1,2})?/);
  const value = match ? Number(match[0]) : null;
  return Number.isFinite(value) ? value : null;
};

const getPriceFreshness = (product) => {
  if (product?.priceStatus === "expired") return { label: "Qiymətin vaxtı keçib", className: "is-expired" };
  if (product?.priceStatus !== "confirmed") return { label: "Qiymət sorğu əsasında", className: "is-request" };
  const verifiedAt = new Date(product.priceVerifiedAt || "");
  if (!Number.isFinite(verifiedAt.getTime())) {
    return { label: "Mənbəli qiymət · sifarişdən əvvəl təsdiqlə", className: "is-source" };
  }
  const days = Math.max(0, Math.floor((Date.now() - verifiedAt.getTime()) / 86_400_000));
  if (days > 90) return { label: "Qiymət yenidən təsdiqlənməlidir", className: "is-expired" };
  return {
    label: `${new Intl.DateTimeFormat("az-AZ", { dateStyle: "medium" }).format(verifiedAt)} tarixində yoxlanıb`,
    className: days > 30 ? "is-aging" : "is-fresh"
  };
};

const getProductAttributes = (product) => {
  const existing = Array.isArray(product?.attributes)
    ? product.attributes.filter((item) => item?.label && item?.value)
    : [];
  if (existing.length) return existing.slice(0, 24);

  const attributes = [];
  const seen = new Set();
  const add = (label, value) => {
    const cleanLabel = String(label || "").trim();
    const cleanValue = String(value || "").trim();
    const key = `${normalize(cleanLabel)}:${normalize(cleanValue)}`;
    if (!cleanLabel || !cleanValue || seen.has(key)) return;
    seen.add(key);
    attributes.push({ label: cleanLabel, value: cleanValue });
  };
  add("Qablaşdırma", product?.package);
  add("Mənşə", product?.origin);
  (product?.specs || []).forEach((spec) => {
    const value = String(spec || "").trim();
    const pair = value.match(/^([^:：=]{2,60})\s*[:：=]\s*(.+)$/);
    if (pair) {
      add(pair[1], pair[2]);
      return;
    }
    const thickness = value.match(/(\d+(?:[.,]\d+)?\s*(?:mm|sm|cm|m))\s+qalınlıq/i);
    if (thickness) add("Qalınlıq", thickness[1]);
    const dimensions = value.match(/(\d+(?:[.,]\d+)?\s*(?:mm|sm|cm|m)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?\s*(?:mm|sm|cm|m))/i);
    if (dimensions) add("Ölçü", dimensions[1]);
    const color = value.match(/^(.{2,40})\s+r[əe]ng(?:i)?$/i);
    if (color) add("Rəng", color[1]);
  });
  return attributes.slice(0, 24);
};

const injectEntitySchema = (id, data, imageUrl = "") => {
  let script = document.getElementById(id);
  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
  const safeImage = getSafeImageUrl(imageUrl);
  if (safeImage) {
    const absoluteImage = new URL(safeImage, window.location.href).toString();
    document.querySelector('meta[property="og:image"]')?.setAttribute("content", absoluteImage);
    document.querySelector('meta[name="twitter:image"]')?.setAttribute("content", absoluteImage);
  }
};

const countProductsBy = (field, value) =>
  marketplace.products.filter((product) => product[field] === value).length;
const countItemsBy = (items, field, value) =>
  (items || []).filter((item) => item[field] === value).length;
const createSlug = (value) =>
  normalize(value)
    .replace(/ə/g, "e")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
const getProductKey = (product) => product?.id || product?.sku || product?.name;
const normalizeSpecs = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
  return String(value || "")
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
};
const findCategoryByInput = (value) => {
  const normalized = normalize(value);
  return marketplace.categories.find((category) =>
    normalize(category.id) === normalized || normalize(category.title) === normalized
  );
};
const findSubcategoryByInput = (categoryId, value) => {
  const category = getCategory(categoryId);
  const normalized = normalize(value);
  return (category?.subcategories || []).find((item) => normalize(item) === normalized) || value;
};
const getEntityConfig = (entityType) => adminEntityConfigs[entityType] || adminEntityConfigs.service;
const getEntityCategories = (entityType) => marketplace[getEntityConfig(entityType).categoriesKey] || [];
const getEntityItems = (entityType) => marketplace[getEntityConfig(entityType).arrayKey] || [];
const setEntityItems = (entityType, items) => {
  marketplace[getEntityConfig(entityType).arrayKey] = items;
};
const getAdminEntityItems = (entityType) => storage.read(getEntityConfig(entityType).storageKey);
const saveAdminEntityItems = (entityType, items) => storage.write(getEntityConfig(entityType).storageKey, items);
const getEntityTitle = (entityType, item) => item?.[getEntityConfig(entityType).titleField] || item?.title || item?.name || "";
const findEntityCategoryByInput = (entityType, value) => {
  const normalized = normalize(value);
  return getEntityCategories(entityType).find((category) =>
    normalize(category.id) === normalized || normalize(category.title) === normalized
  );
};
const findEntitySubcategoryByInput = (entityType, categoryId, value) => {
  const category = getEntityCategories(entityType).find((item) => item.id === categoryId);
  const normalized = normalize(value);
  return (category?.subcategories || []).find((item) => normalize(item) === normalized) || value;
};
const getAdminProducts = () => storage.read(adminProductStorageKey);
const saveAdminProducts = (products) => storage.write(adminProductStorageKey, products);
const getAdminSuppliers = () => storage.read(adminSupplierStorageKey);
const saveAdminSuppliers = (suppliers) => storage.write(adminSupplierStorageKey, suppliers);
const ensureAdminSupplierShape = (supplier, index = 0) => {
  const name = supplier.name || "Yeni təchizatçı";
  return {
    id: supplier.id || `admin-supplier-${createSlug(name)}-${String(index + 1).padStart(3, "0")}`,
    name,
    type: supplier.type || "Təchizatçı",
    focus: supplier.focus || "Material, xidmət və qiymət sorğusu təklifləri",
    website: supplier.website || "",
    status: supplier.status || "Aktiv",
    region: supplier.region || "Azərbaycan",
    contact: supplier.contact || "",
    rating: supplier.rating || "Yeni",
    responseTime: supplier.responseTime || "Qiymət sorğusu əsasında"
  };
};
const ensureAdminEntityShape = (entityType, item, index = 0) => {
  const config = getEntityConfig(entityType);
  const categories = getEntityCategories(entityType);
  const category = findEntityCategoryByInput(entityType, item.category)?.id ||
    item.category ||
    categories[0]?.id ||
    "general";
  const subcategory = findEntitySubcategoryByInput(entityType, category, item.subcategory) ||
    categories.find((entry) => entry.id === category)?.subcategories?.[0] ||
    item.subcategory ||
    "Ümumi";
  const title = getEntityTitle(entityType, item) || "Yeni kart";
  const id = item.id || `${config.idPrefix}-${createSlug(title)}-${String(index + 1).padStart(3, "0")}`;
  const base = {
    id,
    category,
    subcategory,
    unit: item.unit || "Sorğu ilə",
    price: item.price || "Sorğu əsasında",
    specs: normalizeSpecs(item.specs)
  };

  if (entityType === "package") {
    return {
      ...base,
      title,
      type: item.type || item.itemType || "Hazır paket",
      timeline: item.timeline || item.time || "Layihədən sonra",
      team: item.team || item.teamOrOperator || "Açar təslim komanda",
      idealFor: item.idealFor || item.extra || "Müştəri brifinə görə",
      includes: normalizeSpecs(item.includes || item.specs),
      deliverables: normalizeSpecs(item.deliverables)
    };
  }

  if (entityType === "rental") {
    return {
      ...base,
      name: title,
      capacity: item.capacity || item.extra || "Layihəyə görə",
      deposit: item.deposit || "Müqavilə əsasında",
      delivery: item.delivery || item.time || "Obyekt ünvanına görə",
      operator: item.operator || item.team || item.teamOrOperator || "Razılaşma ilə"
    };
  }

  return {
    ...base,
    title,
    type: item.type || item.itemType || "Xidmət",
    leadTime: item.leadTime || item.time || "Obyektə baxışdan sonra",
    team: item.team || item.teamOrOperator || "İxtisaslaşmış briqada",
    deliverables: normalizeSpecs(item.deliverables)
  };
};
const ensureAdminProductShape = (product, index = 0) => {
  const category = findCategoryByInput(product.category)?.id || product.category || marketplace.categories[0]?.id || "general";
  const subcategory = findSubcategoryByInput(category, product.subcategory) ||
    getCategory(category)?.subcategories?.[0] ||
    product.subcategory ||
    "Ümumi";
  const sku = product.sku || `ADM-${String(index + 1).padStart(5, "0")}`;
  const id = product.id || `admin-${createSlug(sku)}-${createSlug(product.name || "mehsul")}`;

  return {
    id,
    sku,
    barcode: product.barcode || "",
    name: product.name || "Yeni məhsul",
    brand: product.brand || "Brendsiz",
    category,
    subcategory,
    package: product.package || product.packaging || "Sorğu ilə",
    origin: product.origin || "Azərbaycan/İdxal",
    supplier: product.supplier || "İdarəetmə paneli əlavə etdi",
    price: product.price || "Sorğu əsasında",
    priceAmount: product.priceAmount ?? null,
    priceCurrency: product.priceCurrency || "AZN",
    priceNote: product.priceNote || "İdarəetmə panelindən əlavə olunub",
    priceStatus: product.priceStatus || (normalize(product.price).includes("sorğu") ? "request" : "confirmed"),
    imageUrl: product.imageUrl || product.image || "",
    sourceUrl: product.sourceUrl || product.source || "",
    sourceLabel: product.sourceLabel || (product.sourceUrl ? "Mənbə" : ""),
    availability: product.availability || "Stok sorğu ilə",
    stockQuantity: product.stockQuantity ?? "",
    reservedQuantity: product.reservedQuantity ?? 0,
    availableQuantity: product.availableQuantity ?? product.stockQuantity ?? "",
    minimumOrder: product.minimumOrder ?? "",
    warranty: product.warranty || "",
    priceVerifiedAt: product.priceVerifiedAt || "",
    priceHistory: Array.isArray(product.priceHistory) ? product.priceHistory : [],
    supplierId: product.supplierId || null,
    status: product.status || "active",
    updatedAt: product.updatedAt || "",
    specs: normalizeSpecs(product.specs),
    attributes: Array.isArray(product.attributes) ? product.attributes : []
  };
};
const syncAdminProductOverlay = () => {
  const adminProducts = getAdminProducts().map(ensureAdminProductShape);
  if (!adminProducts.length) return;

  const overlayById = new Map(adminProducts.map((product) => [product.id, product]));
  const overlayBySku = new Map(adminProducts.map((product) => [normalize(product.sku), product]));
  const usedIds = new Set();

  marketplace.products = (marketplace.products || []).map((product) => {
    const overlay = overlayById.get(product.id) || overlayBySku.get(normalize(product.sku));
    if (!overlay) return product;
    usedIds.add(overlay.id);
    return { ...product, ...overlay };
  });

  adminProducts.forEach((product) => {
    if (!usedIds.has(product.id) && !marketplace.products.some((item) => item.id === product.id || normalize(item.sku) === normalize(product.sku))) {
      marketplace.products.push(product);
    }
  });
};
const syncAdminSupplierOverlay = () => {
  const adminSuppliers = getAdminSuppliers().map(ensureAdminSupplierShape);
  if (!adminSuppliers.length) return;

  const overlayById = new Map(adminSuppliers.map((supplier) => [supplier.id, supplier]));
  const overlayByName = new Map(adminSuppliers.map((supplier) => [normalize(supplier.name), supplier]));
  const usedIds = new Set();

  marketplace.suppliers = (marketplace.suppliers || []).map((supplier) => {
    const overlay = overlayById.get(supplier.id) || overlayByName.get(normalize(supplier.name));
    if (!overlay) return supplier;
    usedIds.add(overlay.id);
    return { ...supplier, ...overlay };
  });

  adminSuppliers.forEach((supplier) => {
    const exists = (marketplace.suppliers || []).some((item) =>
      item.id === supplier.id || normalize(item.name) === normalize(supplier.name)
    );
    if (!usedIds.has(supplier.id) && !exists) marketplace.suppliers.push(supplier);
  });
};
const syncAdminEntityOverlay = (entityType) => {
  const adminItems = getAdminEntityItems(entityType).map((item, index) => ensureAdminEntityShape(entityType, item, index));
  if (!adminItems.length) return;

  const overlayById = new Map(adminItems.map((item) => [item.id, item]));
  const overlayByTitle = new Map(adminItems.map((item) => [normalize(getEntityTitle(entityType, item)), item]));
  const usedIds = new Set();
  const mergedItems = getEntityItems(entityType).map((item) => {
    const overlay = overlayById.get(item.id) || overlayByTitle.get(normalize(getEntityTitle(entityType, item)));
    if (!overlay) return item;
    usedIds.add(overlay.id);
    return { ...item, ...overlay };
  });

  adminItems.forEach((item) => {
    const title = normalize(getEntityTitle(entityType, item));
    const exists = mergedItems.some((entry) => entry.id === item.id || normalize(getEntityTitle(entityType, entry)) === title);
    if (!usedIds.has(item.id) && !exists) mergedItems.push(item);
  });

  setEntityItems(entityType, mergedItems);
};
const getSubcategories = (categories, categoryId) => {
  const selectedCategories = categoryId === "all"
    ? categories
    : categories.filter((category) => category.id === categoryId);
  return [...new Set(selectedCategories.flatMap((category) => category.subcategories || []))];
};

const groupCategories = (categories) => {
  const groups = [];
  (categories || []).forEach((category) => {
    const groupName = category.group || "Ümumi";
    let group = groups.find((item) => item.name === groupName);
    if (!group) {
      group = { name: groupName, categories: [] };
      groups.push(group);
    }
    group.categories.push(category);
  });
  return groups;
};

const renderGroupedCategoryOptions = (categories, items, allLabel) => `
  <option value="all">${escapeHtml(allLabel)} (${(items || []).length})</option>
  ${groupCategories(categories).map((group) => `
    <optgroup label="${escapeAttr(group.name)}">
      ${group.categories.map((category) => `
        <option value="${escapeAttr(category.id)}">${escapeHtml(category.title)} (${countItemsBy(items, "category", category.id)})</option>
      `).join("")}
    </optgroup>
  `).join("")}
`;

const getFilteredSubcategoryCount = (items, categoryId, subcategory) =>
  (items || []).filter((item) => {
    const matchesCategory = categoryId === "all" || item.category === categoryId;
    return matchesCategory && item.subcategory === subcategory;
  }).length;
const getQueryParam = (name) => new URLSearchParams(window.location.search).get(name);

syncAdminProductOverlay();
syncAdminSupplierOverlay();
["service", "package", "rental"].forEach(syncAdminEntityOverlay);
marketplace.products = sortBySourceQuality(marketplace.products, "product");
marketplace.packages = sortBySourceQuality(marketplace.packages, "package");
marketplace.rentals = sortBySourceQuality(marketplace.rentals, "rental");

const renderDetailFallback = (container, title, backHref) => {
  container.innerHTML = `
    <div class="detail-empty glass">
      <p class="eyebrow">Məlumat tapılmadı</p>
      <h1>${escapeHtml(title)}</h1>
      <p>Seçilmiş məlumat bazada tapılmadı. Siyahıya qayıdıb başqa seçim et.</p>
      <a class="button button-primary" href="${escapeAttr(backHref)}">Siyahıya qayıt</a>
    </div>
  `;
};

const renderEntityRecommendations = (title, entities, query) => {
  if (!entities.length) return "";
  const itemLinks = entities
    .slice(0, 3)
    .map((item) => {
      const itemLabel = item.title || item.name || "Məlumat";
      return `
        <a class="info-card" href="${escapeAttr(`${query.path}?${query.param}=${encodeURIComponent(item.id)}`)}">
          <span>Əlaqəli seçim</span>
          <h3>${escapeHtml(itemLabel)}</h3>
        </a>
      `;
    })
    .join("");

  return `
    <section class="detail-data-section detail-related">
      <h2>${escapeHtml(title)}</h2>
      <div class="market-grid">${itemLinks}</div>
    </section>
  `;
};

const createProductCard = (product) => {
  const category = getCategory(product.category);
  const brand = getBrand(product.brand);
  const favoriteIds = storage.read("constera-favorites");
  const compareIds = storage.read("constera-compare");
  const cartIds = new Set(getCart().map((item) => item.id));
  const isFavorite = favoriteIds.includes(product.id);
  const isCompared = compareIds.includes(product.id);
  const isInCart = cartIds.has(product.id);
  const brandMark = product.brand.split(" ").map((word) => word[0]).join("").slice(0, 3);
  const categoryTitle = category?.title || product.category;
  const media = createProductMedia(product, brandMark);
  const freshness = getPriceFreshness(product);
  const sourceUrl = getSafeHttpsUrl(product.sourceUrl);
  const sourced = Boolean(sourceUrl);
  const realMedia = hasRealMedia(product);
  const sourceBadge = sourced
    ? product.priceStatus === "confirmed" && realMedia ? "Mənbəli qiymət + hüquqlu foto"
      : product.priceStatus === "confirmed" ? "Mənbəli qiymət"
        : realMedia ? "Mənbə + hüquqlu foto" : "Mənbəli məlumat"
    : "";
  const source = sourceUrl
    ? `<a class="source-link" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(product.sourceLabel || "Mənbə")}</a>`
    : "";
  const detailLink = `<a class="source-link" href="product-detail.html?product=${encodeURIComponent(product.id)}">Detallı bax</a>`;
  const cartLabel = isInCart
    ? product.commerceReady ? "Səbətdədir" : "Sorğu siyahısındadır"
    : product.commerceReady ? "Səbətə əlavə et" : "Sorğu siyahısına əlavə et";

  return `
    <article class="market-card product-card${sourced ? " is-sourced-card" : ""}${sourced && realMedia ? " has-real-media" : ""}" data-product-id="${escapeAttr(product.id)}" data-source-priority="${getSourceQualityScore(product, "product")}">
      <div class="product-media">
        ${media}
      </div>
      <div class="product-card-body">
        <div class="product-meta">
          ${sourceBadge ? `<span class="source-priority-badge">${escapeHtml(sourceBadge)}</span>` : ""}
          <span>${escapeHtml(categoryTitle)}</span>
          <span>${escapeHtml(product.subcategory)}</span>
        </div>
        <h3>${escapeHtml(product.name)}</h3>
        <p class="product-sku">${escapeHtml(product.sku)}</p>
        <div class="product-attributes">
          <span>${escapeHtml(product.package)}</span>
          <span>${escapeHtml(product.origin)}</span>
          <span>${escapeHtml(product.availability)}</span>
        </div>
        <ul class="spec-list">
          ${(product.specs || []).map((spec) => `<li>${escapeHtml(spec)}</li>`).join("")}
        </ul>
      </div>
      <div class="product-card-footer">
        <div>
          <span class="price-label">Qiymət</span>
          <strong>${escapeHtml(product.price)}</strong>
          <small>${escapeHtml(product.priceNote)}</small>
          <small class="price-freshness ${freshness.className}">${escapeHtml(freshness.label)}</small>
          ${source}
          ${detailLink}
        </div>
        <div class="product-actions">
          <button class="icon-action ${isFavorite ? "is-active" : ""}" type="button" data-action="favorite" data-id="${escapeAttr(product.id)}" aria-pressed="${isFavorite}" aria-label="${isFavorite ? "Seçilmişlərdən çıxar" : "Seçilmişlərə əlavə et"}">♡</button>
          <button class="icon-action ${isCompared ? "is-active" : ""}" type="button" data-action="compare" data-id="${escapeAttr(product.id)}" aria-pressed="${isCompared}" aria-label="${isCompared ? "Müqayisədən çıxar" : "Müqayisəyə əlavə et"}">⇄</button>
        </div>
      </div>
      <div class="product-primary-actions">
        <button class="button button-secondary product-cart ${isInCart ? "is-active" : ""}" type="button" data-action="cart" data-id="${escapeAttr(product.id)}">${cartLabel}</button>
        ${projectActionButton("product", product.id)}
        <a class="button button-outline" href="rfq.html?product=${encodeURIComponent(product.id)}">Sorğu göndər</a>
      </div>
    </article>
  `;
};

const renderCatalog = () => {
  const productGrid = document.querySelector("[data-product-grid]");
  const categoryList = document.querySelector("[data-category-list]");
  const brandSelect = document.querySelector("[data-brand-filter]");
  const groupSelect = document.querySelector("[data-group-filter]");
  const subcategorySelect = document.querySelector("[data-subcategory-filter]");
  const availabilitySelect = document.querySelector("[data-availability-filter]");
  const priceSelect = document.querySelector("[data-price-filter]");
  const sourceSelect = document.querySelector("[data-source-filter]");
  const sortSelect = document.querySelector("[data-catalog-sort]");
  const originSelect = document.querySelector("[data-origin-filter]");
  const searchInput = document.querySelector("[data-search]");
  const searchSuggestions = document.querySelector("[data-search-suggestions]");
  const resultCount = document.querySelector("[data-result-count]");
  const emptyState = document.querySelector("[data-empty-state]");
  const activeFilterList = document.querySelector("[data-active-filter-list]");
  const pagination = document.querySelector("[data-catalog-pagination]");
  const filterToggle = document.querySelector("[data-catalog-filter-toggle]");
  const filterPanel = document.querySelector("[data-catalog-filter-panel]");
  const categoryToggle = document.querySelector("[data-catalog-category-toggle]");
  const categoryPanel = document.querySelector("[data-catalog-category-panel]");
  const scannerOpen = document.querySelector("[data-catalog-scanner-open]");
  const scannerDialog = document.querySelector("[data-catalog-scanner]");
  const scannerClose = document.querySelector("[data-catalog-scanner-close]");
  const scannerVideo = document.querySelector("[data-catalog-scanner-video]");
  const scannerStatus = document.querySelector("[data-catalog-scanner-status]");
  const assistantForm = document.querySelector("[data-catalog-assistant-form]");
  const assistantResult = document.querySelector("[data-catalog-assistant-result]");
  const assistantStatus = document.querySelector("[data-catalog-assistant-status]");
  const assistantSubmit = document.querySelector("[data-catalog-ai-submit]");

  if (!productGrid || !categoryList || !brandSelect || !searchInput) return;

  const setupResponsivePanel = (button, panel, showLabel, hideLabel) => {
    if (!button || !panel) return;
    const mobileQuery = window.matchMedia("(max-width: 820px)");
    const setOpen = (open) => {
      panel.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      button.textContent = open ? hideLabel : showLabel;
    };

    setOpen(!mobileQuery.matches);
    button.addEventListener("click", () => setOpen(panel.hidden));
    mobileQuery.addEventListener("change", (event) => setOpen(!event.matches));
  };

  setupResponsivePanel(filterToggle, filterPanel, "Filtrləri göstər", "Filtrləri gizlət");
  setupResponsivePanel(categoryToggle, categoryPanel, "Kateqoriyaları göstər", "Kateqoriyaları gizlət");

  let scannerStream = null;
  let scannerFrame = 0;
  let scannerRunning = false;
  const scannerSupported = Boolean(
    window.isSecureContext
    && navigator.mediaDevices?.getUserMedia
    && window.BarcodeDetector
    && scannerDialog
    && scannerVideo
  );
  if (scannerOpen) scannerOpen.hidden = !scannerSupported;

  const stopScanner = () => {
    scannerRunning = false;
    window.cancelAnimationFrame(scannerFrame);
    scannerFrame = 0;
    scannerStream?.getTracks().forEach((track) => track.stop());
    scannerStream = null;
    if (scannerVideo) scannerVideo.srcObject = null;
  };

  const closeScanner = () => {
    stopScanner();
    if (scannerDialog?.open) scannerDialog.close();
  };

  const startScanner = async () => {
    if (!scannerSupported || scannerRunning) return;
    scannerDialog.showModal();
    scannerStatus.textContent = "Kamera açılır...";
    try {
      scannerStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } }
      });
      scannerVideo.srcObject = scannerStream;
      await scannerVideo.play();
      const preferredFormats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"];
      const supportedFormats = typeof window.BarcodeDetector.getSupportedFormats === "function"
        ? await window.BarcodeDetector.getSupportedFormats()
        : preferredFormats;
      const formats = preferredFormats.filter((format) => supportedFormats.includes(format));
      const detector = new window.BarcodeDetector(formats.length ? { formats } : {});
      scannerRunning = true;
      scannerStatus.textContent = "Barkodu çərçivənin daxilində saxla.";
      const detect = async () => {
        if (!scannerRunning) return;
        try {
          const [result] = await detector.detect(scannerVideo);
          const value = String(result?.rawValue || "").trim();
          if (value) {
            searchEntry = "camera_barcode";
            searchInput.value = value;
            searchInput.dispatchEvent(new Event("input", { bubbles: true }));
            closeScanner();
            searchInput.focus();
            return;
          }
        } catch {
          scannerStatus.textContent = "Kamera işləyir. Barkodu sabit saxla.";
        }
        scannerFrame = window.requestAnimationFrame(detect);
      };
      scannerFrame = window.requestAnimationFrame(detect);
    } catch {
      stopScanner();
      scannerStatus.textContent = "Kamera icazəsi verilmədi və ya bu cihazda kamera açılmadı.";
    }
  };

  scannerOpen?.addEventListener("click", startScanner);
  scannerClose?.addEventListener("click", closeScanner);
  scannerDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeScanner();
  });
  scannerDialog?.addEventListener("close", stopScanner);
  window.addEventListener("pagehide", stopScanner, { once: true });

  const progressiveGrid = createProgressiveGrid(
    productGrid,
    pagination,
    createProductCard,
    getResponsivePageSize(36, 18)
  );
  let serverPage = 0;
  let serverProducts = [];
  let serverRequest = 0;
  let serverTimer = 0;
  let searchTrackTimer = 0;
  let lastSearchSignature = "";
  let searchEntry = "keyboard";
  let activeSuggestionIndex = -1;

  const catalogFilterSnapshot = () => ({
    category: activeCategory,
    group: groupSelect?.value || "all",
    subcategory: subcategorySelect?.value || "all",
    brand: brandSelect.value || "all",
    availability: availabilitySelect?.value || "all",
    priceStatus: priceSelect?.value || "all",
    sourceStatus: sourceSelect?.value || "all",
    origin: originSelect?.value || "all"
  });

  const trackCatalogSearch = (total, dataSource, delay = 250) => {
    window.clearTimeout(searchTrackTimer);
    const query = searchInput.value.trim();
    if (query.length < 2) return;
    const payload = {
      query: query.slice(0, 120),
      resultCount: Math.max(0, Number(total || 0)),
      dataSource,
      entry: searchEntry,
      ...catalogFilterSnapshot()
    };
    const signature = JSON.stringify(payload);
    searchTrackTimer = window.setTimeout(() => {
      if (signature === lastSearchSignature) return;
      lastSearchSignature = signature;
      window.ConstEraTrack?.("search", {
        entityType: "catalog",
        entityId: activeCategory,
        payload
      });
    }, delay);
  };

  const updateCatalogItemListSchema = (items, total) => {
    injectEntitySchema("constera-catalog-item-list-schema", {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "ConstEra tikinti materialları kataloqu",
      numberOfItems: Math.max(0, Number(total || 0)),
      itemListElement: (items || []).slice(0, 24).map((product, index) => {
        const price = parseProductPriceAmount(product);
        const image = getPublicImageUrl(product);
        return {
          "@type": "ListItem",
          position: index + 1,
          url: new URL(`/product-detail.html?product=${encodeURIComponent(product.id)}`, window.location.href).toString(),
          item: {
            "@type": "Product",
            name: product.name,
            sku: product.sku,
            category: `${getCategory(product.category)?.title || product.category} > ${product.subcategory}`,
            brand: { "@type": "Brand", name: product.brand },
            image: image ? new URL(image, window.location.href).toString() : undefined,
            offers: product.commerceReady !== true || price === null || price <= 0 ? undefined : {
              "@type": "Offer",
              price,
              priceCurrency: product.priceCurrency || "AZN",
              availability: normalize(product.availability).includes("anbar")
                ? "https://schema.org/InStock"
                : "https://schema.org/PreOrder"
            }
          }
        };
      })
    });
  };

  const hideSearchSuggestions = () => {
    if (!searchSuggestions) return;
    searchSuggestions.hidden = true;
    searchSuggestions.innerHTML = "";
    activeSuggestionIndex = -1;
    searchInput.setAttribute("aria-expanded", "false");
  };

  const setActiveSearchSuggestion = (index) => {
    if (!searchSuggestions || searchSuggestions.hidden) return;
    const buttons = [...searchSuggestions.querySelectorAll("[data-search-suggestion]")];
    if (!buttons.length) return;
    activeSuggestionIndex = (index + buttons.length) % buttons.length;
    buttons.forEach((button, buttonIndex) => {
      const active = buttonIndex === activeSuggestionIndex;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    buttons[activeSuggestionIndex]?.scrollIntoView({ block: "nearest" });
  };

  const renderSearchSuggestions = () => {
    if (!searchSuggestions) return;
    const query = searchInput.value.trim();
    if (normalizeSearchText(query).length < 2) {
      hideSearchSuggestions();
      return;
    }

    const seen = new Set();
    const suggestions = marketplace.products
      .filter((product) => matchesExpandedSearch([
        product.name,
        product.brand,
        product.sku,
        product.barcode,
        product.subcategory,
        product.package,
        ...(product.specs || [])
      ].join(" "), query))
      .sort((left, right) =>
        getProductSearchRelevance(right, query) - getProductSearchRelevance(left, query)
        || compareSourceQuality(left, right, "product"))
      .filter((product) => {
        const key = normalizeSearchText(product.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 7);

    if (!suggestions.length) {
      hideSearchSuggestions();
      return;
    }

    searchSuggestions.innerHTML = suggestions.map((product) => `
      <button
        type="button"
        role="option"
        aria-selected="false"
        data-search-suggestion
        data-value="${escapeAttr(product.name)}"
      >
        <strong>${escapeHtml(product.name)}</strong>
        <span>${escapeHtml([product.brand, product.subcategory].filter(Boolean).join(" · "))}</span>
      </button>
    `).join("");
    searchSuggestions.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
    activeSuggestionIndex = -1;
  };

  const params = new URLSearchParams(window.location.search);
  let activeCategory = marketplace.categories.some((category) => category.id === params.get("category"))
    ? params.get("category")
    : "all";

  const renderCategoryButtons = () => {
    const allCount = marketplace.products.length;
    categoryList.innerHTML = `
      <button class="category-filter ${activeCategory === "all" ? "is-active" : ""}" type="button" data-category="all">
        <span>Bütün kataloq</span>
        <strong>${allCount}</strong>
      </button>
      ${groupCategories(marketplace.categories).map((group) => `
        <div class="category-group-label">${escapeHtml(group.name)}</div>
        ${group.categories.map((category) => `
          <div class="category-filter-row">
            <button class="category-filter ${activeCategory === category.id ? "is-active" : ""}" type="button" data-category="${escapeAttr(category.id)}">
              <span>${escapeHtml(category.title)}</span>
              <strong>${countProductsBy("category", category.id)}</strong>
            </button>
            <a class="category-open-link" href="category.html?type=material&category=${encodeURIComponent(category.id)}">Aç</a>
          </div>
        `).join("")}
      `).join("")}
    `;
  };

  const renderGroupOptions = () => {
    if (!groupSelect) return;
    const groups = groupCategories(marketplace.categories);
    groupSelect.innerHTML = `
      <option value="all">Bütün qruplar</option>
      ${groups.map((group) => `<option value="${escapeAttr(group.name)}">${escapeHtml(group.name)}</option>`).join("")}
    `;
    const groupParam = params.get("group");
    if (groupParam && groups.some((group) => group.name === groupParam)) {
      groupSelect.value = groupParam;
    }
  };

  const renderBrandOptions = () => {
    const brandProducts = new Map();
    marketplace.products.forEach((product) => {
      const current = brandProducts.get(product.brand) || { total: 0, quality: 0 };
      current.total += 1;
      if (hasSourcedData(product)) current.quality += 1;
      brandProducts.set(product.brand, current);
    });
    const options = [...marketplace.brands]
      .filter((brand) => marketplace.products.some((product) => product.brand === brand.name))
      .sort((left, right) => {
        const leftCounts = brandProducts.get(left.name) || { total: 0, quality: 0 };
        const rightCounts = brandProducts.get(right.name) || { total: 0, quality: 0 };
        return rightCounts.quality - leftCounts.quality
          || rightCounts.total - leftCounts.total
          || left.name.localeCompare(right.name, "az");
      })
      .map((brand) => `<option value="${escapeAttr(brand.name)}">${escapeHtml(brand.name)}</option>`)
      .join("");

    brandSelect.innerHTML = `<option value="all">Bütün brendlər</option>${options}`;
    const brandParam = params.get("brand");
    if (brandParam && [...brandSelect.options].some((option) => option.value === brandParam)) {
      brandSelect.value = brandParam;
    }
  };

  const renderAvailabilityOptions = () => {
    if (!availabilitySelect) return;
    const values = [...new Set(marketplace.products.map((product) => product.availability).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "az"));
    availabilitySelect.innerHTML = `
      <option value="all">Bütün vəziyyətlər</option>
      ${values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)} (${countProductsBy("availability", value)})</option>`).join("")}
    `;
  };

  const getCategoryPool = () => {
    const selectedGroup = groupSelect?.value || "all";
    if (activeCategory !== "all") {
      return marketplace.categories.filter((category) => category.id === activeCategory);
    }
    if (selectedGroup !== "all") {
      return marketplace.categories.filter((category) => category.group === selectedGroup);
    }
    return marketplace.categories;
  };

  const renderSubcategoryOptions = () => {
    if (!subcategorySelect) return;
    const categoryIds = new Set(getCategoryPool().map((category) => category.id));
    const subcategories = [...new Set(
      marketplace.products
        .filter((product) => categoryIds.has(product.category))
        .map((product) => product.subcategory)
    )].sort((a, b) => a.localeCompare(b, "az"));
    subcategorySelect.innerHTML = `
      <option value="all">Bütün subkateqoriyalar</option>
      ${subcategories.map((subcategory) => `<option value="${escapeAttr(subcategory)}">${escapeHtml(subcategory)}</option>`).join("")}
    `;
    const subcategoryParam = params.get("subcategory");
    if (subcategoryParam && subcategories.includes(subcategoryParam)) {
      subcategorySelect.value = subcategoryParam;
    }
  };

  const applyParamDefaults = () => {
    if (params.get("q")) searchInput.value = params.get("q");
    if (availabilitySelect && params.get("availability")) availabilitySelect.value = params.get("availability");
    if (priceSelect && params.get("price")) priceSelect.value = params.get("price");
    if (sourceSelect && params.get("source")) sourceSelect.value = params.get("source");
    if (sortSelect && params.get("sort")) sortSelect.value = params.get("sort");
    if (originSelect && params.get("origin")) originSelect.value = params.get("origin");
  };

  const applyFilters = () => {
    const query = searchInput.value;
    const brand = brandSelect.value;
    const group = groupSelect?.value || "all";
    const subcategory = subcategorySelect?.value || "all";
    const availability = availabilitySelect?.value || "all";
    const priceStatus = priceSelect?.value || "all";
    const sourceStatus = sourceSelect?.value || "all";
    const sortMode = sortSelect?.value || "quality";
    const origin = originSelect?.value || "all";

    const filtered = marketplace.products.filter((product) => {
      const category = getCategory(product.category);
      const priceIsRequest = product.priceStatus !== "confirmed";
      const sourced = hasSourcedData(product);
      const realMedia = hasRealMedia(product);
      const matchesCategory = activeCategory === "all" || product.category === activeCategory;
      const matchesGroup = group === "all" || category?.group === group;
      const matchesSubcategory = subcategory === "all" || product.subcategory === subcategory;
      const matchesBrand = brand === "all" || product.brand === brand;
      const matchesAvailability = availability === "all" || product.availability === availability;
      const matchesPrice = priceStatus === "all" ||
        (priceStatus === "request" && priceIsRequest) ||
        (priceStatus === "confirmed" && !priceIsRequest);
      const matchesSource = sourceStatus === "all" ||
        (sourceStatus === "sourced" && sourced) ||
        (sourceStatus === "sourced-image" && sourced && realMedia) ||
        (sourceStatus === "unsourced" && !sourced);
      const originValue = normalize(product.origin);
      const isImported = originValue.includes("idxal") || originValue.includes("import");
      const matchesOrigin = origin === "all" ||
        (origin === "local" && originValue.includes("azərbaycan") && !isImported) ||
        (origin === "import" && isImported) ||
        (origin === "mixed" && originValue.includes("/") && originValue.includes("azərbaycan"));
      const searchable = normalize([
        product.name,
        product.brand,
        product.category,
        product.subcategory,
        product.sku,
        product.barcode,
        product.package,
        product.origin,
        product.supplier,
        product.sourceLabel,
        ...(product.specs || [])
      ].join(" "));
      const matchesQuery = matchesExpandedSearch(searchable, query);
      return matchesCategory &&
        matchesGroup &&
        matchesSubcategory &&
        matchesBrand &&
        matchesAvailability &&
        matchesPrice &&
        matchesSource &&
        matchesOrigin &&
        matchesQuery;
    });

    filtered.sort((left, right) => {
      if (sortMode === "name") return left.name.localeCompare(right.name, "az");
      if (sortMode === "price-asc") {
        const leftPrice = parseProductPriceAmount(left);
        const rightPrice = parseProductPriceAmount(right);
        if (leftPrice === null && rightPrice !== null) return 1;
        if (leftPrice !== null && rightPrice === null) return -1;
        if (leftPrice !== rightPrice) return Number(leftPrice || 0) - Number(rightPrice || 0);
      }
      if (sortMode === "price-desc") {
        const leftPrice = parseProductPriceAmount(left);
        const rightPrice = parseProductPriceAmount(right);
        if (leftPrice === null && rightPrice !== null) return 1;
        if (leftPrice !== null && rightPrice === null) return -1;
        if (leftPrice !== rightPrice) return Number(rightPrice || 0) - Number(leftPrice || 0);
      }
      if (normalize(query)) {
        const relevance = getProductSearchRelevance(right, query) - getProductSearchRelevance(left, query);
        if (relevance) return relevance;
      }
      return compareSourceQuality(left, right, "product");
    });

    progressiveGrid.setItems(filtered);
    if (resultCount) resultCount.textContent = `${filtered.length} məhsul`;
    if (emptyState) emptyState.hidden = filtered.length > 0;
    updateCatalogItemListSchema(filtered, filtered.length);
    trackCatalogSearch(filtered.length, "lokal_kataloq", 1_200);
    if (activeFilterList) {
      const chips = [
        activeCategory !== "all" ? getCategory(activeCategory)?.title : "",
        group !== "all" ? group : "",
        subcategory !== "all" ? subcategory : "",
        brand !== "all" ? brand : "",
        availability !== "all" ? availability : "",
        priceStatus === "request" ? "Sorğu qiyməti" : priceStatus === "confirmed" ? "Təsdiqli qiymət" : "",
        sourceStatus === "sourced" ? "Mənbəli məlumat" : sourceStatus === "sourced-image" ? "Mənbə + hüquqlu foto" : sourceStatus === "unsourced" ? "Mənbəsiz struktur" : "",
        origin === "local" ? "Azərbaycan" : origin === "import" ? "İdxal" : origin === "mixed" ? "Qarışıq mənşə" : ""
      ].filter(Boolean);
      activeFilterList.innerHTML = chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("");
      activeFilterList.hidden = chips.length === 0;
    }
  };

  const loadServerPage = async (append = false) => {
    if (window.CONSTERA_STATIC_PREVIEW || !window.ConstEraAPI?.catalog) return;
    const requestId = ++serverRequest;
    const page = append ? serverPage + 1 : 1;
    const filters = {
      page: String(page),
      pageSize: "96",
      scope: "products",
      sort: searchInput.value.trim() ? "relevance" : (sortSelect?.value === "name" ? "name"
        : sortSelect?.value === "price-asc" ? "price_asc"
          : sortSelect?.value === "price-desc" ? "price_desc" : "quality")
    };
    if (searchInput.value.trim()) filters.q = searchInput.value.trim();
    if (activeCategory !== "all") filters.category = activeCategory;
    else if (groupSelect?.value && groupSelect.value !== "all") filters.group = groupSelect.value;
    if (brandSelect.value !== "all") filters.brand = brandSelect.value;
    if (subcategorySelect?.value && subcategorySelect.value !== "all") filters.subcategory = subcategorySelect.value;
    if (availabilitySelect?.value && availabilitySelect.value !== "all") filters.availability = availabilitySelect.value;
    if (priceSelect?.value && priceSelect.value !== "all") filters.priceStatus = priceSelect.value;
    if (sourceSelect?.value && sourceSelect.value !== "all") filters.source = sourceSelect.value;
    if (originSelect?.value && originSelect.value !== "all") filters.origin = originSelect.value;

    try {
      const result = await window.ConstEraAPI.catalog(filters);
      if (requestId !== serverRequest) return;
      const products = result.data?.products || [];
      if (append) {
        const known = new Set(serverProducts.map((product) => product.id));
        serverProducts = [...serverProducts, ...products.filter((product) => !known.has(product.id))];
      } else {
        serverProducts = products;
      }
      serverPage = page;
      const total = Number(result.meta?.total || serverProducts.length);
      progressiveGrid.setItems(serverProducts, {
        total,
        preserveVisible: append,
        requestMore: () => loadServerPage(true)
      });
      if (resultCount) resultCount.textContent = `${total.toLocaleString("az-AZ")} məhsul`;
      if (emptyState) emptyState.hidden = total > 0;
      updateCatalogItemListSchema(serverProducts, total);
      trackCatalogSearch(total, "canlı_baza");
    } catch {
      if (!append) {
        serverPage = 0;
        serverProducts = [];
      }
    }
  };

  const scheduleServerSearch = (delay = 0) => {
    window.clearTimeout(serverTimer);
    serverTimer = window.setTimeout(() => loadServerPage(false), delay);
  };

  const applyCatalogFilters = (delay = 0) => {
    applyFilters();
    scheduleServerSearch(delay);
  };

  renderCategoryButtons();
  renderGroupOptions();
  renderBrandOptions();
  renderAvailabilityOptions();
  applyParamDefaults();
  renderSubcategoryOptions();
  applyCatalogFilters();

  const applyAssistantSearch = (query, sourceFilter = "all") => {
    searchEntry = "kataloq_köməkçisi";
    activeCategory = "all";
    categoryList.querySelectorAll(".category-filter").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.category === "all");
    });
    if (groupSelect) groupSelect.value = "all";
    brandSelect.value = "all";
    if (availabilitySelect) availabilitySelect.value = "all";
    if (priceSelect) priceSelect.value = "all";
    if (originSelect) originSelect.value = "all";
    if (sourceSelect) sourceSelect.value = [...sourceSelect.options].some((option) => option.value === sourceFilter)
      ? sourceFilter
      : "all";
    renderSubcategoryOptions();
    if (subcategorySelect) subcategorySelect.value = "all";
    searchInput.value = query;
    hideSearchSuggestions();
    applyCatalogFilters();
    searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const renderAssistantAnalysis = (analysis) => {
    if (!assistantResult) return;
    assistantResult.hidden = false;
    assistantResult.innerHTML = `
      <div>
        <strong>${escapeHtml(analysis.title)}</strong>
        <small>${escapeHtml(analysis.summary)}</small>
      </div>
      <div class="catalog-assistant-options">
        ${(analysis.searches || []).map((item) => `<button class="table-action" type="button" data-assistant-search="${escapeAttr(item.query)}" data-assistant-source="${escapeAttr(analysis.sourceFilter)}">${escapeHtml(item.label)}</button>`).join("")}
        ${(analysis.links || []).map((item) => `<a class="table-action" href="${escapeAttr(item.href)}">${escapeHtml(item.label)}</a>`).join("")}
        ${analysis.rfqRecommended ? '<a class="table-action" href="rfq.html">Qiymət sorğusu yarat</a>' : ""}
      </div>
    `;
  };

  let latestAiCatalogAdvice = null;
  const renderAiCatalogAdvice = () => {
    if (!assistantResult || !latestAiCatalogAdvice) return;
    const advice = latestAiCatalogAdvice.advice || {};
    const approvalStatus = latestAiCatalogAdvice.approval?.status || "pending";
    const sourceMap = new Map((latestAiCatalogAdvice.sources || []).map((source) => [source.id, source]));
    const confidence = Number.isFinite(Number(advice.confidence))
      ? `${Math.round(Number(advice.confidence) * 100)}%`
      : "-";
    assistantResult.hidden = false;
    assistantResult.innerHTML = `
      <div class="catalog-ai-summary">
        <strong>AI kataloq məsləhəti · ${escapeHtml(confidence)} etibar</strong>
        <small>${escapeHtml(advice.summary || "Uyğun seçimlər hazırlandı.")}</small>
        ${(advice.warnings || []).length ? `<small>Yoxlanmalı: ${(advice.warnings || []).map((item) => escapeHtml(item)).join(" · ")}</small>` : ""}
        ${(advice.questions || []).length ? `<small>Dəqiqləşdir: ${(advice.questions || []).map((item) => escapeHtml(item)).join(" · ")}</small>` : ""}
      </div>
      <div>
        <div class="catalog-ai-recommendations">
          ${(advice.recommendations || []).map((recommendation) => {
            const source = sourceMap.get(recommendation.productId) || {};
            const quantity = Number(recommendation.suggestedQuantity || 0);
            return `
              <article class="catalog-ai-recommendation">
                <strong>${escapeHtml(source.title || recommendation.title || recommendation.productId)}</strong>
                <span>${escapeHtml(source.brand || "Brend göstərilməyib")} · ${escapeHtml(source.price || "Sorğu əsasında")}</span>
                <small>${escapeHtml(recommendation.reason || "Uyğunluq kataloq məlumatına əsasən seçilib.")}</small>
                ${quantity > 0 ? `<small>Təklif edilən miqdar: ${escapeHtml(quantity)} ${escapeHtml(recommendation.suggestedUnit || "ədəd")}</small>` : ""}
                ${approvalStatus === "approved" ? `<div class="catalog-assistant-options"><a class="table-action" href="product-detail.html?product=${encodeURIComponent(recommendation.productId)}">Məhsula bax</a><a class="table-action" href="rfq.html?product=${encodeURIComponent(recommendation.productId)}">RFQ yarat</a></div>` : ""}
              </article>
            `;
          }).join("")}
        </div>
        <div class="catalog-assistant-options">
          ${approvalStatus === "pending" ? `<button class="button button-primary" type="button" data-ai-catalog-review data-run-id="${escapeAttr(latestAiCatalogAdvice.runId || "")}">Yoxladım, seçimləri təsdiqlə</button>` : ""}
          <span class="status-pill">${approvalStatus === "approved" ? "Təsdiqlənib" : approvalStatus === "rejected" ? "Rədd edilib" : "Təsdiq gözləyir"}</span>
        </div>
      </div>
    `;
  };

  assistantForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = assistantForm.elements.prompt.value.trim();
    const analysis = window.ConstEraCatalogAssistant?.analyze(prompt);
    if (!analysis) {
      if (assistantStatus) assistantStatus.textContent = "Kataloq köməkçisi yüklənmədi.";
      return;
    }
    renderAssistantAnalysis(analysis);
    const first = analysis.searches?.[0];
    if (first) {
      applyAssistantSearch(first.query, analysis.sourceFilter);
      if (assistantStatus) assistantStatus.textContent = `İlk seçim tətbiq edildi: ${first.label}. Digər istiqamətləri də seçə bilərsən.`;
    } else if (assistantStatus) {
      assistantStatus.textContent = "Uyğun xidmət və icarə bölmələri hazırlandı.";
    }
    if (!window.ConstEraAPI?.aiCatalogAdvice) return;
    if (assistantSubmit) assistantSubmit.disabled = true;
    try {
      if (assistantStatus) assistantStatus.textContent = "Kataloqdakı real məhsullar AI ilə uyğunlaşdırılır...";
      const response = await window.ConstEraAPI.aiCatalogAdvice({
        prompt,
        hints: (analysis.searches || []).map((item) => item.query)
      });
      latestAiCatalogAdvice = response.data || null;
      renderAiCatalogAdvice();
      if (assistantStatus) assistantStatus.textContent = "AI seçimi hazırdır. Məhsul əməliyyatlarını açmaq üçün nəticəni yoxlayıb təsdiqlə.";
    } catch (error) {
      if (assistantStatus) assistantStatus.textContent = error.code === "authentication_required"
        ? "Qayda əsaslı seçim tətbiq edildi. AI məsləhəti üçün hesabına daxil ol."
        : `Qayda əsaslı seçim tətbiq edildi. AI məsləhəti alınmadı: ${error.message}`;
    } finally {
      if (assistantSubmit) assistantSubmit.disabled = false;
    }
  });
  assistantResult?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-assistant-search]");
    if (button) {
      applyAssistantSearch(button.dataset.assistantSearch || "", button.dataset.assistantSource || "all");
      if (assistantStatus) assistantStatus.textContent = `Kataloq filtri tətbiq edildi: ${button.dataset.assistantSearch}.`;
      return;
    }
    const reviewButton = event.target.closest("[data-ai-catalog-review]");
    if (!reviewButton || !window.ConstEraAPI?.reviewAiRun) return;
    reviewButton.disabled = true;
    try {
      const response = await window.ConstEraAPI.reviewAiRun(
        reviewButton.dataset.runId,
        "approve",
        "İstifadəçi kataloq tövsiyələrini yoxladı və təsdiqlədi."
      );
      latestAiCatalogAdvice = {
        ...latestAiCatalogAdvice,
        approval: { ...latestAiCatalogAdvice.approval, status: response.data?.approvalStatus || "approved" }
      };
      renderAiCatalogAdvice();
      if (assistantStatus) assistantStatus.textContent = "AI seçimləri təsdiqləndi. Məhsul və RFQ keçidləri açıldı.";
    } catch (error) {
      if (assistantStatus) assistantStatus.textContent = error.message || "AI seçimi təsdiqlənmədi.";
      reviewButton.disabled = false;
    }
  });

  categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    activeCategory = button.dataset.category;
    if (groupSelect) groupSelect.value = "all";
    categoryList.querySelectorAll(".category-filter").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    renderSubcategoryOptions();
    applyCatalogFilters();
  });

  searchInput.addEventListener("input", (event) => {
    if (event.isTrusted) searchEntry = "klaviatura";
    renderSearchSuggestions();
    applyCatalogFilters(250);
  });
  searchInput.addEventListener("focus", renderSearchSuggestions);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideSearchSuggestions();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
    const buttons = [...(searchSuggestions?.querySelectorAll("[data-search-suggestion]") || [])];
    if (!buttons.length || searchSuggestions.hidden) return;
    if (event.key === "Enter") {
      if (activeSuggestionIndex < 0) return;
      event.preventDefault();
      buttons[activeSuggestionIndex]?.click();
      return;
    }
    event.preventDefault();
    setActiveSearchSuggestion(activeSuggestionIndex + (event.key === "ArrowDown" ? 1 : -1));
  });
  searchSuggestions?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-search-suggestion]");
    if (!button) return;
    searchEntry = "təklif";
    searchInput.value = button.dataset.value || "";
    hideSearchSuggestions();
    applyCatalogFilters();
    searchInput.focus();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".catalog-search-field")) hideSearchSuggestions();
  });
  brandSelect.addEventListener("change", () => applyCatalogFilters());
  groupSelect?.addEventListener("change", () => {
    if (groupSelect.value !== "all") {
      activeCategory = "all";
      categoryList.querySelectorAll(".category-filter").forEach((item) => {
        item.classList.toggle("is-active", item.dataset.category === "all");
      });
    }
    renderSubcategoryOptions();
    applyCatalogFilters();
  });
  subcategorySelect?.addEventListener("change", () => applyCatalogFilters());
  availabilitySelect?.addEventListener("change", () => applyCatalogFilters());
  priceSelect?.addEventListener("change", () => applyCatalogFilters());
  sourceSelect?.addEventListener("change", () => applyCatalogFilters());
  sortSelect?.addEventListener("change", () => applyCatalogFilters());
  originSelect?.addEventListener("change", () => applyCatalogFilters());
};

const renderBrands = () => {
  const grid = document.querySelector("[data-brand-grid]");
  if (!grid) return;

  const brands = [...marketplace.brands].sort((left, right) => {
    const leftProducts = marketplace.products.filter((product) => product.brand === left.name);
    const rightProducts = marketplace.products.filter((product) => product.brand === right.name);
    const leftSourced = leftProducts.filter(hasSourcedData).length;
    const rightSourced = rightProducts.filter(hasSourcedData).length;
    return rightSourced - leftSourced
      || rightProducts.length - leftProducts.length
      || left.name.localeCompare(right.name, "az");
  });

  grid.innerHTML = brands.map((brand) => {
    const brandProducts = marketplace.products.filter((product) => product.brand === brand.name);
    const productCount = brandProducts.length;
    const sourcedCount = brandProducts.filter(hasSourcedData).length;
    const segmentNames = brand.segments
      .map((segment) => getCategory(segment)?.title || segment)
      .join(", ");

    return `
      <article class="market-card brand-card">
        <div class="brand-mark">${escapeHtml(brand.name.slice(0, 2).toUpperCase())}</div>
        <span class="card-topline">${escapeHtml(brand.country)}</span>
        <h3>${escapeHtml(brand.name)}</h3>
        <p>${escapeHtml(segmentNames)}</p>
        <div class="market-card-metrics">
          <span>${productCount} məhsul</span>
          ${sourcedCount ? `<span class="source-priority-badge">${sourcedCount} mənbəli</span>` : ""}
          <span>${escapeHtml(brand.certification)}</span>
        </div>
        <a class="card-link" href="catalog.html?brand=${encodeURIComponent(brand.name)}">${escapeHtml(brand.website)}</a>
      </article>
    `;
  }).join("");
};

const renderSuppliers = () => {
  const grid = document.querySelector("[data-supplier-grid]");
  if (!grid) return;

  const suppliers = [...marketplace.suppliers].sort((left, right) => {
    const leftOfficial = normalize(left.status).includes("rəsmi") ? 1 : 0;
    const rightOfficial = normalize(right.status).includes("rəsmi") ? 1 : 0;
    return rightOfficial - leftOfficial || left.name.localeCompare(right.name, "az");
  });

  grid.innerHTML = suppliers.map((supplier) => `
    <article class="market-card supplier-card${normalize(supplier.status).includes("rəsmi") ? " is-sourced-card" : ""}">
      <span class="card-topline">${escapeHtml(supplier.type)}</span>
      <h3>${escapeHtml(supplier.name)}</h3>
      <p>${escapeHtml(supplier.focus)}</p>
      <dl class="supplier-list">
        <div><dt>Region</dt><dd>${escapeHtml(supplier.region)}</dd></div>
        <div><dt>Vəziyyət</dt><dd>${escapeHtml(supplier.status)}</dd></div>
        <div><dt>Sayt</dt><dd>${escapeHtml(supplier.website)}</dd></div>
        <div><dt>Əlaqə</dt><dd>${escapeHtml(supplier.contact || "Qiymət sorğusu ilə")}</dd></div>
        <div><dt>Reytinq</dt><dd>${escapeHtml(supplier.rating || "Yeni")}</dd></div>
        <div><dt>Cavab</dt><dd>${escapeHtml(supplier.responseTime || "Qiymət sorğusu əsasında")}</dd></div>
      </dl>
      <a class="button button-secondary" href="rfq.html?supplier=${encodeURIComponent(supplier.id)}">Təklif sorğusu</a>
    </article>
  `).join("");
};

const initSupplierApplication = () => {
  const form = document.querySelector("[data-supplier-application-form]");
  const status = document.querySelector("[data-supplier-application-status]");
  if (!form || !status) return;
  const setApplicationStatus = (message, type = "info") => {
    status.textContent = message;
    status.dataset.type = type;
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.ConstEraAPI?.applyAsSupplier) {
      setApplicationStatus("Müraciət xidməti hazırda əlçatan deyil.", "error");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Yoxlanılır...";
    try {
      const fields = Object.fromEntries(new FormData(form).entries());
      fields.legalAccepted = fields.legalAccepted === "true";
      fields.sourcePath = `${window.location.pathname}${window.location.search}`;
      const result = await window.ConstEraAPI.applyAsSupplier(fields);
      form.reset();
      form.elements.region.value = "Azərbaycan";
      setApplicationStatus(result.message || "Müraciət qəbul edildi.", "success");
    } catch (error) {
      setApplicationStatus(error.message || "Müraciət göndərilmədi.", "error");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
};

const createServiceCard = (service) => {
  const category = getServiceCategory(service.category);
  const sourceUrl = getSafeHttpsUrl(service.sourceUrl);
  const sourced = Boolean(sourceUrl);
  const sourceStatus = service.sourceVerified
    ? "Mənbəli xidmət"
    : sourced ? "Açıq elan" : "Sorğu kataloqu";

  return `
    <article class="market-card service-card${sourced ? " is-sourced-card" : ""}${service.sourceVerified ? " is-official-card" : ""}" data-service-id="${escapeAttr(service.id)}" data-source-priority="${getSourceQualityScore(service, "service")}">
      <div class="product-card-body">
        <div class="product-meta">
          <span>${escapeHtml(category?.title || service.category)}</span>
          <span>${escapeHtml(service.subcategory || "Ümumi")}</span>
          <span>${escapeHtml(service.type)}</span>
        </div>
        <h3>${escapeHtml(service.title)}</h3>
        ${service.providerName || service.city || sourced ? `
          <div class="package-source-row">
            <span class="mini-badge${service.sourceVerified ? " is-verified" : ""}">${escapeHtml(sourceStatus)}</span>
            ${service.providerName ? `<span>${escapeHtml(service.providerName)}</span>` : ""}
            ${service.city ? `<span>${escapeHtml(service.city)}</span>` : ""}
          </div>
        ` : ""}
        <div class="product-attributes">
          <span>${escapeHtml(service.unit)}</span>
          <span>${escapeHtml(service.leadTime)}</span>
        </div>
        <ul class="spec-list">
          ${(service.specs || []).map((spec) => `<li>${escapeHtml(spec)}</li>`).join("")}
        </ul>
        <div class="service-deliverables">
          ${(service.deliverables || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
      </div>
      <div class="product-card-footer">
        <div>
          <span class="price-label">Qiymət</span>
          <strong>${escapeHtml(service.price)}</strong>
          <small>${escapeHtml(service.priceConfirmationRequired ? "Qiymət iş həcminə görə yenidən təsdiqlənir" : service.team)}</small>
          <a class="source-link" href="service-detail.html?service=${encodeURIComponent(service.id)}">Detallı bax</a>
          ${sourceUrl ? `<a class="source-link" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">Mənbəni aç</a>` : ""}
        </div>
      </div>
      <div class="product-primary-actions">
        ${projectActionButton("service", service.id, "button button-secondary")}
        <a class="button button-outline" href="rfq.html?service=${encodeURIComponent(service.id)}">Xidmət sorğusu</a>
      </div>
    </article>
  `;
};

const packageLevelLabels = {
  ekonom: "Ekonom",
  standart: "Standart",
  premium: "Premium"
};
const getPackagePriceAmount = (pack) => {
  if (pack?.priceAmount === null || pack?.priceAmount === undefined || pack?.priceAmount === "") return null;
  const value = Number(pack?.priceAmount);
  return Number.isFinite(value) && value >= 0 ? value : null;
};
const getPackageSourceStatus = (pack) => {
  if (!pack?.sourceUrl) return "ConstEra paket strukturu";
  return pack.providerVerified ? "Rəsmi mənbə" : "Açıq bazar mənbəyi";
};

const createPackageCard = (pack) => {
  const category = getPackageCategory(pack.category);
  const sourceUrl = getSafeHttpsUrl(pack.sourceUrl);
  const sourced = Boolean(sourceUrl);
  const levelLabel = packageLevelLabels[pack.level] || "Paket";
  const oldPrice = Number(pack.oldPriceAmount);

  return `
    <article class="market-card service-card${sourced ? " is-sourced-card" : ""}${pack.providerVerified ? " is-official-card" : ""}" data-package-id="${escapeAttr(pack.id)}" data-source-priority="${getSourceQualityScore(pack, "package")}">
      <div class="product-card-body">
        <div class="product-meta">
          <span>${escapeHtml(category?.title || pack.category)}</span>
          <span>${escapeHtml(pack.subcategory || "Ümumi")}</span>
          <span>${escapeHtml(levelLabel)}</span>
          ${pack.providerName ? `<span>${escapeHtml(pack.providerName)}</span>` : ""}
        </div>
        <h3>${escapeHtml(pack.title)}</h3>
        <p class="product-sku">${escapeHtml(pack.idealFor)}</p>
        ${pack.providerName ? `
          <div class="package-source-row">
            <span class="mini-badge${pack.providerVerified ? " is-verified" : ""}">${escapeHtml(getPackageSourceStatus(pack))}</span>
            <span>${escapeHtml(pack.providerName)}</span>
            <span>${escapeHtml(levelLabel)}</span>
          </div>
        ` : ""}
        <div class="product-attributes">
          <span>${escapeHtml(pack.unit)}</span>
          <span>${escapeHtml(pack.timeline)}</span>
          <span>${escapeHtml(pack.team)}</span>
        </div>
        <ul class="spec-list">
          ${(pack.includes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
        <div class="service-deliverables">
          ${(pack.deliverables || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
      </div>
      <div class="product-card-footer">
        <div>
          <span class="price-label">Paket qiyməti</span>
          <strong>${escapeHtml(pack.price)}</strong>
          ${Number.isFinite(oldPrice) ? `<small class="package-old-price">Əvvəl ${escapeHtml(`${oldPrice} ${pack.priceCurrency || "AZN"} / ${pack.priceUnit || "m²"}`)}</small>` : ""}
          <small>${escapeHtml(pack.priceConfirmationRequired ? "Qiymət sorğusu ilə təsdiqlənir" : pack.timeline)}</small>
          <a class="source-link" href="package-detail.html?package=${encodeURIComponent(pack.id)}">Detallı bax</a>
          ${sourceUrl ? `<a class="source-link" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">Mənbəni aç</a>` : ""}
        </div>
      </div>
      <div class="product-primary-actions">
        ${projectActionButton("package", pack.id, "button button-secondary")}
        <a class="button button-outline" href="rfq.html?package=${encodeURIComponent(pack.id)}">Paket sorğusu</a>
      </div>
    </article>
  `;
};

const createRentalCard = (rental) => {
  const category = getRentalCategory(rental.category);
  const sourceUrl = getSafeHttpsUrl(rental.sourceUrl);
  const sourced = Boolean(sourceUrl);
  const realMedia = hasRealMedia(rental);
  const sourceStatus = rental.sourceOfficial
    ? "Rəsmi kataloq"
    : rental.sourceVerified ? "Mənbəli elan" : rental.sourceUrl ? "Açıq elan" : "Sorğu kataloqu";

  return `
    <article class="market-card rental-card${sourced ? " is-sourced-card" : ""}${rental.sourceOfficial ? " is-official-card" : ""}${sourced && realMedia ? " has-real-media" : ""}" data-rental-id="${escapeAttr(rental.id)}" data-source-priority="${getSourceQualityScore(rental, "rental")}">
      <div class="product-media rental-media">
        ${createProductMedia(rental, "İC")}
      </div>
      <div class="product-card-body">
        <div class="product-meta">
          <span>${escapeHtml(category?.title || rental.category)}</span>
          <span>${escapeHtml(rental.subcategory || "Ümumi")}</span>
          <span>${escapeHtml(rental.operator)}</span>
        </div>
        <h3>${escapeHtml(rental.name)}</h3>
        ${rental.city || rental.sourceUrl ? `
          <div class="package-source-row">
            <span class="mini-badge${rental.sourceOfficial ? " is-verified" : ""}">${escapeHtml(sourceStatus)}</span>
            ${rental.city ? `<span>${escapeHtml(rental.city)}</span>` : ""}
          </div>
        ` : ""}
        <div class="product-attributes">
          <span>${escapeHtml(rental.capacity)}</span>
          <span>${escapeHtml(rental.unit)}</span>
          <span>${escapeHtml(rental.delivery)}</span>
        </div>
        <ul class="spec-list">
          ${(rental.specs || []).map((spec) => `<li>${escapeHtml(spec)}</li>`).join("")}
        </ul>
      </div>
      <div class="product-card-footer">
        <div>
          <span class="price-label">İcarə qiyməti</span>
          <strong>${escapeHtml(rental.price)}</strong>
          <small>${escapeHtml(rental.priceConfirmationRequired ? "Qiymət və müddət sifariş zamanı təsdiqlənir" : rental.deposit)}</small>
          <a class="source-link" href="rental-detail.html?rental=${encodeURIComponent(rental.id)}">Detallı bax</a>
          ${sourceUrl ? `<a class="source-link" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">Mənbəni aç</a>` : ""}
        </div>
      </div>
      <div class="product-primary-actions">
        ${projectActionButton("rental", rental.id, "button button-secondary")}
        <a class="button button-outline" href="rfq.html?rental=${encodeURIComponent(rental.id)}">İcarə sorğusu</a>
      </div>
    </article>
  `;
};

const renderHomeSourcedShowcase = () => {
  const productGrid = document.querySelector("[data-home-sourced-products]");
  const packageGrid = document.querySelector("[data-home-sourced-packages]");
  const rentalGrid = document.querySelector("[data-home-sourced-rentals]");
  if (!productGrid || !packageGrid || !rentalGrid) return;

  const sourcedProducts = sortBySourceQuality(
    (marketplace.products || []).filter(hasSourcedData),
    "product"
  );
  const sourcedPackages = sortBySourceQuality(
    (marketplace.packages || []).filter(hasSourcedData),
    "package"
  );
  const sourcedRentals = sortBySourceQuality(
    (marketplace.rentals || []).filter(hasSourcedData),
    "rental"
  );

  productGrid.innerHTML = sourcedProducts.slice(0, 3).map(createProductCard).join("");
  packageGrid.innerHTML = sourcedPackages.slice(0, 3).map(createPackageCard).join("");
  rentalGrid.innerHTML = sourcedRentals.slice(0, 3).map(createRentalCard).join("");
  document.querySelectorAll("[data-home-source-count]").forEach((node) => {
    const counts = {
      products: sourcedProducts.length,
      packages: sourcedPackages.length,
      rentals: sourcedRentals.length
    };
    node.textContent = Number(counts[node.dataset.homeSourceCount] || 0).toLocaleString("az-AZ");
  });
};

const renderServices = () => {
  const grid = document.querySelector("[data-service-grid]");
  const categoryFilter = document.querySelector("[data-service-category-filter]") || document.querySelector("[data-service-filter]");
  const subcategoryFilter = document.querySelector("[data-service-subcategory-filter]");
  const sourceFilter = document.querySelector("[data-service-source-filter]");
  const count = document.querySelector("[data-service-count]");
  const pagination = document.querySelector("[data-service-pagination]");
  if (!grid || !categoryFilter) return;

  const services = marketplace.services || [];
  const categories = marketplace.serviceCategories || [];
  const progressiveGrid = createProgressiveGrid(grid, pagination, createServiceCard, getResponsivePageSize(18, 10));

  categoryFilter.innerHTML = renderGroupedCategoryOptions(categories, services, "Bütün kateqoriyalar");

  const renderSubcategoryOptions = () => {
    if (!subcategoryFilter) return;
    const activeCategory = categoryFilter.value;
    const options = getSubcategories(categories, activeCategory)
      .map((subcategory) => `
        <option value="${escapeAttr(subcategory)}">${escapeHtml(subcategory)} (${getFilteredSubcategoryCount(services, activeCategory, subcategory)})</option>
      `)
      .join("");
    subcategoryFilter.innerHTML = `<option value="all">Bütün subkateqoriyalar</option>${options}`;
  };

  const render = () => {
    const categoryValue = categoryFilter.value;
    const subcategoryValue = subcategoryFilter?.value || "all";
    const sourceValue = sourceFilter?.value || "all";
    const filtered = services.filter((service) => {
      const matchesCategory = categoryValue === "all" || service.category === categoryValue;
      const matchesSubcategory = subcategoryValue === "all" || service.subcategory === subcategoryValue;
      const sourced = hasSourcedData(service);
      const matchesSource = sourceValue === "all"
        || (sourceValue === "verified" && sourced && service.sourceVerified)
        || (sourceValue === "market" && sourced && !service.sourceVerified)
        || (sourceValue === "request" && !sourced);
      return matchesCategory && matchesSubcategory && matchesSource;
    }).sort((left, right) => compareSourceQuality(left, right, "service"));
    progressiveGrid.setItems(filtered);
    if (count) count.textContent = `${filtered.length} xidmət`;
  };

  categoryFilter.addEventListener("change", () => {
    renderSubcategoryOptions();
    render();
  });
  subcategoryFilter?.addEventListener("change", render);
  sourceFilter?.addEventListener("change", render);
  renderSubcategoryOptions();
  render();
};

const renderPackages = () => {
  const grid = document.querySelector("[data-package-grid]");
  const categoryFilter = document.querySelector("[data-package-category-filter]");
  const subcategoryFilter = document.querySelector("[data-package-subcategory-filter]");
  const levelFilter = document.querySelector("[data-package-level-filter]");
  const providerFilter = document.querySelector("[data-package-provider-filter]");
  const sourceFilter = document.querySelector("[data-package-source-filter]");
  const priceFilter = document.querySelector("[data-package-price-filter]");
  const count = document.querySelector("[data-package-count]");
  const pagination = document.querySelector("[data-package-pagination]");
  if (!grid || !categoryFilter) return;

  const packages = marketplace.packages || [];
  const categories = marketplace.packageCategories || [];
  const progressiveGrid = createProgressiveGrid(grid, pagination, createPackageCard, getResponsivePageSize(18, 10));

  categoryFilter.innerHTML = renderGroupedCategoryOptions(categories, packages, "Bütün paketlər");
  if (providerFilter) {
    const providers = [...new Set(packages.map((pack) => pack.providerName).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "az"));
    providerFilter.innerHTML = `
      <option value="all">Bütün provayderlər</option>
      ${providers.map((provider) => `<option value="${escapeAttr(provider)}">${escapeHtml(provider)}</option>`).join("")}
    `;
  }

  const renderSubcategoryOptions = () => {
    if (!subcategoryFilter) return;
    const activeCategory = categoryFilter.value;
    const options = getSubcategories(categories, activeCategory)
      .map((subcategory) => `
        <option value="${escapeAttr(subcategory)}">${escapeHtml(subcategory)} (${getFilteredSubcategoryCount(packages, activeCategory, subcategory)})</option>
      `)
      .join("");
    subcategoryFilter.innerHTML = `<option value="all">Bütün subkateqoriyalar</option>${options}`;
  };

  const render = () => {
    const categoryValue = categoryFilter.value;
    const subcategoryValue = subcategoryFilter?.value || "all";
    const levelValue = levelFilter?.value || "all";
    const providerValue = providerFilter?.value || "all";
    const sourceValue = sourceFilter?.value || "all";
    const maximumPrice = Number(priceFilter?.value || 0);
    const filtered = packages.filter((pack) => {
      const matchesCategory = categoryValue === "all" || pack.category === categoryValue;
      const matchesSubcategory = subcategoryValue === "all" || pack.subcategory === subcategoryValue;
      const matchesLevel = levelValue === "all" || pack.level === levelValue;
      const matchesProvider = providerValue === "all" || pack.providerName === providerValue;
      const sourced = hasSourcedData(pack);
      const matchesSource = sourceValue === "all"
        || (sourceValue === "official" && sourced && pack.providerVerified)
        || (sourceValue === "market" && sourced && !pack.providerVerified)
        || (sourceValue === "structure" && !sourced);
      const amount = getPackagePriceAmount(pack);
      const matchesPrice = !maximumPrice || (amount !== null && amount <= maximumPrice);
      return matchesCategory && matchesSubcategory && matchesLevel && matchesProvider && matchesSource && matchesPrice;
    }).sort((left, right) => compareSourceQuality(left, right, "package"));
    progressiveGrid.setItems(filtered);
    if (count) count.textContent = `${filtered.length} paket`;
  };

  categoryFilter.addEventListener("change", () => {
    renderSubcategoryOptions();
    render();
  });
  subcategoryFilter?.addEventListener("change", render);
  levelFilter?.addEventListener("change", render);
  providerFilter?.addEventListener("change", render);
  sourceFilter?.addEventListener("change", render);
  priceFilter?.addEventListener("change", render);
  renderSubcategoryOptions();
  render();
};

const renderRentals = () => {
  const grid = document.querySelector("[data-rental-grid]");
  const categoryFilter = document.querySelector("[data-rental-category-filter]") || document.querySelector("[data-rental-filter]");
  const subcategoryFilter = document.querySelector("[data-rental-subcategory-filter]");
  const cityFilter = document.querySelector("[data-rental-city-filter]");
  const periodFilter = document.querySelector("[data-rental-period-filter]");
  const sourceFilter = document.querySelector("[data-rental-source-filter]");
  const priceFilter = document.querySelector("[data-rental-price-filter]");
  const count = document.querySelector("[data-rental-count]");
  const pagination = document.querySelector("[data-rental-pagination]");
  if (!grid || !categoryFilter) return;

  const rentals = marketplace.rentals || [];
  const categories = marketplace.rentalCategories || [];
  const progressiveGrid = createProgressiveGrid(grid, pagination, createRentalCard, getResponsivePageSize(18, 10));

  categoryFilter.innerHTML = renderGroupedCategoryOptions(categories, rentals, "Bütün kateqoriyalar");
  if (cityFilter) {
    const cities = [...new Set(rentals.map((rental) => rental.city).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "az"));
    cityFilter.innerHTML = `<option value="all">Bütün şəhərlər</option>${cities
      .map((city) => `<option value="${escapeAttr(city)}">${escapeHtml(city)}</option>`).join("")}`;
  }
  if (periodFilter) {
    const periods = [...new Set(rentals.flatMap((rental) => rental.rentalPeriods || []))]
      .sort((left, right) => left.localeCompare(right, "az"));
    periodFilter.innerHTML = `<option value="all">Bütün müddətlər</option>${periods
      .map((period) => `<option value="${escapeAttr(period)}">${escapeHtml(period)}</option>`).join("")}`;
  }

  const renderSubcategoryOptions = () => {
    if (!subcategoryFilter) return;
    const activeCategory = categoryFilter.value;
    const options = getSubcategories(categories, activeCategory)
      .map((subcategory) => `
        <option value="${escapeAttr(subcategory)}">${escapeHtml(subcategory)} (${getFilteredSubcategoryCount(rentals, activeCategory, subcategory)})</option>
      `)
      .join("");
    subcategoryFilter.innerHTML = `<option value="all">Bütün subkateqoriyalar</option>${options}`;
  };

  const render = () => {
    const categoryValue = categoryFilter.value;
    const subcategoryValue = subcategoryFilter?.value || "all";
    const cityValue = cityFilter?.value || "all";
    const periodValue = periodFilter?.value || "all";
    const sourceValue = sourceFilter?.value || "all";
    const priceValue = priceFilter?.value || "all";
    const filtered = rentals.filter((rental) => {
      const matchesCategory = categoryValue === "all" || rental.category === categoryValue;
      const matchesSubcategory = subcategoryValue === "all" || rental.subcategory === subcategoryValue;
      const matchesCity = cityValue === "all" || rental.city === cityValue;
      const matchesPeriod = periodValue === "all" || (rental.rentalPeriods || []).includes(periodValue);
      const sourced = hasSourcedData(rental);
      const realMedia = hasRealMedia(rental);
      const matchesSource = sourceValue === "all"
        || (sourceValue === "official" && sourced && rental.sourceOfficial)
        || (sourceValue === "sourced-image" && sourced && realMedia)
        || (sourceValue === "sourced" && sourced)
        || (sourceValue === "structure" && !sourced);
      const amount = Number(rental.priceAmount);
      const hasAmount = rental.priceAmount !== null && rental.priceAmount !== undefined && Number.isFinite(amount) && amount >= 0;
      const matchesPrice = priceValue === "all"
        || (priceValue === "request" ? !hasAmount : hasAmount && amount <= Number(priceValue));
      return matchesCategory && matchesSubcategory && matchesCity && matchesPeriod && matchesSource && matchesPrice;
    }).sort((left, right) => compareSourceQuality(left, right, "rental"));
    progressiveGrid.setItems(filtered);
    if (count) count.textContent = `${filtered.length} avadanlıq`;
  };

  categoryFilter.addEventListener("change", () => {
    renderSubcategoryOptions();
    render();
  });
  subcategoryFilter?.addEventListener("change", render);
  cityFilter?.addEventListener("change", render);
  periodFilter?.addEventListener("change", render);
  sourceFilter?.addEventListener("change", render);
  priceFilter?.addEventListener("change", render);
  renderSubcategoryOptions();
  render();
};

const renderProductDetail = () => {
  const container = document.querySelector("[data-product-detail]");
  if (!container) return;

  const productId = getQueryParam("product");
  const product = productId
    ? marketplace.products.find((item) => item.id === productId)
    : marketplace.products[0];
  const paintProduct = (item) => {
    const category = getCategory(item.category);
    const brand = getBrand(item.brand);
    const brandMark = item.brand.split(" ").map((word) => word[0]).join("").slice(0, 3);
    const gallery = (item.gallery || [])
      .map((entry) => ({ ...entry, url: getPublicImageUrl(item, entry.url) }))
      .filter((entry) => entry.url);
    const primaryImage = gallery[0]?.url || getPublicImageUrl(item);
    const media = primaryImage
      ? `<img data-product-image data-detail-main-image src="${escapeAttr(primaryImage)}" alt="${escapeAttr(item.name)}" width="760" height="570" decoding="async" referrerpolicy="no-referrer">`
      : createProductMedia(item, brandMark);
    const freshness = getPriceFreshness(item);
    const sourceUrl = getSafeHttpsUrl(item.sourceUrl);
    const source = sourceUrl
      ? `<a class="button button-secondary" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.sourceLabel || "Mənbəni aç")}</a>`
      : "";
    const priceHistory = Array.isArray(item.priceHistory) ? item.priceHistory : [];
    const documents = (Array.isArray(item.documents) ? item.documents : [])
      .map((document) => ({ ...document, url: getSafeHttpsUrl(document.url) }))
      .filter((document) => document.url);
    const pricedHistory = priceHistory.filter((entry) => Number.isFinite(Number(entry.amount)));
    const newestPrice = pricedHistory[0];
    const previousPrice = pricedHistory[1];
    const priceDelta = newestPrice && previousPrice && Number(previousPrice.amount) > 0
      ? ((Number(newestPrice.amount) - Number(previousPrice.amount)) / Number(previousPrice.amount)) * 100
      : null;
    const explicitRelatedProducts = Array.isArray(item.relatedProducts) ? item.relatedProducts : [];
    const fallbackRelatedProducts = marketplace.products
      .filter((candidate) => candidate.id !== item.id && (
        candidate.subcategory === item.subcategory || candidate.category === item.category
      ))
      .sort((left, right) => {
        const leftSubcategoryMatch = left.subcategory === item.subcategory ? 1 : 0;
        const rightSubcategoryMatch = right.subcategory === item.subcategory ? 1 : 0;
        return rightSubcategoryMatch - leftSubcategoryMatch || compareSourceQuality(left, right, "product");
      })
      .slice(0, 4);
    const relatedProducts = explicitRelatedProducts.length ? explicitRelatedProducts : fallbackRelatedProducts;
    const verifiedDate = item.priceVerifiedAt && Number.isFinite(Date.parse(item.priceVerifiedAt))
      ? new Date(item.priceVerifiedAt).toLocaleDateString("az-AZ")
      : "Yoxlanmayıb";
    const stockText = item.stockQuantity === null || item.stockQuantity === "" || item.stockQuantity === undefined
      ? item.availability
      : `${Number(item.stockQuantity).toLocaleString("az-AZ")} vahid`;
    const productOffers = Array.isArray(item.offers) ? item.offers : [];
    const preferredOffer = item.preferredOffer || productOffers[0] || null;
    const selectedCommercialReady = preferredOffer?.commercialReady === true || item.commerceReady === true;
    const productAttributes = getProductAttributes(item);
    const cartEntry = getCart().find((entry) => entry.id === item.id);
    const defaultComparisonQuantity = Math.max(
      1,
      Number(preferredOffer?.minimumOrder ?? item.minimumOrder ?? 1) || 1
    );

    document.title = `${item.name} | ConstEra Kataloq`;
    updatePageDescription(`${item.name}: ${item.brand}, ${item.subcategory}, ${item.price}. ConstEra kataloqunda qiymət sorğusu göndər və təchizatçı məlumatını yoxla.`);
    container.innerHTML = `
    <div class="detail-hero glass">
      <div class="detail-media">
        ${media}
        ${gallery.length > 1 ? `<div class="detail-gallery-thumbs" aria-label="Məhsul şəkilləri">${gallery.map((entry, index) => `
          <button type="button" data-gallery-image="${escapeAttr(entry.url)}" aria-label="${index + 1}-ci şəkli göstər">
            <img src="${escapeAttr(entry.url)}" alt="${escapeAttr(entry.alt || item.name)}" width="72" height="54" loading="lazy" decoding="async" referrerpolicy="no-referrer">
          </button>
        `).join("")}</div>` : ""}
      </div>
      <div class="detail-copy">
        <p class="eyebrow">Məhsul detalı</p>
        <h1>${escapeHtml(item.name)}</h1>
        <div class="product-meta detail-tags">
          <span>${escapeHtml(category?.title || item.category)}</span>
          <span>${escapeHtml(item.subcategory)}</span>
          <span>${escapeHtml(item.brand)}</span>
        </div>
        <p class="hero-text">${escapeHtml(item.package || "Qablaşdırma sorğu ilə")} · ${escapeHtml(item.origin || "Mənşə dəqiqləşdirilir")} · ${escapeHtml(item.availability || "Stok sorğu ilə")}</p>
        <div class="detail-actions">
          <button class="button button-secondary" type="button" data-action="cart" data-id="${escapeAttr(item.id)}" data-offer-id="${escapeAttr(cartEntry?.offerId || preferredOffer?.id || "")}">${cartEntry ? selectedCommercialReady ? "Səbətdədir" : "Sorğu siyahısındadır" : selectedCommercialReady ? "Səbətə əlavə et" : "Sorğu siyahısına əlavə et"}</button>
          ${projectActionButton("product", item.id)}
          <a class="button button-primary" href="rfq.html?product=${encodeURIComponent(item.id)}">Sorğu göndər</a>
          <a class="button button-outline" href="catalog.html">Kataloqa qayıt</a>
          ${source}
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <article class="detail-panel glass">
        <span class="price-label">Qiymət</span>
        <strong>${escapeHtml(item.price)}</strong>
        <p>${escapeHtml(item.priceNote || "Qiymət təchizatçı tərəfindən təsdiqlənməlidir.")}</p>
        <small class="price-freshness ${freshness.className}">${escapeHtml(freshness.label)}</small>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">SKU</span>
        <strong>${escapeHtml(item.sku)}</strong>
        <p>${item.barcode ? `Barkod: ${escapeHtml(item.barcode)} · ` : ""}${escapeHtml(item.package)} · ${escapeHtml(item.origin)}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Təchizatçı</span>
        <strong>${escapeHtml(item.supplier || "Açıq təchizatçı sorğusu")}</strong>
        <p>${escapeHtml(stockText)}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Son qiymət yoxlaması</span>
        <strong>${escapeHtml(verifiedDate)}</strong>
        <p>${escapeHtml(item.sourceLabel || (sourceUrl ? "Mənbəli məlumat" : "Mənbə gözlənilir"))}</p>
      </article>
    </div>

    ${productOffers.length ? `
      <section class="detail-data-section product-offer-section" aria-labelledby="product-offers-title">
        <div class="market-section-heading">
          <div>
            <p class="eyebrow">Təchizatçı müqayisəsi</p>
            <h2 id="product-offers-title">${productOffers.length} aktiv təklif</h2>
          </div>
          <span class="data-badge">Qiymət · stok · müddət</span>
        </div>
        <div class="product-offer-grid">
          ${productOffers.map((offer, index) => {
            const isSelected = (cartEntry?.offerId || preferredOffer?.id) === offer.id;
            const offerPrice = offer.priceStatus === "confirmed" && offer.unitPrice !== null
              ? formatMoney(offer.unitPrice, offer.currency || "AZN")
              : "Sorğu əsasında";
            const offerStock = offer.stockQuantity === null ? "Stok sorğu ilə" : `${Number(offer.stockQuantity).toLocaleString("az-AZ")} vahid`;
            return `<article class="product-offer-card ${isSelected ? "is-selected" : ""}" data-product-offer-card="${escapeAttr(offer.id)}">
              <header>
                <div><strong>${escapeHtml(offer.supplier || "Təchizatçı")}</strong><span>${escapeHtml(offer.supplierRegion || "Azərbaycan")}</span></div>
                ${index === 0 ? '<span class="mini-badge">Uyğun təklif</span>' : ""}
              </header>
              <div class="product-offer-price"><strong>${escapeHtml(offerPrice)}</strong><small>${escapeHtml(offer.supplierSku || item.sku)}</small></div>
              <dl>
                <div><dt>Stok</dt><dd>${escapeHtml(offerStock)}</dd></div>
                <div><dt>Minimum</dt><dd>${offer.minimumOrder === null ? "Sorğu ilə" : escapeHtml(Number(offer.minimumOrder).toLocaleString("az-AZ"))}</dd></div>
                <div><dt>Təslimat</dt><dd>${offer.leadTimeDays === null ? "Dəqiqləşdirilir" : `${escapeHtml(offer.leadTimeDays)} gün`}</dd></div>
              </dl>
              <small>${offer.commercialReady ? "Satış üçün kommersiya yoxlaması tamamlanıb" : escapeHtml((offer.commercialIssues || ["Qiymət sorğusu tələb olunur"]).join(" · "))}</small>
              <button class="button ${isSelected ? "button-primary" : "button-outline"}" type="button" data-offer-choice="${escapeAttr(offer.id)}">${isSelected ? "Seçilib" : "Bu təklifi seç"}</button>
            </article>`;
          }).join("")}
        </div>
        <form class="admin-form-grid" data-landed-cost-form>
          <label class="admin-field">
            <span>Miqdar</span>
            <input name="quantity" type="number" min="0.001" max="1000000" step="0.001" inputmode="decimal" value="${escapeAttr(defaultComparisonQuantity)}" required />
          </label>
          <label class="admin-field">
            <span>Çatdırılma şəhəri</span>
            <select name="city">
              <option value="Bakı">Bakı</option>
              <option value="Xırdalan">Xırdalan / Abşeron</option>
              <option value="Sumqayıt">Sumqayıt</option>
              <option value="Gəncə">Gəncə</option>
              <option value="Azərbaycan">Digər rayon</option>
            </select>
          </label>
          <label class="admin-field">
            <span>Çatdırılma üsulu</span>
            <select name="mode">
              <option value="delivery">ConstEra logistika</option>
              <option value="supplier_delivery">Təchizatçı çatdırması</option>
              <option value="pickup">Anbardan götürmə</option>
            </select>
          </label>
          <button class="button button-secondary" type="submit">Yekun mayanı hesabla</button>
        </form>
        <p class="admin-import-status" data-landed-cost-status role="status" aria-live="polite">
          Məhsul və logistika xərci birlikdə serverdə hesablanır.
        </p>
        <div class="product-offer-grid" data-landed-cost-results></div>
        <p class="checkout-summary-note">Qiymət və stok sifariş göndərilərkən serverdə yenidən yoxlanılır.</p>
      </section>
    ` : ""}

    <div class="detail-two-column">
      <article class="detail-panel glass">
        <p class="eyebrow">Texniki xüsusiyyətlər</p>
        ${productAttributes.length ? `
          <dl class="detail-procurement-list product-attribute-list">
            ${productAttributes.map((attribute) => `
              <div><dt>${escapeHtml(attribute.label)}</dt><dd>${escapeHtml(attribute.value)}</dd></div>
            `).join("")}
          </dl>
        ` : ""}
        <ul class="spec-list detail-list">
          ${(item.specs || []).map((spec) => `<li>${escapeHtml(spec)}</li>`).join("")}
        </ul>
      </article>
      <article class="detail-panel glass">
        <p class="eyebrow">Satınalma məlumatı</p>
        <dl class="detail-procurement-list">
          <div><dt>Minimum sifariş</dt><dd>${item.minimumOrder === null || item.minimumOrder === "" || item.minimumOrder === undefined ? "Sorğu ilə" : escapeHtml(Number(item.minimumOrder).toLocaleString("az-AZ"))}</dd></div>
          <div><dt>Stok</dt><dd>${escapeHtml(stockText || "Sorğu ilə")}</dd></div>
          <div><dt>Qiymət statusu</dt><dd>${item.priceStatus === "confirmed" ? "Təsdiqli" : item.priceStatus === "expired" ? "Vaxtı keçib" : "Sorğu əsasında"}</dd></div>
          <div><dt>Zəmanət</dt><dd>${escapeHtml(item.warranty || "Təchizatçı ilə dəqiqləşdirilir")}</dd></div>
          <div><dt>Mənbə</dt><dd>${sourceUrl ? `<a class="source-link" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.sourceLabel || "Mənbəni aç")}</a>` : "Mənbə əlavə edilməyib"}</dd></div>
        </dl>
      </article>
    </div>

    ${documents.length ? `
      <section class="detail-data-section" aria-labelledby="product-documents-title">
        <div class="market-section-heading">
          <div>
            <p class="eyebrow">Rəsmi sənədlər</p>
            <h2 id="product-documents-title">Sertifikat, texniki pasport və təlimatlar</h2>
          </div>
          <span class="data-badge">${documents.length} sənəd</span>
        </div>
        <div class="price-history-list">
          ${documents.map((document) => `
            <article class="price-history-item">
              <strong>${escapeHtml(document.title || document.filename || "Məhsul sənədi")}</strong>
              <span>${escapeHtml(document.contentType || "Sənəd")} · istifadə hüququ təsdiqlidir</span>
              <a class="source-link" href="${escapeAttr(document.url)}" target="_blank" rel="noopener noreferrer">Sənədi aç</a>
            </article>
          `).join("")}
        </div>
      </section>
    ` : ""}

    <section class="detail-data-section" aria-labelledby="price-history-title">
      <div class="market-section-heading">
        <div>
          <p class="eyebrow">Qiymət tarixçəsi</p>
          <h2 id="price-history-title">Son təsdiqli qiymətlər</h2>
        </div>
        <span class="data-badge">${priceDelta === null ? `${priceHistory.length} qeyd` : `${priceDelta > 0 ? "+" : ""}${priceDelta.toFixed(1)}% dəyişmə`}</span>
      </div>
      <div class="price-history-list">
        ${priceHistory.length ? priceHistory.slice(0, 6).map((entry) => `
          <article class="price-history-item">
            <strong>${entry.amount === null ? escapeHtml(entry.price || "Sorğu əsasında") : formatMoney(entry.amount, entry.currency || "AZN")}</strong>
            <span>${Number.isFinite(Date.parse(entry.capturedAt)) ? new Date(entry.capturedAt).toLocaleString("az-AZ") : "Tarix yoxdur"}</span>
            ${getSafeHttpsUrl(entry.sourceUrl) ? `<a class="source-link" href="${escapeAttr(getSafeHttpsUrl(entry.sourceUrl))}" target="_blank" rel="noopener noreferrer">Mənbə</a>` : ""}
          </article>
        `).join("") : '<p class="admin-import-status">Bu məhsul üçün təsdiqli qiymət tarixçəsi hələ yaranmayıb.</p>'}
      </div>
    </section>

    ${relatedProducts.length ? `
      <section class="detail-data-section" aria-labelledby="related-products-title">
        <div class="market-section-heading">
          <div>
            <p class="eyebrow">Eyni kateqoriya</p>
            <h2 id="related-products-title">Oxşar məhsullar</h2>
          </div>
          <a class="source-link" href="category.html?category=${encodeURIComponent(item.category)}">Kateqoriyanı aç</a>
        </div>
        <div class="product-grid">${relatedProducts.map(createProductCard).join("")}</div>
      </section>
    ` : ""}
  `;
    container.querySelectorAll("[data-gallery-image]").forEach((button) => {
      button.addEventListener("click", () => {
        const mainImage = container.querySelector("[data-detail-main-image]");
        if (!mainImage) return;
        mainImage.src = button.dataset.galleryImage;
        container.querySelectorAll("[data-gallery-image]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      });
    });
    const selectProductOffer = (offerId) => {
      container.querySelectorAll("[data-product-offer-card]").forEach((card) => {
        const selected = card.dataset.productOfferCard === offerId;
        card.classList.toggle("is-selected", selected);
        const choice = card.querySelector("[data-offer-choice]");
        if (choice) {
          choice.className = `button ${selected ? "button-primary" : "button-outline"}`;
          choice.textContent = selected ? "Seçilib" : "Bu təklifi seç";
        }
      });
      const cartButton = container.querySelector('[data-action="cart"]');
      if (!cartButton) return;
      cartButton.dataset.offerId = offerId;
      const existing = getCart().some((entry) => entry.id === item.id);
      if (existing) {
        saveCart(getCart().map((entry) => entry.id === item.id ? { ...entry, offerId } : entry));
        cartButton.textContent = "Səbətdə yeniləndi";
        updateCartIndicators();
      }
    };
    container.querySelectorAll("[data-offer-choice]").forEach((button) => {
      button.addEventListener("click", () => selectProductOffer(button.dataset.offerChoice));
    });
    const landedCostForm = container.querySelector("[data-landed-cost-form]");
    const landedCostStatus = container.querySelector("[data-landed-cost-status]");
    const landedCostResults = container.querySelector("[data-landed-cost-results]");
    const renderLandedCosts = (result) => {
      const offers = result?.offers || [];
      landedCostResults.innerHTML = offers.length ? offers.map((offer) => `
        <article class="product-offer-card ${offer.recommended ? "is-selected" : ""}">
          <header>
            <div>
              <strong>${escapeHtml(offer.supplier || "Təchizatçı")}</strong>
              <span>${escapeHtml(offer.deliveryZone || offer.supplierRegion || "Azərbaycan")}</span>
            </div>
            ${offer.recommended ? '<span class="mini-badge">Ən sərfəli</span>' : ""}
          </header>
          <dl>
            <div><dt>Məhsullar</dt><dd>${offer.subtotal === null ? "Sorğu ilə" : formatMoney(offer.subtotal)}</dd></div>
            <div><dt>Logistika</dt><dd>${formatMoney(offer.deliveryAmount)}</dd></div>
            <div><dt>Yekun maya</dt><dd>${offer.landedTotal === null ? "Sorğu ilə" : formatMoney(offer.landedTotal)}</dd></div>
            <div><dt>Vahidə düşən</dt><dd>${offer.effectiveUnitCost === null ? "Sorğu ilə" : formatMoney(offer.effectiveUnitCost)}</dd></div>
            <div><dt>Ümumi müddət</dt><dd>${escapeHtml(`${offer.totalEtaMinDays}-${offer.totalEtaMaxDays} gün`)}</dd></div>
          </dl>
          ${offer.eligible
            ? `<button class="button ${offer.recommended ? "button-primary" : "button-outline"}" type="button" data-landed-offer-choice="${escapeAttr(offer.id)}">Təklifi seç</button>`
            : `<small>${escapeHtml((offer.reasons || []).join(" · ") || "Bu şərtlərlə uyğun deyil")}</small>`}
        </article>
      `).join("") : '<p class="admin-import-status">Bu məhsul üçün müqayisə ediləcək aktiv təklif yoxdur.</p>';
      landedCostResults.querySelectorAll("[data-landed-offer-choice]").forEach((button) => {
        button.addEventListener("click", () => {
          selectProductOffer(button.dataset.landedOfferChoice);
          landedCostStatus.textContent = "Təklif səbət üçün seçildi.";
          landedCostStatus.dataset.type = "success";
        });
      });
    };
    const runLandedCostComparison = async () => {
      if (!landedCostForm || !window.ConstEraAPI?.landedCost) return;
      const fields = Object.fromEntries(new FormData(landedCostForm).entries());
      const submit = landedCostForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      landedCostStatus.textContent = "Yekun maya hesablanır...";
      try {
        const response = await window.ConstEraAPI.landedCost(item.id, fields.quantity, fields.city, fields.mode);
        renderLandedCosts(response.data);
        const eligibleCount = response.data.offers.filter((offer) => offer.eligible).length;
        landedCostStatus.textContent = `${eligibleCount}/${response.data.offers.length} təklif seçilmiş şərtlərə uyğundur.`;
        landedCostStatus.dataset.type = eligibleCount ? "success" : "warning";
      } catch (error) {
        landedCostStatus.textContent = error.message || "Müqayisə alınmadı.";
        landedCostStatus.dataset.type = "error";
      } finally {
        submit.disabled = false;
      }
    };
    landedCostForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      runLandedCostComparison();
    });
    if (productOffers.length) runLandedCostComparison();
    const amount = parseProductPriceAmount(item);
    const safeImage = getPublicImageUrl(item);
    injectEntitySchema("constera-product-schema", {
      "@context": "https://schema.org",
      "@type": "Product",
      name: item.name,
      sku: item.sku,
      ...(item.barcode && /^[0-9]{8,14}$/.test(item.barcode) ? { gtin: item.barcode } : {}),
      description: document.querySelector('meta[name="description"]')?.content || item.name,
      category: `${category?.title || item.category} > ${item.subcategory}`,
      brand: { "@type": "Brand", name: item.brand },
      image: safeImage ? [new URL(safeImage, window.location.href).toString()] : undefined,
      additionalProperty: productAttributes.map((attribute) => ({
        "@type": "PropertyValue",
        name: attribute.label,
        value: attribute.value
      })),
      offers: item.commerceReady !== true || item.priceStatus !== "confirmed" || amount === null || amount <= 0 ? undefined : {
        "@type": "Offer",
        url: window.location.href,
        priceCurrency: item.priceCurrency || "AZN",
        price: amount,
        itemCondition: "https://schema.org/NewCondition",
        availability: normalize(item.availability).includes("anbar")
          ? "https://schema.org/InStock"
          : "https://schema.org/PreOrder",
        seller: { "@type": "Organization", name: item.supplier || "ConstEra təchizatçısı" }
      }
    }, safeImage);
    injectEntitySchema("constera-product-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Ana səhifə", item: new URL("/", window.location.href).toString() },
        { "@type": "ListItem", position: 2, name: "Kataloq", item: new URL("/catalog.html", window.location.href).toString() },
        {
          "@type": "ListItem",
          position: 3,
          name: category?.title || item.category,
          item: new URL(`/category.html?type=material&category=${encodeURIComponent(item.category)}`, window.location.href).toString()
        },
        { "@type": "ListItem", position: 4, name: item.name, item: window.location.href }
      ]
    });
  };

  if (product) paintProduct(product);
  if (productId && !window.CONSTERA_STATIC_PREVIEW && window.ConstEraAPI?.product) {
    window.ConstEraAPI.product(productId)
      .then((result) => paintProduct(result.data))
      .catch(() => {
        if (!product) renderDetailFallback(container, "Məhsul tapılmadı", "catalog.html");
      });
    return;
  }
  if (product) return;
  renderDetailFallback(container, "Məhsul tapılmadı", "catalog.html");
};

const renderServiceDetail = () => {
  const container = document.querySelector("[data-service-detail]");
  if (!container) return;

  const serviceId = getQueryParam("service");
  const service = serviceId
    ? (marketplace.services || []).find((item) => item.id === serviceId)
    : (marketplace.services || [])[0];
  if (!service) {
    renderDetailFallback(container, "Xidmət tapılmadı", "services.html");
    return;
  }

  const category = getServiceCategory(service.category);
  const sourceUrl = getSafeHttpsUrl(service.sourceUrl);
  const relatedServices = sortBySourceQuality((marketplace.services || []).filter((item) =>
    item.id !== service.id && (item.subcategory === service.subcategory || item.category === service.category)
  ), "service");
  document.title = `${service.title} | ConstEra Xidmətlər`;
  updatePageDescription(`${service.title}: ${category?.title || "tikinti xidməti"}, ${service.subcategory || "ümumi xidmət"}, ${service.price}. ConstEra üzərindən xidmət sorğusu yarat.`);
  container.innerHTML = `
    <div class="detail-hero glass">
      <div class="detail-symbol">
        <span>${escapeHtml(service.type.slice(0, 2).toUpperCase())}</span>
      </div>
      <div class="detail-copy">
        <p class="eyebrow">Xidmət detalı</p>
        <h1>${escapeHtml(service.title)}</h1>
        <div class="product-meta detail-tags">
          <span>${escapeHtml(category?.title || service.category)}</span>
          <span>${escapeHtml(service.subcategory || "Ümumi")}</span>
          <span>${escapeHtml(service.unit)}</span>
        </div>
        <p class="hero-text">İş həcmi, briqada, təhvil nəticələri və ilkin smeta üçün istifadə olunan xidmət kartı.</p>
        <div class="detail-actions">
          ${projectActionButton("service", service.id)}
          <a class="button button-primary" href="rfq.html?service=${encodeURIComponent(service.id)}">Xidmət sorğusu yarat</a>
          <a class="button button-outline" href="services.html">Xidmətlərə qayıt</a>
          ${sourceUrl ? `<a class="button button-secondary" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(service.sourceLabel || "Mənbəni aç")}</a>` : ""}
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <article class="detail-panel glass">
        <span class="price-label">Qiymət</span>
        <strong>${escapeHtml(service.price)}</strong>
        <p>${escapeHtml(service.priceConfirmationRequired ? "Elan qiyməti və iş həcmi sifarişdən əvvəl yenidən təsdiqlənir." : "Obyektə baxış və iş həcmi təsdiqindən sonra dəqiqləşir.")}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Müddət</span>
        <strong>${escapeHtml(service.leadTime)}</strong>
        <p>${escapeHtml(service.unit)}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Komanda</span>
        <strong>${escapeHtml(service.providerName || service.team)}</strong>
        <p>${escapeHtml(service.city || "İş həcminə görə briqada tərkibi dəyişir.")}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Təhvil</span>
        <strong>${(service.deliverables || []).length} nəticə</strong>
        <p>Qiymət sorğusu və smeta üçün strukturlaşdırılmış çıxışlar.</p>
      </article>
    </div>

    <div class="detail-two-column">
      <article class="detail-panel glass">
        <p class="eyebrow">İş həcmi</p>
        <ul class="spec-list detail-list">
          ${(service.specs || []).map((spec) => `<li>${escapeHtml(spec)}</li>`).join("")}
        </ul>
      </article>
      <article class="detail-panel glass">
        <p class="eyebrow">Təhvil nəticələri</p>
        <div class="service-deliverables">
          ${(service.deliverables || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
      </article>
    </div>
    ${renderEntityRecommendations("Oxşar xidmətlər", relatedServices, { path: "service-detail.html", param: "service" })}
  `;
  injectEntitySchema("constera-service-schema", {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.title,
    serviceType: `${category?.title || service.category} · ${service.subcategory || "Ümumi"}`,
    description: document.querySelector('meta[name="description"]')?.content || service.title,
    areaServed: { "@type": "Country", name: "Azərbaycan" },
    provider: {
      "@type": "Organization",
      name: service.providerName || "ConstEra",
      url: sourceUrl || "https://constera.az/"
    },
    url: window.location.href
  });
};

const renderPackageDetail = () => {
  const container = document.querySelector("[data-package-detail]");
  if (!container) return;

  const packageId = getQueryParam("package");
  const pack = packageId
    ? (marketplace.packages || []).find((item) => item.id === packageId)
    : (marketplace.packages || [])[0];
  if (!pack) {
    renderDetailFallback(container, "Paket tapılmadı", "packages.html");
    return;
  }

  const category = getPackageCategory(pack.category);
  const sourceUrl = getSafeHttpsUrl(pack.sourceUrl);
  const providerUrl = getSafeHttpsUrl(pack.providerWebsite);
  const levelLabel = packageLevelLabels[pack.level] || pack.type;
  const relatedPackages = sortBySourceQuality((marketplace.packages || []).filter((item) =>
    item.id !== pack.id && (item.subcategory === pack.subcategory || item.category === pack.category)
  ), "package");
  document.title = `${pack.title} | ConstEra Paketlər`;
  updatePageDescription(`${pack.title}: ${category?.title || "hazır paket"}, ${pack.subcategory || "ümumi paket"}, ${pack.price}. Təmir və tikinti paketləri üçün sorğu göndər.`);
  container.innerHTML = `
    <div class="detail-hero glass">
      <div class="detail-symbol">
        <span>PK</span>
      </div>
      <div class="detail-copy">
        <p class="eyebrow">Hazır paket detalı</p>
        <h1>${escapeHtml(pack.title)}</h1>
        <div class="product-meta detail-tags">
          <span>${escapeHtml(category?.title || pack.category)}</span>
          <span>${escapeHtml(pack.subcategory || "Ümumi")}</span>
          <span>${escapeHtml(levelLabel)}</span>
          ${pack.providerName ? `<span>${escapeHtml(pack.providerName)}</span>` : ""}
        </div>
        <p class="hero-text">${escapeHtml(pack.idealFor)}</p>
        <div class="detail-actions">
          ${projectActionButton("package", pack.id)}
          <a class="button button-primary" href="rfq.html?package=${encodeURIComponent(pack.id)}">Paket sorğusu yarat</a>
          ${sourceUrl ? `<a class="button button-secondary" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">Mənbəni aç</a>` : ""}
          <a class="button button-outline" href="packages.html">Paketlərə qayıt</a>
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <article class="detail-panel glass">
        <span class="price-label">Paket qiyməti</span>
        <strong>${escapeHtml(pack.price)}</strong>
        <p>${escapeHtml(pack.pricingBasis || "Obyekt ölçüsü, material səviyyəsi və icra şərtləri qiymət sorğusundan sonra dəqiqləşir.")}</p>
        ${pack.priceConfirmationRequired ? `<span class="price-freshness is-aging">Qiymət sifarişdən əvvəl təsdiqlənir</span>` : ""}
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Müddət</span>
        <strong>${escapeHtml(pack.timeline)}</strong>
        <p>${escapeHtml(pack.unit)}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Provayder</span>
        <strong>${escapeHtml(pack.providerName || pack.team)}</strong>
        <p>${escapeHtml(pack.providerName ? getPackageSourceStatus(pack) : "İş həcminə görə briqada və nəzarət tərkibi dəyişir.")}</p>
        ${providerUrl && providerUrl !== sourceUrl ? `<a class="source-link" href="${escapeAttr(providerUrl)}" target="_blank" rel="noopener noreferrer">Provayder saytı</a>` : ""}
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Təhvil</span>
        <strong>${(pack.deliverables || []).length} nəticə</strong>
        <p>Qiymət sorğusu və müqavilə üçün strukturlaşdırılmış çıxışlar.</p>
      </article>
    </div>

    <div class="detail-two-column">
      <article class="detail-panel glass">
        <p class="eyebrow">Paketə daxildir</p>
        <ul class="spec-list detail-list">
          ${(pack.includes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </article>
      <article class="detail-panel glass">
        <p class="eyebrow">Təhvil nəticələri</p>
        <div class="service-deliverables">
          ${(pack.deliverables || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
        ${pack.warrantyMonths ? `<p>${escapeHtml(`${pack.warrantyMonths} ay zəmanət mənbədə göstərilib; müqavilədə yenidən təsdiqlənməlidir.`)}</p>` : ""}
      </article>
    </div>
    ${renderEntityRecommendations("Oxşar hazır paketlər", relatedPackages, { path: "package-detail.html", param: "package" })}
  `;
  injectEntitySchema("constera-package-schema", {
    "@context": "https://schema.org",
    "@type": "Service",
    name: pack.title,
    serviceType: `${category?.title || pack.category} · ${pack.type}`,
    description: document.querySelector('meta[name="description"]')?.content || pack.idealFor,
    areaServed: { "@type": "Country", name: "Azərbaycan" },
    provider: {
      "@type": "Organization",
      name: pack.providerName || "ConstEra",
      url: providerUrl || "https://constera.az/"
    },
    ...(getPackagePriceAmount(pack) !== null ? {
      offers: {
        "@type": "Offer",
        price: getPackagePriceAmount(pack),
        priceCurrency: pack.priceCurrency || "AZN",
        unitText: pack.priceUnit || pack.unit || "m²",
        url: sourceUrl || window.location.href
      }
    } : {}),
    url: window.location.href
  });
};

const renderRentalDetail = () => {
  const container = document.querySelector("[data-rental-detail]");
  if (!container) return;

  const rentalId = getQueryParam("rental");
  const rental = rentalId
    ? (marketplace.rentals || []).find((item) => item.id === rentalId)
    : (marketplace.rentals || [])[0];
  if (!rental) {
    renderDetailFallback(container, "Avadanlıq tapılmadı", "rental.html");
    return;
  }

  const category = getRentalCategory(rental.category);
  const sourceUrl = getSafeHttpsUrl(rental.sourceUrl);
  const imageUrl = getPublicImageUrl(rental);
  const relatedRentals = sortBySourceQuality((marketplace.rentals || []).filter((item) =>
    item.id !== rental.id && (item.subcategory === rental.subcategory || item.category === rental.category)
  ), "rental");
  const rentalMedia = imageUrl
    ? `<div class="detail-media"><img data-product-image data-product-fallback="İC" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(rental.name)}" width="1280" height="960" decoding="async" referrerpolicy="no-referrer"></div>`
    : `<div class="detail-symbol"><span>İC</span></div>`;
  document.title = `${rental.name} | ConstEra İcarə`;
  updatePageDescription(`${rental.name}: ${category?.title || "avadanlıq icarəsi"}, ${rental.capacity || rental.subcategory}, ${rental.price}. Tikinti avadanlığı icarəsi üçün sorğu yarat.`);
  container.innerHTML = `
    <div class="detail-hero glass">
      ${rentalMedia}
      <div class="detail-copy">
        <p class="eyebrow">İcarə detalı</p>
        <h1>${escapeHtml(rental.name)}</h1>
        <div class="product-meta detail-tags">
          <span>${escapeHtml(category?.title || rental.category)}</span>
          <span>${escapeHtml(rental.subcategory || "Ümumi")}</span>
          <span>${escapeHtml(rental.operator)}</span>
          ${rental.city ? `<span>${escapeHtml(rental.city)}</span>` : ""}
        </div>
        <p class="hero-text">Avadanlıq gücü, operator şərti, depozit, çatdırılma və rezervasiya qiymət sorğusu üçün əsas kart.</p>
        <div class="detail-actions">
          ${projectActionButton("rental", rental.id)}
          <a class="button button-primary" href="rfq.html?rental=${encodeURIComponent(rental.id)}">İcarə sorğusu yarat</a>
          ${sourceUrl ? `<a class="button button-secondary" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">Mənbəni aç</a>` : ""}
          <a class="button button-outline" href="rental.html">İcarəyə qayıt</a>
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <article class="detail-panel glass">
        <span class="price-label">İcarə qiyməti</span>
        <strong>${escapeHtml(rental.price)}</strong>
        <p>${escapeHtml(rental.priceConfirmationRequired ? "Mənbədə göstərilən məbləğ, qiymət vahidi və mövcudluq sifariş zamanı təsdiqlənir." : "Gün, həftə, ay və obyekt şərtinə görə dəqiqləşir.")}</p>
        ${rental.priceConfirmationRequired ? `<span class="price-freshness is-aging">Sifarişdən əvvəl təsdiq tələb olunur</span>` : ""}
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Güc / tutum</span>
        <strong>${escapeHtml(rental.capacity)}</strong>
        <p>${escapeHtml(rental.unit)}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Operator</span>
        <strong>${escapeHtml(rental.operator)}</strong>
        <p>${escapeHtml(rental.delivery)}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Depozit</span>
        <strong>${escapeHtml(rental.deposit)}</strong>
        <p>Müqavilə və avadanlıq dəyərinə görə təsdiqlənir.</p>
      </article>
    </div>

    <div class="detail-two-column">
      <article class="detail-panel glass">
        <p class="eyebrow">İstifadə sahələri</p>
        <ul class="spec-list detail-list">
          ${(rental.specs || []).map((spec) => `<li>${escapeHtml(spec)}</li>`).join("")}
        </ul>
      </article>
      <article class="detail-panel glass">
        <p class="eyebrow">Rezervasiya qeydləri</p>
        <ul class="spec-list detail-list">
          <li>Tarix, müddət və obyekt ünvanı Qiymət sorğusunda yazılmalıdır.</li>
          <li>Operator, yanacaq və daşınma şərtləri ayrıca təsdiqlənir.</li>
          <li>Depozit və təhvil-qəbul aktı müqavilə əsasında bağlanır.</li>
        </ul>
        ${rental.imageCredit ? `<p>Şəkil mənbəyi: ${escapeHtml(rental.imageCredit)}</p>` : ""}
        ${sourceUrl ? `<a class="source-link" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(rental.sourceLabel || "Mənbəni aç")}</a>` : ""}
      </article>
    </div>
    <section class="detail-panel glass">
      <div class="market-section-heading">
        <div>
          <p class="eyebrow">Tarixə bağlı rezervasiya</p>
          <h2>${escapeHtml(rental.name)} üçün icarə müraciəti</h2>
        </div>
        <span class="data-badge">Uyğunluq yoxlaması</span>
      </div>
      <form class="admin-form" data-rental-booking-form>
        <input type="hidden" name="rentalId" value="${escapeAttr(rental.id)}" />
        <input class="form-honeypot" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <div class="admin-form-grid">
          <label class="admin-field"><span>Şirkət</span><input name="companyName" required maxlength="200" /></label>
          <label class="admin-field"><span>Əlaqələndirici şəxs</span><input name="contactName" required maxlength="160" /></label>
          <label class="admin-field"><span>E-poçt</span><input name="email" type="email" required maxlength="254" /></label>
          <label class="admin-field"><span>Telefon</span><input name="phone" type="tel" required maxlength="80" /></label>
          <label class="admin-field"><span>Şəhər</span><input name="city" required maxlength="160" value="${escapeAttr(rental.city || "Bakı")}" /></label>
          <label class="admin-field"><span>Obyekt ünvanı</span><input name="address" required maxlength="500" /></label>
          <label class="admin-field"><span>Başlanğıc tarixi</span><input name="startDate" type="date" required /></label>
          <label class="admin-field"><span>Bitmə tarixi</span><input name="endDate" type="date" required /></label>
          <label class="admin-field"><span>Say</span><input name="quantity" type="number" min="1" max="100" value="1" required /></label>
          <label class="admin-field"><span>Operator</span><select name="operatorPreference"><option>Operatorla</option><option>Operatorsuz</option><option>Razılaşma ilə</option></select></label>
          <label class="admin-field"><span>Çatdırılma</span><select name="deliveryRequired"><option value="true">Obyektə çatdırılma</option><option value="false">Özüm götürəcəyəm</option></select></label>
        </div>
        <label class="admin-field admin-field-wide"><span>Qeyd</span><textarea name="note" rows="3" maxlength="2000" placeholder="İş rejimi, sahə şərti və xüsusi tələblər"></textarea></label>
        <label class="supplier-application-consent">
          <input name="legalAccepted" type="checkbox" value="true" required />
          <span><a href="terms.html">İstifadə şərtləri</a> və <a href="privacy.html">məxfilik siyasəti</a> ilə razıyam.</span>
        </label>
        <div class="admin-actions">
          <button class="button button-primary" type="submit">Rezervasiya göndər</button>
          <a class="button button-outline" href="rfq.html?rental=${encodeURIComponent(rental.id)}">Qiymət sorğusu yarat</a>
        </div>
        <p class="admin-import-status" data-rental-booking-status role="status" aria-live="polite">
          Tarixlər və avadanlığın mövcudluğu təsdiqdən əvvəl yoxlanılır.
        </p>
      </form>
    </section>
    ${renderEntityRecommendations("Oxşar icarə avadanlıqları", relatedRentals, { path: "rental-detail.html", param: "rental" })}
  `;
  const bookingForm = container.querySelector("[data-rental-booking-form]");
  const bookingStatus = container.querySelector("[data-rental-booking-status]");
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const followingDay = new Date(today);
  followingDay.setDate(today.getDate() + 2);
  const toDateInput = (date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
  bookingForm.elements.startDate.min = toDateInput(today);
  bookingForm.elements.endDate.min = toDateInput(today);
  bookingForm.elements.startDate.value = toDateInput(tomorrow);
  bookingForm.elements.endDate.value = toDateInput(followingDay);
  bookingForm.elements.startDate.addEventListener("change", () => {
    bookingForm.elements.endDate.min = bookingForm.elements.startDate.value || toDateInput(today);
    if (bookingForm.elements.endDate.value < bookingForm.elements.startDate.value) {
      bookingForm.elements.endDate.value = bookingForm.elements.startDate.value;
    }
  });
  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = bookingForm.querySelector('button[type="submit"]');
    if (!window.ConstEraAPI?.createRentalBooking) {
      bookingStatus.textContent = "Canlı rezervasiya xidməti hazırda əlçatan deyil. Qiymət sorğusu yarat.";
      bookingStatus.dataset.type = "warning";
      return;
    }
    button.disabled = true;
    bookingStatus.textContent = "Tarixlər və məlumatlar yoxlanılır...";
    bookingStatus.dataset.type = "info";
    try {
      const payload = Object.fromEntries(new FormData(bookingForm).entries());
      payload.deliveryRequired = payload.deliveryRequired === "true";
      payload.quantity = Number(payload.quantity);
      payload.legalAccepted = payload.legalAccepted === "true";
      payload.sourcePath = `${window.location.pathname}${window.location.search}`;
      const result = await window.ConstEraAPI.createRentalBooking(payload);
      bookingStatus.textContent = `Rezervasiya müraciəti qəbul edildi: ${result.data.id}. Menecer qiymət və mövcudluğu təsdiqləyəcək.`;
      bookingStatus.dataset.type = "success";
      bookingForm.reset();
      bookingForm.elements.rentalId.value = rental.id;
      bookingForm.elements.city.value = rental.city || "Bakı";
      bookingForm.elements.startDate.value = toDateInput(tomorrow);
      bookingForm.elements.endDate.value = toDateInput(followingDay);
    } catch (error) {
      bookingStatus.textContent = error.message || "Rezervasiya göndərilmədi.";
      bookingStatus.dataset.type = "error";
    } finally {
      button.disabled = false;
    }
  });
  injectEntitySchema("constera-rental-schema", {
    "@context": "https://schema.org",
    "@type": "Service",
    name: rental.name,
    serviceType: `Tikinti avadanlığı icarəsi · ${category?.title || rental.category}`,
    description: document.querySelector('meta[name="description"]')?.content || rental.name,
    areaServed: { "@type": "Country", name: "Azərbaycan" },
    provider: { "@type": "Organization", name: "ConstEra", url: "https://constera.az/" },
    url: window.location.href
  }, imageUrl);
};

const getTaxonomyConfig = (type) => {
  const configs = {
    material: {
      label: "Material kataloqu",
      itemLabel: "məhsul",
      listHref: "catalog.html",
      categories: marketplace.categories || [],
      items: marketplace.products || [],
      card: createProductCard,
      titleOf: (item) => item.name
    },
    service: {
      label: "Xidmət kataloqu",
      itemLabel: "xidmət",
      listHref: "services.html",
      categories: marketplace.serviceCategories || [],
      items: marketplace.services || [],
      card: createServiceCard,
      titleOf: (item) => item.title
    },
    package: {
      label: "Paket kataloqu",
      itemLabel: "paket",
      listHref: "packages.html",
      categories: marketplace.packageCategories || [],
      items: marketplace.packages || [],
      card: createPackageCard,
      titleOf: (item) => item.title
    },
    rental: {
      label: "İcarə kataloqu",
      itemLabel: "avadanlıq",
      listHref: "rental.html",
      categories: marketplace.rentalCategories || [],
      items: marketplace.rentals || [],
      card: createRentalCard,
      titleOf: (item) => item.name
    }
  };
  return configs[type] || configs.material;
};

const renderTaxonomyDetail = () => {
  const container = document.querySelector("[data-taxonomy-detail]");
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const type = params.get("type") || "material";
  const mode = container.dataset.taxonomyMode || "category";
  const config = getTaxonomyConfig(type);
  const categoryId = params.get("category");
  const subcategory = params.get("subcategory");
  const category = config.categories.find((item) => item.id === categoryId) || config.categories[0];

  if (!category) {
    renderDetailFallback(container, "Kateqoriya tapılmadı", config.listHref);
    return;
  }

  const visibleSubcategory = mode === "subcategory" && subcategory && category.subcategories.includes(subcategory)
    ? subcategory
    : "";
  const items = config.items.filter((item) => {
    const matchesCategory = item.category === category.id;
    const matchesSubcategory = !visibleSubcategory || item.subcategory === visibleSubcategory;
    return matchesCategory && matchesSubcategory;
  }).sort((left, right) => compareSourceQuality(left, right, type === "material" ? "product" : type));
  const pageTitle = visibleSubcategory || category.title;
  const baseUrl = `category.html?type=${encodeURIComponent(type)}&category=${encodeURIComponent(category.id)}`;

  document.title = `${pageTitle} | ConstEra ${config.label}`;
  updatePageDescription(`${pageTitle}: ${category.subtitle || `${config.label} üzrə kateqoriya səhifəsi`}. ${items.length} ${config.itemLabel} tapıldı.`);
  container.innerHTML = `
    <div class="detail-hero glass taxonomy-hero">
      <div class="detail-symbol">
        <span>${escapeHtml(category.title.slice(0, 2).toUpperCase())}</span>
      </div>
      <div class="detail-copy">
        <p class="eyebrow">${escapeHtml(config.label)}</p>
        <h1>${escapeHtml(pageTitle)}</h1>
        <div class="product-meta detail-tags">
          <span>${escapeHtml(category.group || "Ümumi")}</span>
          <span>${escapeHtml(category.title)}</span>
          <span>${items.length} ${escapeHtml(config.itemLabel)}</span>
        </div>
        <p class="hero-text">${escapeHtml(category.subtitle || "ConstEra qiymət sorğusu axını üçün qruplaşdırılmış kateqoriya səhifəsi.")}</p>
        <div class="detail-actions">
          <a class="button button-primary" href="rfq.html">Sorğu yarat</a>
          <a class="button button-outline" href="${escapeAttr(config.listHref)}">Kataloqa qayıt</a>
          ${type === "material" ? `<a class="button button-secondary" href="catalog.html?category=${encodeURIComponent(category.id)}${visibleSubcategory ? `&subcategory=${encodeURIComponent(visibleSubcategory)}` : ""}">Filtrdə aç</a>` : ""}
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <article class="detail-panel glass">
        <span class="price-label">Qrup</span>
        <strong>${escapeHtml(category.group || "Ümumi")}</strong>
        <p>Kateqoriya böyük kataloq ağacında bu qrup altında idarə olunur.</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Subkateqoriya</span>
        <strong>${visibleSubcategory ? "1" : category.subcategories.length}</strong>
        <p>${visibleSubcategory ? escapeHtml(visibleSubcategory) : "Alt bölmələr Qiymət sorğusu və SEO üçün ayrıca açılır."}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Kart sayı</span>
        <strong>${items.length}</strong>
        <p>Bu səhifədə göstərilən ${escapeHtml(config.itemLabel)} sayı.</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Qiymət</span>
        <strong>Sorğu əsasında</strong>
        <p>Real qiymət təchizatçı və iş həcmi təsdiqindən sonra göstərilir.</p>
      </article>
    </div>

    <div class="detail-panel glass taxonomy-subcategory-panel">
      <div class="market-section-heading">
        <div>
          <p class="eyebrow">Alt bölmələr</p>
          <h2>${escapeHtml(category.title)} subkateqoriyaları</h2>
        </div>
        <a class="card-link" href="${escapeAttr(baseUrl)}">Kateqoriyanı aç</a>
      </div>
      <div class="taxonomy-chip-grid">
        ${category.subcategories.map((item) => `
          <a class="${item === visibleSubcategory ? "is-active" : ""}" href="subcategory.html?type=${encodeURIComponent(type)}&category=${encodeURIComponent(category.id)}&subcategory=${encodeURIComponent(item)}">
            <span>${escapeHtml(item)}</span>
            <strong>${config.items.filter((entry) => entry.category === category.id && entry.subcategory === item).length}</strong>
          </a>
        `).join("")}
      </div>
    </div>

    <section class="section taxonomy-results">
      <div class="market-section-heading">
        <div>
          <p class="eyebrow">Nəticələr</p>
          <h2>${escapeHtml(pageTitle)} üzrə kartlar</h2>
        </div>
        <span class="data-badge">${items.length} ${escapeHtml(config.itemLabel)}</span>
      </div>
      <div class="product-grid">
        ${items.map(config.card).join("")}
      </div>
      ${items.length ? "" : `
        <div class="empty-state glass">
          <strong>Bu bölmədə kart yoxdur.</strong>
          <span>İdarəetmə və idxal axını ilə yeni məlumat əlavə oluna bilər.</span>
        </div>
      `}
    </section>
  `;
};

const parseCsvRows = (text) => {
  const source = String(text || "").trim();
  if (!source) return [];
  const firstLine = source.split(/\r?\n/)[0] || "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      value += "\"";
      index += 1;
      continue;
    }
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(value.trim());
      value = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += char;
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => normalize(header));
  return rows.slice(1).map((cells) => headers.reduce((item, header, index) => {
    item[header] = cells[index] || "";
    return item;
  }, {}));
};

const getCsvValue = (row, aliases) => {
  for (const alias of aliases) {
    const value = row[normalize(alias)];
    if (value) return value;
  }
  return "";
};

const productFromCsvRow = (row, index) => {
  const sku = getCsvValue(row, ["sku", "kod", "mehsul kodu", "məhsul kodu"]);
  const name = getCsvValue(row, ["ad", "name", "mehsul", "məhsul", "product", "title"]);
  const categoryInput = getCsvValue(row, ["kateqoriya", "category", "kategoriya"]);
  const category = findCategoryByInput(categoryInput)?.id || categoryInput || marketplace.categories[0]?.id;
  const subcategory = getCsvValue(row, ["subkateqoriya", "alt kateqoriya", "subcategory", "sub category"]);

  return ensureAdminProductShape({
    sku,
    barcode: getCsvValue(row, ["barkod", "barcode", "gtin", "ean"]),
    name,
    brand: getCsvValue(row, ["brend", "brand", "marka"]),
    category,
    subcategory,
    package: getCsvValue(row, ["qablaşdırma", "qablashdirma", "package", "packaging"]),
    price: getCsvValue(row, ["qiymət", "qiymet", "price"]),
    priceStatus: getCsvValue(row, ["qiymət statusu", "qiymet statusu", "price status", "pricestatus"]),
    supplier: getCsvValue(row, ["təchizatçı", "techizatci", "supplier"]),
    availability: getCsvValue(row, ["mövcudluq", "movcudluq", "availability", "stock"]),
    imageUrl: getCsvValue(row, ["foto url", "şəkil", "sekil", "image", "image url", "imageurl"]),
    sourceUrl: getCsvValue(row, ["mənbə url", "menbe url", "source", "source url", "sourceurl"]),
    sourceLabel: getCsvValue(row, ["mənbə", "menbe", "source label", "sourcelabel"]),
    origin: getCsvValue(row, ["mənşə", "menshe", "origin", "ölkə", "olke"]),
    specs: getCsvValue(row, ["xüsusiyyətlər", "xususiyyetler", "specs", "features"])
  }, index);
};

const escapeCsvValue = (value) => {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
};

const productsToCsv = (products) => {
  const headers = [
    "sku",
    "barkod",
    "ad",
    "brend",
    "kateqoriya",
    "subkateqoriya",
    "qablaşdırma",
    "qiymət",
    "qiymət statusu",
    "təchizatçı",
    "mövcudluq",
    "foto url",
    "mənbə url",
    "xüsusiyyətlər"
  ];
  const rows = products.map((product) => [
    product.sku,
    product.barcode,
    product.name,
    product.brand,
    getCategory(product.category)?.title || product.category,
    product.subcategory,
    product.package,
    product.price,
    product.priceStatus || "",
    product.supplier,
    product.availability,
    product.imageUrl,
    product.sourceUrl,
    product.specs
  ].map(escapeCsvValue).join(","));

  return [headers.join(","), ...rows].join("\n");
};

const upsertAdminProducts = (products) => {
  const existingProducts = getAdminProducts().map((product, index) => ensureAdminProductShape(product, index));
  const byKey = new Map(existingProducts.map((product) => [normalize(product.sku || product.id), product]));

  products.forEach((product, index) => {
    const shaped = ensureAdminProductShape(product, index);
    const key = normalize(shaped.sku || shaped.id);
    const previous = byKey.get(key);
    byKey.set(key, {
      ...(previous || {}),
      ...shaped,
      id: previous?.id || shaped.id
    });
  });

  const nextProducts = [...byKey.values()];
  saveAdminProducts(nextProducts);
  syncAdminProductOverlay();
  return nextProducts;
};

const getDataQualitySnapshot = () => {
  const products = marketplace.products || [];
  const total = products.length || 1;
  const confirmedPrices = products.filter((product) =>
    product.priceStatus === "confirmed" || !normalize(product.price).includes("sorğu")
  ).length;
  const requestPrices = products.filter((product) =>
    product.priceStatus === "request" || normalize(product.price).includes("sorğu")
  ).length;
  const withImages = products.filter((product) => product.imageUrl).length;
  const withSources = products.filter((product) => product.sourceUrl).length;
  const withSpecs = products.filter((product) => (product.specs || []).length >= 2).length;
  const localChanges = getAdminProducts().length;
  const percent = (value) => Math.round((value / total) * 100);

  return {
    total: products.length,
    confirmedPrices,
    requestPrices,
    withImages,
    withSources,
    withSpecs,
    localChanges,
    imagePercent: percent(withImages),
    sourcePercent: percent(withSources),
    pricePercent: percent(confirmedPrices),
    specPercent: percent(withSpecs)
  };
};

const entityFromCsvRow = (entityType, row, index) => {
  const title = getCsvValue(row, ["ad", "name", "title", "xidmət", "xidmet", "paket", "avadanlıq", "avadanliq"]);
  const categoryInput = getCsvValue(row, ["kateqoriya", "category", "kategoriya"]);
  const category = findEntityCategoryByInput(entityType, categoryInput)?.id ||
    categoryInput ||
    getEntityCategories(entityType)[0]?.id;

  return ensureAdminEntityShape(entityType, {
    title,
    name: title,
    category,
    subcategory: getCsvValue(row, ["subkateqoriya", "alt kateqoriya", "subcategory", "sub category"]),
    type: getCsvValue(row, ["tip", "type", "növ", "nov"]),
    itemType: getCsvValue(row, ["tip", "type", "növ", "nov"]),
    unit: getCsvValue(row, ["vahid", "unit"]),
    price: getCsvValue(row, ["qiymət", "qiymet", "price"]),
    time: getCsvValue(row, ["müddət", "muddet", "lead time", "timeline", "çatdırılma", "catdirilma"]),
    team: getCsvValue(row, ["komanda", "operator", "team"]),
    teamOrOperator: getCsvValue(row, ["komanda", "operator", "team"]),
    extra: getCsvValue(row, ["tutum", "capacity", "kim üçün", "ideal for", "uyğundur", "uygundur"]),
    specs: getCsvValue(row, ["xüsusiyyətlər", "xususiyyetler", "specs", "features", "daxildir", "includes"]),
    deliverables: getCsvValue(row, ["nəticələr", "neticeler", "deliverables", "təhvil", "tehvil"]),
    deposit: getCsvValue(row, ["depozit", "deposit"]),
    delivery: getCsvValue(row, ["çatdırılma", "catdirilma", "delivery"]),
    operator: getCsvValue(row, ["operator"])
  }, index);
};

const entitiesToCsv = (entityType, items) => {
  const headers = [
    "ad",
    "kateqoriya",
    "subkateqoriya",
    "tip",
    "vahid",
    "qiymət",
    "müddət",
    "komanda/operator",
    "əlavə",
    "xüsusiyyətlər",
    "nəticələr"
  ];
  const rows = items.map((item) => {
    const time = entityType === "service" ? item.leadTime : entityType === "package" ? item.timeline : item.delivery;
    const team = entityType === "rental" ? item.operator : item.team;
    const extra = entityType === "rental" ? item.capacity : entityType === "package" ? item.idealFor : "";
    const specs = entityType === "package" ? item.includes : item.specs;

    return [
      getEntityTitle(entityType, item),
      getEntityCategories(entityType).find((category) => category.id === item.category)?.title || item.category,
      item.subcategory,
      item.type || "",
      item.unit,
      item.price,
      time,
      team,
      extra,
      specs,
      item.deliverables || []
    ].map(escapeCsvValue).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
};

const renderAdmin = () => {
  const tabButtons = document.querySelectorAll("[data-admin-tab]");
  const tabPanels = document.querySelectorAll("[data-admin-panel]");
  const stats = document.querySelector("[data-admin-stats]");
  const productRows = document.querySelector("[data-admin-products]");
  const categoryRows = document.querySelector("[data-admin-categories]");
  const supplierRows = document.querySelector("[data-admin-suppliers]");
  const serviceRows = document.querySelector("[data-admin-services]");
  const packageRows = document.querySelector("[data-admin-packages]");
  const rentalRows = document.querySelector("[data-admin-rentals]");
  const productForm = document.querySelector("[data-admin-product-form]");
  const formCategory = document.querySelector("[data-admin-form-category]");
  const formSubcategory = document.querySelector("[data-admin-form-subcategory]");
  const clearFormButton = document.querySelector("[data-admin-clear-form]");
  const resetProductsButton = document.querySelector("[data-admin-reset-products]");
  const csvInput = document.querySelector("[data-admin-csv-input]");
  const importCsvButton = document.querySelector("[data-admin-import-csv]");
  const exportCsvButton = document.querySelector("[data-admin-export-csv]");
  const importStatus = document.querySelector("[data-admin-import-status]");
  const productSearch = document.querySelector("[data-admin-product-search]");
  const productCategoryFilter = document.querySelector("[data-admin-product-category]");
  const productPriceFilter = document.querySelector("[data-admin-product-price-status]");
  const productCount = document.querySelector("[data-admin-product-count]");
  const brandList = document.querySelector("#admin-brand-list");
  const supplierForm = document.querySelector("[data-admin-supplier-form]");
  const clearSupplierFormButton = document.querySelector("[data-admin-clear-supplier-form]");
  const resetSuppliersButton = document.querySelector("[data-admin-reset-suppliers]");
  const entityForm = document.querySelector("[data-admin-entity-form]");
  const entityTypeSelect = document.querySelector("[data-admin-entity-type]");
  const entityCategorySelect = document.querySelector("[data-admin-entity-category]");
  const entitySubcategorySelect = document.querySelector("[data-admin-entity-subcategory]");
  const clearEntityFormButton = document.querySelector("[data-admin-clear-entity-form]");
  const resetEntitiesButton = document.querySelector("[data-admin-reset-entities]");
  const entityCsvInput = document.querySelector("[data-admin-entity-csv-input]");
  const importEntityCsvButton = document.querySelector("[data-admin-import-entity-csv]");
  const exportEntityCsvButton = document.querySelector("[data-admin-export-entity-csv]");
  const entityStatus = document.querySelector("[data-admin-entity-status]");
  const backupInput = document.querySelector("[data-admin-backup-input]");
  const exportBackupButton = document.querySelector("[data-admin-export-backup]");
  const importBackupButton = document.querySelector("[data-admin-import-backup]");
  const downloadBackupButton = document.querySelector("[data-admin-download-backup]");
  const backupStatus = document.querySelector("[data-admin-backup-status]");
  const backupProducts = document.querySelector("[data-backup-products]");
  const backupSuppliers = document.querySelector("[data-backup-suppliers]");
  const backupRfq = document.querySelector("[data-backup-rfq]");
  const backupTenders = document.querySelector("[data-backup-tenders]");
  const backupEstimates = document.querySelector("[data-backup-estimates]");
  const backupEntities = document.querySelector("[data-backup-entities]");

  const setActiveAdminTab = (tabName) => {
    const activeTab = [...tabPanels].some((panel) => panel.dataset.adminPanel === tabName) ? tabName : "overview";
    tabButtons.forEach((button) => {
      const active = button.dataset.adminTab === activeTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== activeTab;
    });
    try {
      localStorage.setItem("constera-admin-active-tab", activeTab);
    } catch {
      // Tab memory is optional.
    }
  };

  const getStoredAdminTab = () => {
    try {
      return localStorage.getItem("constera-admin-active-tab") || "overview";
    } catch {
      return "overview";
    }
  };

  const renderBackupSummary = () => {
    if (backupProducts) backupProducts.textContent = getAdminProducts().length;
    if (backupSuppliers) backupSuppliers.textContent = getAdminSuppliers().length;
    if (backupRfq) backupRfq.textContent = storage.read("constera-rfq-drafts").length;
    if (backupTenders) backupTenders.textContent = storage.read("constera-tenders").length;
    if (backupEstimates) backupEstimates.textContent = storage.read("constera-ai-estimates").length;
    if (backupEntities) {
      backupEntities.textContent = getAdminEntityItems("service").length +
        getAdminEntityItems("package").length +
        getAdminEntityItems("rental").length;
    }
  };

  const createAdminBackup = () => ({
    version: "constera-admin-backup-v1",
    exportedAt: new Date().toISOString(),
    source: "ConstEra static admin",
    data: adminBackupKeys.reduce((acc, key) => {
      acc[key] = storage.read(key);
      return acc;
    }, {})
  });

  const downloadTextFile = (filename, text, mime = "application/json;charset=utf-8") => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderStats = () => {
    if (!stats) return;
    const confirmedPrices = marketplace.products.filter((product) =>
      product.priceStatus === "confirmed" || !normalize(product.price).includes("sorğu")
    ).length;
    const withImages = marketplace.products.filter((product) => product.imageUrl).length;
    const adminChanges = getAdminProducts().length +
      getAdminSuppliers().length +
      getAdminEntityItems("service").length +
      getAdminEntityItems("package").length +
      getAdminEntityItems("rental").length;

    stats.innerHTML = `
      <article class="stat-card"><span class="stat-value">${marketplace.categories.length}</span><p>kateqoriya</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.brands.length}</span><p>brend</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.suppliers.length}</span><p>təchizatçı</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.products.length}</span><p>məhsul</p></article>
      <article class="stat-card"><span class="stat-value">${confirmedPrices}</span><p>təsdiqli qiymət</p></article>
      <article class="stat-card"><span class="stat-value">${withImages}</span><p>fotolu məhsul</p></article>
      <article class="stat-card"><span class="stat-value">${adminChanges}</span><p>lokal düzəliş</p></article>
      <article class="stat-card"><span class="stat-value">${(marketplace.services || []).length + (marketplace.packages || []).length + (marketplace.rentals || []).length}</span><p>xidmət, paket, icarə</p></article>
    `;
  };

  const renderCategoryOptions = (select, allLabel) => {
    if (!select) return;
    select.innerHTML = `
      ${allLabel ? `<option value="all">${escapeHtml(allLabel)}</option>` : ""}
      ${groupCategories(marketplace.categories).map((group) => `
        <optgroup label="${escapeAttr(group.name)}">
          ${group.categories.map((category) => `<option value="${escapeAttr(category.id)}">${escapeHtml(category.title)}</option>`).join("")}
        </optgroup>
      `).join("")}
    `;
  };

  const updateFormSubcategories = (selectedValue = "") => {
    if (!formCategory || !formSubcategory) return;
    const category = getCategory(formCategory.value);
    const subcategories = category?.subcategories || [];
    formSubcategory.innerHTML = subcategories.map((item) =>
      `<option value="${escapeAttr(item)}">${escapeHtml(item)}</option>`
    ).join("");
    if (selectedValue && !subcategories.includes(selectedValue)) {
      formSubcategory.insertAdjacentHTML("beforeend", `<option value="${escapeAttr(selectedValue)}">${escapeHtml(selectedValue)}</option>`);
    }
    if (selectedValue) formSubcategory.value = selectedValue;
  };

  const setFormField = (name, value) => {
    const field = productForm?.elements.namedItem(name);
    if (field) field.value = value || "";
  };

  const fillForm = (product = {}) => {
    if (!productForm) return;
    productForm.reset();
    const shaped = product.id ? ensureAdminProductShape(product) : product;
    setFormField("id", shaped.id);
    setFormField("sku", shaped.sku);
    setFormField("barcode", shaped.barcode);
    setFormField("name", shaped.name);
    setFormField("brand", shaped.brand);
    setFormField("category", shaped.category || marketplace.categories[0]?.id || "");
    updateFormSubcategories(shaped.subcategory);
    setFormField("subcategory", shaped.subcategory);
    setFormField("package", shaped.package);
    setFormField("price", shaped.price);
    setFormField("priceStatus", shaped.priceStatus || "request");
    setFormField("supplier", shaped.supplier);
    setFormField("availability", shaped.availability);
    setFormField("stockQuantity", shaped.stockQuantity);
    setFormField("minimumOrder", shaped.minimumOrder);
    setFormField("warranty", shaped.warranty);
    setFormField("imageUrl", shaped.imageUrl);
    setFormField("sourceUrl", shaped.sourceUrl);
    setFormField("specs", normalizeSpecs(shaped.specs).join("; "));
  };

  const getFilteredAdminProducts = () => {
    const query = productSearch?.value || "";
    const category = productCategoryFilter?.value || "all";
    const priceStatus = productPriceFilter?.value || "all";

    return marketplace.products.filter((product) => {
      const priceIsRequest = product.priceStatus === "request" || normalize(product.price).includes("sorğu");
      const matchesQuery = matchesExpandedSearch([
        product.sku,
        product.name,
        product.brand,
        product.subcategory,
        product.supplier
      ].join(" "), query);
      const matchesCategory = category === "all" || product.category === category;
      const matchesPrice = priceStatus === "all" ||
        (priceStatus === "request" && priceIsRequest) ||
        (priceStatus === "confirmed" && !priceIsRequest);
      return matchesQuery && matchesCategory && matchesPrice;
    });
  };

  const renderProductRows = () => {
    if (!productRows) return;
    const filtered = getFilteredAdminProducts();
    if (productCount) productCount.textContent = `${filtered.length} məhsul`;
    productRows.innerHTML = filtered.slice(0, 80).map((product) => {
      const category = getCategory(product.category);
      const priceIsRequest = product.priceStatus === "request" || normalize(product.price).includes("sorğu");
      return `
        <tr>
          <td data-label="SKU">${escapeHtml(product.sku)}</td>
          <td data-label="Məhsul">
            <strong>${escapeHtml(product.name)}</strong>
            <small>${escapeHtml(product.subcategory || "Ümumi")}</small>
          </td>
          <td data-label="Brend">${escapeHtml(product.brand)}</td>
          <td data-label="Kateqoriya">${escapeHtml(category?.title || product.category)}</td>
          <td data-label="Qiymət">${escapeHtml(product.price)}</td>
          <td data-label="Vəziyyət"><span class="status-pill">${priceIsRequest ? "Sorğu" : "Təsdiqli"}</span></td>
          <td data-label="Əməliyyat"><button class="table-action" type="button" data-admin-edit-product="${escapeAttr(product.id)}">Redaktə et</button></td>
        </tr>
      `;
    }).join("");
    if (filtered.length > 80) {
      productRows.insertAdjacentHTML("beforeend", `
        <tr>
          <td colspan="7" data-label="Məlumat"><small>İlk 80 nəticə göstərilir. Daha dəqiq tapmaq üçün axtarış və filtrdən istifadə et.</small></td>
        </tr>
      `);
    }
  };

  const renderCategoryRows = () => {
    if (!categoryRows) return;
    categoryRows.innerHTML = marketplace.categories.map((category) => `
        <tr>
          <td data-label="Qrup">${escapeHtml(category.group || "Ümumi")}</td>
          <td data-label="Kateqoriya">${escapeHtml(category.title)}</td>
          <td data-label="Subkateqoriya">${category.subcategories.length}</td>
          <td data-label="Məhsul">${countProductsBy("category", category.id)}</td>
        </tr>
      `).join("");
  };

  const rerenderAdminProducts = () => {
    renderStats();
    renderProductRows();
    renderCategoryRows();
    renderBackupSummary();
  };

  const setSupplierFormField = (name, value) => {
    const field = supplierForm?.elements.namedItem(name);
    if (field) field.value = value || "";
  };

  const fillSupplierForm = (supplier = {}) => {
    if (!supplierForm) return;
    supplierForm.reset();
    const shaped = supplier.id ? ensureAdminSupplierShape(supplier) : supplier;
    setSupplierFormField("id", shaped.id);
    setSupplierFormField("name", shaped.name);
    setSupplierFormField("type", shaped.type);
    setSupplierFormField("region", shaped.region);
    setSupplierFormField("status", shaped.status);
    setSupplierFormField("website", shaped.website);
    setSupplierFormField("contact", shaped.contact);
    setSupplierFormField("rating", shaped.rating);
    setSupplierFormField("responseTime", shaped.responseTime);
    setSupplierFormField("focus", shaped.focus);
  };

  const renderSupplierRows = () => {
    if (!supplierRows) return;
    supplierRows.innerHTML = (marketplace.suppliers || []).map((supplier) => `
      <tr>
        <td data-label="Şirkət">
          <strong>${escapeHtml(supplier.name)}</strong>
          <small>${escapeHtml(supplier.website || supplier.contact || "Əlaqə əlavə olunmayıb")}</small>
        </td>
        <td data-label="Tip">${escapeHtml(supplier.type)}</td>
        <td data-label="Region">${escapeHtml(supplier.region)}</td>
        <td data-label="Vəziyyət"><span class="status-pill">${escapeHtml(supplier.status)}</span></td>
        <td data-label="Sorğu">${escapeHtml(supplier.responseTime || "Qiymət sorğusu əsasında")}</td>
        <td data-label="Əməliyyat"><button class="table-action" type="button" data-admin-edit-supplier="${escapeAttr(supplier.id)}">Redaktə et</button></td>
      </tr>
    `).join("");
  };

  const upsertSupplierInMemory = (supplier) => {
    const suppliers = marketplace.suppliers || [];
    const existingIndex = suppliers.findIndex((item) =>
      item.id === supplier.id || normalize(item.name) === normalize(supplier.name)
    );
    if (existingIndex >= 0) {
      suppliers[existingIndex] = { ...suppliers[existingIndex], ...supplier };
    } else {
      suppliers.push(supplier);
    }
    marketplace.suppliers = suppliers;
  };

  const getCurrentEntityType = () => entityTypeSelect?.value || "service";

  const renderEntityCategoryOptions = (entityType = getCurrentEntityType()) => {
    if (!entityCategorySelect) return;
    entityCategorySelect.innerHTML = groupCategories(getEntityCategories(entityType)).map((group) => `
      <optgroup label="${escapeAttr(group.name)}">
        ${group.categories.map((category) => `<option value="${escapeAttr(category.id)}">${escapeHtml(category.title)}</option>`).join("")}
      </optgroup>
    `).join("");
  };

  const updateEntitySubcategories = (selectedValue = "") => {
    if (!entityCategorySelect || !entitySubcategorySelect) return;
    const entityType = getCurrentEntityType();
    const category = getEntityCategories(entityType).find((item) => item.id === entityCategorySelect.value);
    const subcategories = category?.subcategories || [];
    entitySubcategorySelect.innerHTML = subcategories.map((item) =>
      `<option value="${escapeAttr(item)}">${escapeHtml(item)}</option>`
    ).join("");
    if (selectedValue && !subcategories.includes(selectedValue)) {
      entitySubcategorySelect.insertAdjacentHTML("beforeend", `<option value="${escapeAttr(selectedValue)}">${escapeHtml(selectedValue)}</option>`);
    }
    if (selectedValue) entitySubcategorySelect.value = selectedValue;
  };

  const setEntityFormField = (name, value) => {
    const field = entityForm?.elements.namedItem(name);
    if (field) field.value = value || "";
  };

  const fillEntityForm = (entityType = getCurrentEntityType(), item = {}) => {
    if (!entityForm || !entityTypeSelect) return;
    entityForm.reset();
    entityTypeSelect.value = entityType;
    const shaped = item.id ? ensureAdminEntityShape(entityType, item) : item;
    renderEntityCategoryOptions(entityType);
    setEntityFormField("id", shaped.id);
    setEntityFormField("title", getEntityTitle(entityType, shaped));
    setEntityFormField("itemType", shaped.type || "");
    setEntityFormField("category", shaped.category || getEntityCategories(entityType)[0]?.id || "");
    updateEntitySubcategories(shaped.subcategory);
    setEntityFormField("subcategory", shaped.subcategory);
    setEntityFormField("unit", shaped.unit);
    setEntityFormField("price", shaped.price);
    setEntityFormField("time", entityType === "service" ? shaped.leadTime : entityType === "package" ? shaped.timeline : shaped.delivery);
    setEntityFormField("team", entityType === "rental" ? shaped.operator : shaped.team);
    setEntityFormField("extra", entityType === "rental" ? shaped.capacity : entityType === "package" ? shaped.idealFor : "");
    setEntityFormField("specs", normalizeSpecs(entityType === "package" ? shaped.includes : shaped.specs).join("; "));
    setEntityFormField("deliverables", normalizeSpecs(shaped.deliverables).join("; "));
  };

  const upsertEntityInMemory = (entityType, item) => {
    const items = getEntityItems(entityType);
    const title = normalize(getEntityTitle(entityType, item));
    const existingIndex = items.findIndex((entry) => entry.id === item.id || normalize(getEntityTitle(entityType, entry)) === title);
    if (existingIndex >= 0) {
      items[existingIndex] = { ...items[existingIndex], ...item };
    } else {
      items.push(item);
    }
    setEntityItems(entityType, items);
  };

  const renderManagedEntityRows = (entityType, tbody) => {
    if (!tbody) return;
    const rows = getEntityItems(entityType).map((item) => {
      const category = getEntityCategories(entityType).find((entry) => entry.id === item.category);
      const title = getEntityTitle(entityType, item);
      const time = entityType === "service" ? item.leadTime : entityType === "package" ? item.timeline : item.operator;
      return `
        <tr>
          <td data-label="Ad">${escapeHtml(title)}</td>
          <td data-label="Kateqoriya">${escapeHtml(category?.title || item.category)}</td>
          <td data-label="Subkateqoriya">${escapeHtml(item.subcategory || "Ümumi")}</td>
          <td data-label="Vahid">${escapeHtml(item.unit)}</td>
          <td data-label="${entityType === "rental" ? "Operator" : "Qiymət"}">${escapeHtml(entityType === "rental" ? item.operator : item.price)}</td>
          <td data-label="${entityType === "rental" ? "Qiymət" : "Müddət"}">${escapeHtml(entityType === "rental" ? item.price : time)}</td>
          <td data-label="Əməliyyat"><button class="table-action" type="button" data-admin-edit-entity="${escapeAttr(item.id)}" data-admin-entity-kind="${escapeAttr(entityType)}">Redaktə et</button></td>
        </tr>
      `;
    }).join("");
    tbody.innerHTML = rows;
  };

  const rerenderAdminEntities = () => {
    renderStats();
    renderManagedEntityRows("service", serviceRows);
    renderManagedEntityRows("package", packageRows);
    renderManagedEntityRows("rental", rentalRows);
    renderBackupSummary();
  };

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveAdminTab(button.dataset.adminTab));
  });
  setActiveAdminTab(getStoredAdminTab());

  renderStats();
  renderCategoryOptions(formCategory);
  renderCategoryOptions(productCategoryFilter, "Bütün kateqoriyalar");
  updateFormSubcategories();
  if (brandList) {
    brandList.innerHTML = marketplace.brands
      .map((brand) => `<option value="${escapeAttr(brand.name)}"></option>`)
      .join("");
  }
  renderProductRows();
  renderCategoryRows();
  renderSupplierRows();
  renderBackupSummary();
  renderEntityCategoryOptions();
  updateEntitySubcategories();
  rerenderAdminEntities();

  exportBackupButton?.addEventListener("click", () => {
    const backup = createAdminBackup();
    const text = JSON.stringify(backup, null, 2);
    if (backupInput) backupInput.value = text;
    if (backupStatus) backupStatus.textContent = `Ehtiyat nüsxə hazırdır: ${adminBackupKeys.length} məlumat bloku ixrac edildi.`;
    renderBackupSummary();
  });
  downloadBackupButton?.addEventListener("click", () => {
    const text = backupInput?.value.trim() || JSON.stringify(createAdminBackup(), null, 2);
    downloadTextFile(`constera-admin-backup-${new Date().toISOString().slice(0, 10)}.json`, text);
    if (backupStatus) backupStatus.textContent = "Ehtiyat JSON faylı yükləndi.";
  });
  importBackupButton?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(backupInput?.value || "{}");
      if (!parsed.data || typeof parsed.data !== "object") {
        throw new Error("Ehtiyat məlumat bloku tapılmadı.");
      }
      const importedKeys = adminBackupKeys.filter((key) => Object.prototype.hasOwnProperty.call(parsed.data, key));
      importedKeys.forEach((key) => {
        storage.write(key, Array.isArray(parsed.data[key]) ? parsed.data[key] : []);
      });
      if (backupStatus) backupStatus.textContent = `${importedKeys.length} məlumat bloku idxal edildi. Səhifə yenilənir.`;
      renderBackupSummary();
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      if (backupStatus) backupStatus.textContent = `İdxal alınmadı: ${error.message}`;
    }
  });

  formCategory?.addEventListener("change", () => updateFormSubcategories());
  productSearch?.addEventListener("input", renderProductRows);
  productCategoryFilter?.addEventListener("change", renderProductRows);
  productPriceFilter?.addEventListener("change", renderProductRows);
  clearFormButton?.addEventListener("click", () => fillForm({ category: marketplace.categories[0]?.id || "" }));
  resetProductsButton?.addEventListener("click", () => {
    saveAdminProducts([]);
    if (importStatus) importStatus.textContent = "Lokal idarəetmə düzəlişləri silindi. Səhifə yenilənir.";
    window.location.reload();
  });

  productRows?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-edit-product]");
    if (!button) return;
    const product = marketplace.products.find((item) => item.id === button.dataset.adminEditProduct);
    if (!product) return;
    fillForm(product);
    productForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  productForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(productForm).entries());
    const existing = marketplace.products.find((product) =>
      (fields.id && product.id === fields.id) || normalize(product.sku) === normalize(fields.sku)
    );
    const shaped = ensureAdminProductShape({
      ...fields,
      id: fields.id || existing?.id || "",
      specs: fields.specs
    }, getAdminProducts().length);
    const nextAdminProducts = getAdminProducts()
      .filter((product) => product.id !== shaped.id && normalize(product.sku) !== normalize(shaped.sku));

    saveAdminProducts([...nextAdminProducts, shaped]);
    const existingIndex = marketplace.products.findIndex((product) =>
      product.id === shaped.id || normalize(product.sku) === normalize(shaped.sku)
    );
    if (existingIndex >= 0) {
      marketplace.products[existingIndex] = { ...marketplace.products[existingIndex], ...shaped };
    } else {
      marketplace.products.push(shaped);
    }
    if (importStatus) importStatus.textContent = `${shaped.name} yadda saxlanıldı. Kataloq bu brauzerdə yeniləndi.`;
    fillForm({ category: shaped.category });
    rerenderAdminProducts();
    window.ConstEraAPI?.saveProduct(shaped, Boolean(existing)).then(() => {
      if (importStatus) importStatus.textContent = `${shaped.name} lokal və PostgreSQL bazasında yadda saxlanıldı.`;
    }).catch((error) => {
      if (importStatus && !["database_not_configured", "authentication_required"].includes(error.code)) {
        importStatus.textContent = `${shaped.name} lokal saxlanıldı. Bulud xətası: ${error.message}`;
      }
    });
  });

  importCsvButton?.addEventListener("click", () => {
    const rows = parseCsvRows(csvInput?.value || "");
    const importedProducts = rows.map(productFromCsvRow).filter((product) => product.name && product.sku);
    if (!importedProducts.length) {
      if (importStatus) importStatus.textContent = "CSV idxalı üçün ən azı sku və ad sütunları lazımdır.";
      return;
    }

    const existingAdminProducts = getAdminProducts();
    const mergedBySku = new Map(existingAdminProducts.map((product) => [normalize(product.sku), product]));
    importedProducts.forEach((product) => {
      const existing = marketplace.products.find((item) => normalize(item.sku) === normalize(product.sku));
      mergedBySku.set(normalize(product.sku), { ...product, id: existing?.id || product.id });
    });
    saveAdminProducts([...mergedBySku.values()]);
    syncAdminProductOverlay();
    if (importStatus) importStatus.textContent = `${importedProducts.length} məhsul idxal edildi.`;
    rerenderAdminProducts();
  });

  exportCsvButton?.addEventListener("click", () => {
    const exported = productsToCsv(getFilteredAdminProducts());
    if (csvInput) csvInput.value = exported;
    if (importStatus) importStatus.textContent = "Cari filtrə uyğun məhsullar CSV kimi hazırlandı.";
  });

  supplierRows?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-edit-supplier]");
    if (!button) return;
    const supplier = (marketplace.suppliers || []).find((item) => item.id === button.dataset.adminEditSupplier);
    if (!supplier) return;
    fillSupplierForm(supplier);
    supplierForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  clearSupplierFormButton?.addEventListener("click", () => fillSupplierForm());
  resetSuppliersButton?.addEventListener("click", () => {
    saveAdminSuppliers([]);
    if (importStatus) importStatus.textContent = "Lokal təchizatçı düzəlişləri silindi. Səhifə yenilənir.";
    window.location.reload();
  });
  supplierForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(supplierForm).entries());
    const existing = (marketplace.suppliers || []).find((supplier) =>
      (fields.id && supplier.id === fields.id) || normalize(supplier.name) === normalize(fields.name)
    );
    const shaped = ensureAdminSupplierShape({
      ...fields,
      id: fields.id || existing?.id || ""
    }, getAdminSuppliers().length);
    const nextAdminSuppliers = getAdminSuppliers().filter((supplier) =>
      supplier.id !== shaped.id && normalize(supplier.name) !== normalize(shaped.name)
    );
    saveAdminSuppliers([...nextAdminSuppliers, shaped]);
    upsertSupplierInMemory(shaped);
    renderStats();
    renderSupplierRows();
    renderBackupSummary();
    fillSupplierForm();
    if (importStatus) importStatus.textContent = `${shaped.name} təchizatçı panelinə əlavə edildi.`;
    window.ConstEraAPI?.saveSupplier(shaped, Boolean(existing)).then(() => {
      if (importStatus) importStatus.textContent = `${shaped.name} lokal və PostgreSQL bazasında yadda saxlanıldı.`;
    }).catch((error) => {
      if (importStatus && !["database_not_configured", "authentication_required"].includes(error.code)) {
        importStatus.textContent = `${shaped.name} lokal saxlanıldı. Bulud xətası: ${error.message}`;
      }
    });
  });

  entityTypeSelect?.addEventListener("change", () => {
    const entityType = getCurrentEntityType();
    renderEntityCategoryOptions(entityType);
    updateEntitySubcategories();
    if (entityStatus) entityStatus.textContent = `${getEntityConfig(entityType).label} bölməsi seçildi.`;
  });
  entityCategorySelect?.addEventListener("change", () => updateEntitySubcategories());
  clearEntityFormButton?.addEventListener("click", () => fillEntityForm(getCurrentEntityType()));
  resetEntitiesButton?.addEventListener("click", () => {
    const entityType = getCurrentEntityType();
    saveAdminEntityItems(entityType, []);
    if (entityStatus) entityStatus.textContent = `${getEntityConfig(entityType).label} üzrə lokal düzəlişlər silindi. Səhifə yenilənir.`;
    window.location.reload();
  });

  [serviceRows, packageRows, rentalRows].forEach((tbody) => {
    tbody?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-admin-edit-entity]");
      if (!button) return;
      const entityType = button.dataset.adminEntityKind || "service";
      const item = getEntityItems(entityType).find((entry) => entry.id === button.dataset.adminEditEntity);
      if (!item) return;
      fillEntityForm(entityType, item);
      entityForm?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  entityForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(entityForm).entries());
    const entityType = fields.entityType || getCurrentEntityType();
    const existing = getEntityItems(entityType).find((item) =>
      (fields.id && item.id === fields.id) || normalize(getEntityTitle(entityType, item)) === normalize(fields.title)
    );
    const shaped = ensureAdminEntityShape(entityType, {
      ...fields,
      id: fields.id || existing?.id || "",
      type: fields.itemType,
      name: fields.title,
      title: fields.title,
      teamOrOperator: fields.team,
      extra: fields.extra,
      time: fields.time
    }, getAdminEntityItems(entityType).length);
    const title = normalize(getEntityTitle(entityType, shaped));
    const nextAdminItems = getAdminEntityItems(entityType)
      .filter((item) => item.id !== shaped.id && normalize(getEntityTitle(entityType, item)) !== title);

    saveAdminEntityItems(entityType, [...nextAdminItems, shaped]);
    upsertEntityInMemory(entityType, shaped);
    if (entityStatus) entityStatus.textContent = `${getEntityTitle(entityType, shaped)} yadda saxlanıldı.`;
    fillEntityForm(entityType, { category: shaped.category });
    rerenderAdminEntities();
    window.ConstEraAPI?.saveEntity({ ...shaped, entityType }, Boolean(existing)).then(() => {
      if (entityStatus) entityStatus.textContent = `${getEntityTitle(entityType, shaped)} lokal və PostgreSQL bazasında yadda saxlanıldı.`;
    }).catch((error) => {
      if (entityStatus && !["database_not_configured", "authentication_required"].includes(error.code)) {
        entityStatus.textContent = `${getEntityTitle(entityType, shaped)} lokal saxlanıldı. Bulud xətası: ${error.message}`;
      }
    });
  });

  importEntityCsvButton?.addEventListener("click", () => {
    const entityType = getCurrentEntityType();
    const rows = parseCsvRows(entityCsvInput?.value || "");
    const importedItems = rows.map((row, index) => entityFromCsvRow(entityType, row, index))
      .filter((item) => getEntityTitle(entityType, item));
    if (!importedItems.length) {
      if (entityStatus) entityStatus.textContent = "CSV idxalı üçün ən azı ad sütunu lazımdır.";
      return;
    }

    const mergedByTitle = new Map(getAdminEntityItems(entityType).map((item) => [normalize(getEntityTitle(entityType, item)), item]));
    importedItems.forEach((item) => {
      const title = normalize(getEntityTitle(entityType, item));
      const existing = getEntityItems(entityType).find((entry) => normalize(getEntityTitle(entityType, entry)) === title);
      const shaped = { ...item, id: existing?.id || item.id };
      mergedByTitle.set(title, shaped);
      upsertEntityInMemory(entityType, shaped);
    });
    saveAdminEntityItems(entityType, [...mergedByTitle.values()]);
    if (entityStatus) entityStatus.textContent = `${importedItems.length} ${getEntityConfig(entityType).label} idxal edildi.`;
    rerenderAdminEntities();
  });

  exportEntityCsvButton?.addEventListener("click", () => {
    const entityType = getCurrentEntityType();
    if (entityCsvInput) entityCsvInput.value = entitiesToCsv(entityType, getEntityItems(entityType));
    if (entityStatus) entityStatus.textContent = `${getEntityConfig(entityType).label} bölməsi CSV kimi hazırlandı.`;
  });
};

const initRfq = () => {
  const form = document.querySelector("[data-rfq-form]");
  const output = document.querySelector("[data-rfq-output]");
  const productSelect = document.querySelector("[data-product-select]");
  const supplierSelect = document.querySelector("[data-rfq-supplier-select]");
  const aiPrompt = document.querySelector("[data-rfq-ai-prompt]");
  const aiGenerate = document.querySelector("[data-rfq-ai-generate]");
  const aiResult = document.querySelector("[data-rfq-ai-result]");
  const aiStatus = document.querySelector("[data-rfq-ai-status]");
  if (!form || !output || !productSelect) return;

  let latestAiRfq = null;
  let approvedAiRfqDraft = null;

  const serviceOptions = (marketplace.serviceCategories || [])
    .map((category) => {
      const options = (marketplace.services || [])
        .filter((service) => service.category === category.id)
        .map((service) => `<option value="service:${escapeAttr(service.id)}">${escapeHtml(service.title)} — ${escapeHtml(service.subcategory || "Ümumi")}</option>`)
        .join("");
      return options ? `<optgroup label="Xidmətlər - ${escapeAttr(category.title)}">${options}</optgroup>` : "";
    })
    .join("");
  const packageOptions = (marketplace.packageCategories || [])
    .map((category) => {
      const options = (marketplace.packages || [])
        .filter((pack) => pack.category === category.id)
        .map((pack) => `<option value="package:${escapeAttr(pack.id)}">${escapeHtml(pack.title)} — ${escapeHtml(pack.subcategory || "Ümumi")}</option>`)
        .join("");
      return options ? `<optgroup label="Paketlər - ${escapeAttr(category.title)}">${options}</optgroup>` : "";
    })
    .join("");
  const rentalOptions = (marketplace.rentalCategories || [])
    .map((category) => {
      const options = (marketplace.rentals || [])
        .filter((rental) => rental.category === category.id)
        .map((rental) => `<option value="rental:${escapeAttr(rental.id)}">${escapeHtml(rental.name)} — ${escapeHtml(rental.subcategory || "Ümumi")}</option>`)
        .join("");
      return options ? `<optgroup label="İcarə - ${escapeAttr(category.title)}">${options}</optgroup>` : "";
    })
    .join("");
  const productOptions = marketplace.products
    .map((product) => `<option value="product:${escapeAttr(product.id)}">${escapeHtml(product.name)}</option>`)
    .join("");

  productSelect.innerHTML = `
    <option value="">Məhsul, xidmət, paket və ya avadanlıq seçin</option>
    <optgroup label="Məhsullar">${productOptions}</optgroup>
    ${serviceOptions}
    ${packageOptions}
    ${rentalOptions}
  `;
  if (supplierSelect) {
    supplierSelect.innerHTML = `
      <option value="">Açıq sorğu - bütün uyğun təchizatçılar</option>
      ${(marketplace.suppliers || []).map((supplier) => `
        <option value="${escapeAttr(supplier.id)}">${escapeHtml(supplier.name)} — ${escapeHtml(supplier.focus)}</option>
      `).join("")}
    `;
  }

  const params = new URLSearchParams(window.location.search);
  const requestedProjectId = params.get("project") || "";
  let requestedProjectEntries = [];
  const productId = params.get("product");
  const serviceId = params.get("service");
  const packageId = params.get("package");
  const rentalId = params.get("rental");
  if (productId && marketplace.products.some((product) => product.id === productId)) {
    productSelect.value = `product:${productId}`;
  }
  if (serviceId && (marketplace.services || []).some((service) => service.id === serviceId)) {
    productSelect.value = `service:${serviceId}`;
  }
  if (packageId && (marketplace.packages || []).some((pack) => pack.id === packageId)) {
    productSelect.value = `package:${packageId}`;
  }
  if (rentalId && (marketplace.rentals || []).some((rental) => rental.id === rentalId)) {
    productSelect.value = `rental:${rentalId}`;
  }
  const supplierId = params.get("supplier");
  if (supplierSelect && supplierId && (marketplace.suppliers || []).some((supplier) => supplier.id === supplierId)) {
    supplierSelect.value = supplierId;
  }
  const applyProjectRfq = (entries, profile) => {
    if (entries.length) {
      productSelect.value = "";
      if (form.elements.customProduct) {
        form.elements.customProduct.value = entries.map((entry) => entry.title).join(", ").slice(0, 1000);
      }
      if (form.elements.quantity) form.elements.quantity.value = `${entries.length} layihə mövqeyi`;
      if (form.elements.city) form.elements.city.value = profile.city || "";
      if (form.elements.usage) form.elements.usage.value = profile.title || "Vahid tikinti və təmir layihəsi";
      if (form.elements.deliveryMode) form.elements.deliveryMode.value = "Çatdırılma lazımdır";
      if (form.elements.note) {
        form.elements.note.value = [
          profile.area ? `Sahə: ${profile.area} m²` : "",
          profile.budget ? `Büdcə: ${profile.budget} AZN` : "",
          profile.note || "",
          "Layihə mövqeləri:",
          ...entries.map((entry, index) => `${index + 1}. ${entry.label}: ${entry.title} — ${entry.quantity} ${entry.unit || "mövqe"}`)
        ].filter(Boolean).join("\n").slice(0, 4000);
      }
    }
  };
  if (requestedProjectId) {
    const profile = getProjectProfile();
    requestedProjectEntries = getResolvedProjectBasket().map((entry) => ({
      type: entry.type,
      id: entry.id,
      title: getProjectEntityTitle(entry),
      quantity: entry.quantity,
      unit: entry.entity.unit || entry.entity.package || "mövqe",
      label: entry.config.label,
      specs: [entry.entity.subcategory, entry.entity.brand].filter(Boolean)
    }));
    applyProjectRfq(requestedProjectEntries, profile);
    if (requestedProjectId !== "1" && window.ConstEraAPI?.projectWorkspace) {
      window.ConstEraAPI.projectWorkspace(requestedProjectId).then((response) => {
        const workspace = response.data || {};
        requestedProjectEntries = (workspace.items || []).map((item) => ({
          type: item.type,
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          unit: item.unit || "mövqe",
          label: getEntityConfig(item.type)?.label || "Mövqe",
          specs: [item.snapshot?.category, item.snapshot?.subcategory, item.snapshot?.brand].filter(Boolean)
        }));
        applyProjectRfq(requestedProjectEntries, workspace.project || profile);
      }).catch(() => null);
    }
  }

  const rentalRequestFields = [...form.querySelectorAll("[data-rental-request-field]")];
  const updateRentalRequestFields = () => {
    const isRental = String(productSelect.value || "").startsWith("rental:");
    rentalRequestFields.forEach((field) => {
      field.hidden = !isRental;
      field.querySelectorAll("input, select, textarea").forEach((input) => {
        input.disabled = !isRental;
        if (input.name === "address" || input.name === "rentalDuration") input.required = isRental;
      });
    });
  };
  productSelect.addEventListener("change", updateRentalRequestFields);
  updateRentalRequestFields();

  const renderAiRfqDraft = () => {
    if (!aiResult || !latestAiRfq) return;
    const draft = latestAiRfq.draft || {};
    const approvalStatus = latestAiRfq.approval?.status || "pending";
    const confidence = Number.isFinite(Number(draft.confidence))
      ? `${Math.round(Number(draft.confidence) * 100)}%`
      : "-";
    aiResult.hidden = false;
    aiResult.innerHTML = `
      <div>
        <strong>${escapeHtml(draft.title || "RFQ qaralaması")} · ${escapeHtml(confidence)} etibar</strong>
        <p class="admin-import-status">${escapeHtml(draft.summary || "Məlumatları yoxla və formaya tətbiq et.")}</p>
      </div>
      <div class="rfq-ai-item-list">
        ${(draft.items || []).map((item) => `
          <article class="rfq-ai-item">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.quantity)} ${escapeHtml(item.unit || "ədəd")}</span>
            ${(item.specs || []).length ? `<small>${item.specs.map((spec) => escapeHtml(spec)).join(" · ")}</small>` : ""}
          </article>
        `).join("")}
      </div>
      ${(draft.warnings || []).length ? `<p class="admin-import-status" data-type="warning"><strong>Yoxlanmalı:</strong> ${draft.warnings.map((warning) => escapeHtml(warning)).join(" · ")}</p>` : ""}
      <div class="admin-actions">
        ${approvalStatus === "pending" ? `<button class="button button-primary" type="button" data-rfq-ai-approve data-run-id="${escapeAttr(latestAiRfq.runId || "")}">Yoxladım və formaya tətbiq et</button>` : ""}
        <span class="status-pill">${approvalStatus === "approved" ? "Təsdiqlənib və tətbiq edilib" : approvalStatus === "rejected" ? "Rədd edilib" : "İnsan təsdiqi gözləyir"}</span>
      </div>
    `;
  };

  const setSelectIfAvailable = (select, value) => {
    if (!select || !value) return;
    if ([...select.options].some((option) => option.value === value)) select.value = value;
  };

  const applyAiRfqDraft = (draft) => {
    const firstItem = draft?.items?.[0];
    if (!firstItem) return;
    const productValue = firstItem.productId ? `product:${firstItem.productId}` : "";
    if (productValue && [...productSelect.options].some((option) => option.value === productValue)) {
      productSelect.value = productValue;
      if (form.elements.customProduct) form.elements.customProduct.value = "";
    } else {
      productSelect.value = "";
      if (form.elements.customProduct) form.elements.customProduct.value = firstItem.title || draft.title || "";
    }
    if (form.elements.quantity) form.elements.quantity.value = `${firstItem.quantity} ${firstItem.unit || "ədəd"}`;
    setSelectIfAvailable(form.elements.priority, draft.priority);
    setSelectIfAvailable(form.elements.budget, draft.budget);
    setSelectIfAvailable(form.elements.deliveryMode, draft.deliveryMode);
    if (form.elements.needDate && draft.needDate) form.elements.needDate.value = draft.needDate;
    if (form.elements.usage && draft.usage) form.elements.usage.value = draft.usage;
    if (form.elements.note) {
      form.elements.note.value = [draft.note, ...(draft.warnings || []).map((warning) => `Yoxlanmalı: ${warning}`)]
        .filter(Boolean)
        .join("\n");
    }
    approvedAiRfqDraft = draft;
    updateRentalRequestFields();
  };

  aiGenerate?.addEventListener("click", async () => {
    const prompt = String(aiPrompt?.value || "").trim();
    if (prompt.length < 8) {
      if (aiStatus) aiStatus.textContent = "Ehtiyacı ən azı 8 simvolla təsvir et.";
      aiPrompt?.focus();
      return;
    }
    if (!window.ConstEraAPI?.aiRfqDraft) return;
    const selectedValue = String(productSelect.value || "");
    const [selectedType, selectedId] = selectedValue.split(":");
    latestAiRfq = null;
    approvedAiRfqDraft = null;
    aiGenerate.disabled = true;
    try {
      if (aiStatus) aiStatus.textContent = "Real kataloq məhsulları seçilir və RFQ qaralaması hazırlanır...";
      const response = await window.ConstEraAPI.aiRfqDraft({
        prompt,
        productIds: selectedType === "product" && selectedId ? [selectedId] : [],
        city: form.elements.city?.value || "",
        needDate: form.elements.needDate?.value || "",
        budget: form.elements.budget?.value || "",
        deliveryMode: form.elements.deliveryMode?.value || "",
        priority: form.elements.priority?.value || "Normal",
        usage: form.elements.usage?.value || ""
      });
      latestAiRfq = response.data || null;
      renderAiRfqDraft();
      if (aiStatus) aiStatus.textContent = "Qaralama hazırdır. Formaya köçürməzdən əvvəl bütün material sətirlərini yoxla.";
    } catch (error) {
      if (aiStatus) aiStatus.textContent = error.code === "authentication_required"
        ? "AI RFQ üçün əvvəl hesabına daxil ol. Mövcud formanı əl ilə istifadə edə bilərsən."
        : error.message || "AI RFQ qaralaması hazırlanmadı.";
    } finally {
      aiGenerate.disabled = false;
    }
  });

  aiResult?.addEventListener("click", async (event) => {
    const approveButton = event.target.closest("[data-rfq-ai-approve]");
    if (!approveButton || !latestAiRfq || !window.ConstEraAPI?.reviewAiRun) return;
    approveButton.disabled = true;
    try {
      const response = await window.ConstEraAPI.reviewAiRun(
        approveButton.dataset.runId,
        "approve",
        "İstifadəçi RFQ qaralamasını yoxladı və formaya tətbiq etdi."
      );
      latestAiRfq = {
        ...latestAiRfq,
        approval: { ...latestAiRfq.approval, status: response.data?.approvalStatus || "approved" }
      };
      applyAiRfqDraft(latestAiRfq.draft);
      renderAiRfqDraft();
      if (aiStatus) aiStatus.textContent = "AI qaralaması təsdiqləndi və formaya tətbiq edildi. Əlaqə məlumatlarını tamamlayıb göndər.";
    } catch (error) {
      if (aiStatus) aiStatus.textContent = error.message || "AI RFQ qaralaması təsdiqlənmədi.";
      approveButton.disabled = false;
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const selectedValue = String(data.get("product") || "");
    const [selectedType, selectedId] = selectedValue.split(":");
    const selectedProduct = marketplace.products.find((product) => selectedType === "product" && product.id === selectedId);
    const selectedService = (marketplace.services || []).find((service) => selectedType === "service" && service.id === selectedId);
    const selectedPackage = (marketplace.packages || []).find((pack) => selectedType === "package" && pack.id === selectedId);
    const selectedRental = (marketplace.rentals || []).find((rental) => selectedType === "rental" && rental.id === selectedId);
    const selectedSupplierId = String(data.get("supplierId") || "");
    const selectedSupplier = (marketplace.suppliers || []).find((supplier) => supplier.id === selectedSupplierId);
    const contactName = String(data.get("contactName") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const email = String(data.get("contact") || "").trim();
    const address = String(data.get("address") || "").trim();
    const rentalDuration = String(data.get("rentalDuration") || "").trim();
    const operatorPreference = String(data.get("operatorPreference") || "").trim();
    const rentalNote = selectedType === "rental"
      ? [`Ünvan: ${address}`, `İcarə müddəti: ${rentalDuration}`, `Operator: ${operatorPreference || "sorğuda dəqiqləşsin"}`].join("\n")
      : "";
    const submittedTitle = selectedProduct?.name || selectedService?.title || selectedPackage?.title || selectedRental?.name || data.get("customProduct");
    const aiItems = approvedAiRfqDraft?.items?.length
      ? approvedAiRfqDraft.items.map((item, index) => index === 0 ? {
        ...item,
        kind: selectedType || (item.productId ? "product" : "custom"),
        productId: selectedId || item.productId || "",
        title: submittedTitle || item.title,
        quantityText: data.get("quantity")
      } : { ...item, kind: item.productId ? "product" : "custom" })
      : [];
    const projectItems = requestedProjectEntries.map((item) => ({
      kind: item.type || "custom",
      itemId: item.id || "",
      title: item.title,
      quantity: item.quantity,
      quantityText: `${item.quantity} ${item.unit || "mövqe"}`,
      unit: item.unit || "mövqe",
      specs: item.specs || []
    }));
    const rfq = {
      id: `rfq-${Date.now()}`,
      type: selectedType || "custom",
      sourceId: selectedId || "",
      status: "Yeni",
      supplierId: selectedSupplierId,
      supplier: selectedSupplier?.name || "Açıq sorğu",
      priority: data.get("priority") || "Normal",
      product: submittedTitle,
      quantity: data.get("quantity"),
      items: aiItems.length ? aiItems : projectItems,
      projectId: requestedProjectId && requestedProjectId !== "1"
        ? requestedProjectId
        : (getProjectProfile().id || ""),
      aiRunId: approvedAiRfqDraft ? latestAiRfq?.runId || "" : "",
      needDate: data.get("needDate"),
      budget: data.get("budget"),
      deliveryMode: data.get("deliveryMode"),
      usage: data.get("usage"),
      company: data.get("company"),
      contactName,
      phone,
      email,
      contact: [contactName, phone, email].filter(Boolean).join(" · "),
      city: data.get("city"),
      address,
      rentalDuration,
      operatorPreference,
      note: [String(data.get("note") || "").trim(), rentalNote].filter(Boolean).join("\n"),
      legalAccepted: data.get("legalAccepted") === "true",
      sourcePath: `${window.location.pathname}${window.location.search}`,
      createdAt: new Date().toISOString()
    };

    const existing = storage.read("constera-rfq-drafts");
    existing.unshift(rfq);
    storage.write("constera-rfq-drafts", existing.slice(0, 20));

    output.hidden = false;
    output.innerHTML = `
      <strong>Sorğu hazırdır.</strong>
      <span>${escapeHtml(rfq.product || "Məhsul")} · ${escapeHtml(rfq.quantity || "miqdar yazılmayıb")} · ${escapeHtml(rfq.company || "şirkət")}</span>
      <span>${escapeHtml(rfq.supplier)} · ${escapeHtml(rfq.priority)} · ${escapeHtml(rfq.needDate || "tarix açıqdır")} · ${escapeHtml(rfq.deliveryMode || "çatdırılma/operator seçilməyib")}</span>
      ${rfq.type === "rental" ? `<span>${escapeHtml(rfq.rentalDuration)} · ${escapeHtml(rfq.address)} · ${escapeHtml(rfq.operatorPreference || "operator sorğuda dəqiqləşir")}</span>` : ""}
      <a class="button button-secondary" href="rfq-dashboard.html">Sorğu panelində aç</a>
      <small data-rfq-cloud-status>Sorğu lokal ehtiyat nüsxəsində saxlanıldı. Server bağlantısı yoxlanılır...</small>
    `;

    const cloudStatus = output.querySelector("[data-rfq-cloud-status]");
    if (window.ConstEraAPI?.createRfq) {
      window.ConstEraAPI.createRfq(rfq).then((result) => {
        const drafts = storage.read("constera-rfq-drafts").map((draft) =>
          draft.id === rfq.id ? { ...draft, cloudId: result.data?.id || "", cloudSyncedAt: new Date().toISOString() } : draft
        );
        storage.write("constera-rfq-drafts", drafts);
        if (cloudStatus) cloudStatus.textContent = `Sorğu serverdə qeydə alındı: ${result.data?.id || "qəbul edildi"}.`;
      }).catch((error) => {
        if (cloudStatus) {
          cloudStatus.textContent = error.code === "database_not_configured"
            ? "PostgreSQL hələ qoşulmayıb. Sorğu lokal ehtiyat nüsxəsində saxlanıldı."
            : "Serverə göndərilmədi. Sorğu lokal ehtiyat nüsxəsində qorunur və sonradan təkrar göndərilə bilər.";
        }
      });
    } else if (cloudStatus) {
      cloudStatus.textContent = "Sorğu lokal ehtiyat nüsxəsində saxlanıldı.";
    }
  });
};

const renderRfqDashboard = () => {
  const stats = document.querySelector("[data-rfq-dashboard-stats]");
  const rows = document.querySelector("[data-rfq-dashboard-rows]");
  const empty = document.querySelector("[data-rfq-dashboard-empty]");
  const searchInput = document.querySelector("[data-rfq-search]");
  const statusFilter = document.querySelector("[data-rfq-status-filter]");
  const typeFilter = document.querySelector("[data-rfq-type-filter]");
  const supplierFilter = document.querySelector("[data-rfq-supplier-filter]");
  const sortFilter = document.querySelector("[data-rfq-sort-filter]");
  const exportButton = document.querySelector("[data-rfq-export]");
  const offerForm = document.querySelector("[data-rfq-offer-form]");
  const offerRfqSelect = document.querySelector("[data-rfq-offer-rfq]");
  const offerSupplierSelect = document.querySelector("[data-rfq-offer-supplier]");
  const offerStatus = document.querySelector("[data-rfq-offer-status]");
  const offerExportButton = document.querySelector("[data-rfq-offer-export]");
  const summaryPanel = document.querySelector("[data-rfq-summary-panel]");
  const summaryTitle = document.querySelector("[data-rfq-summary-title]");
  const summaryContent = document.querySelector("[data-rfq-summary-content]");
  const summaryStatus = document.querySelector("[data-rfq-summary-status]");
  const copySummaryButton = document.querySelector("[data-rfq-copy-summary]");
  const printSummaryButton = document.querySelector("[data-rfq-print-summary]");
  const aiCompareButton = document.querySelector("[data-rfq-ai-compare]");
  const aiComparisonResult = document.querySelector("[data-rfq-ai-comparison]");
  const createProposalButton = document.querySelector("[data-rfq-create-proposal]");
  const openProposalLink = document.querySelector("[data-rfq-open-proposal]");
  const proposalForm = document.querySelector("[data-rfq-proposal-form]");
  const proposalOfferSelect = document.querySelector("[data-rfq-proposal-offer]");
  const proposalStatus = document.querySelector("[data-rfq-proposal-status]");
  const cancelProposalButton = document.querySelector("[data-rfq-cancel-proposal]");
  const offerPanel = document.querySelector("[data-rfq-offer-panel]");
  const refreshButton = document.querySelector("[data-rfq-refresh]");
  const connectionStatus = document.querySelector("[data-rfq-connection-status]");
  if (!stats || !rows) return;
  let selectedSummaryId = "";
  let latestSummaryText = "";
  let cloudDrafts = null;
  let cloudUser = null;
  let aiProviderReady = false;
  const aiOfferComparisons = new Map();

  const typeLabels = {
    product: "Məhsul",
    service: "Xidmət",
    package: "Paket",
    rental: "İcarə",
    custom: "Sərbəst"
  };
  const proposalStatusLabels = {
    draft: "Qaralama",
    issued: "Göndərilib",
    accepted: "Qəbul edilib",
    expired: "Müddəti bitib",
    cancelled: "Ləğv edilib"
  };
  const statusList = ["Yeni", "Baxılır", "Təklif gözləyir", "Təklif alındı", "Bağlandı", "Ləğv edildi"];
  const supplierOptions = () => `
    <option value="">Açıq sorğu</option>
    ${(marketplace.suppliers || []).map((supplier) => `<option value="${escapeAttr(supplier.id)}">${escapeHtml(supplier.name)}</option>`).join("")}
  `;
  const parseOfferPrice = (price) => {
    if (Number.isFinite(Number(price?.priceAmount))) return Number(price.priceAmount);
    const normalizedPrice = String(price?.price || price?.price_text || price || "")
      .replace(/\s+/g, "")
      .replace(/azn|manat/gi, "")
      .replace(",", ".");
    const match = normalizedPrice.match(/\d+(\.\d+)?/);
    return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
  };
  const getBestOffer = (draft) => {
    const offers = Array.isArray(draft.offers) ? draft.offers : [];
    const accepted = offers.find((offer) => offer.status === "accepted");
    if (accepted) return accepted;
    return offers
      .filter((offer) => !offer.status || ["draft", "submitted"].includes(offer.status))
      .sort((a, b) => parseOfferPrice(a) - parseOfferPrice(b))[0];
  };
  const getPriorityScore = (priority) => ({
    "Təcili": 4,
    "Tender": 3,
    "Qiymət müqayisəsi": 2,
    "Normal": 1
  })[priority] || 0;
  const formatDisplayDate = (value) => {
    if (!value) return "Açıq";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("az-AZ");
  };
  const renderOfferText = (draft) => {
    const offers = Array.isArray(draft.offers) ? draft.offers : [];
    const latestProposal = Array.isArray(draft.proposals) ? draft.proposals[0] : null;
    const bestOffer = getBestOffer(draft);
    if (!bestOffer) {
      return `<span class="status-pill">0 təklif</span>`;
    }
    return `
      <strong>${escapeHtml(bestOffer.price || "Qiymət yoxdur")}</strong>
      <small>${bestOffer.status === "accepted" ? "Qalib · " : ""}${escapeHtml(bestOffer.supplier || "Təchizatçı")} · ${escapeHtml(bestOffer.leadTime || "müddət açıq")} · ${offers.length} təklif${bestOffer.orderNumber ? ` · Sifariş #${escapeHtml(bestOffer.orderNumber)}` : ""}${latestProposal ? ` · ${escapeHtml(latestProposal.documentNumber)}` : ""}</small>
    `;
  };

  const normalizeRfqStatus = (status) => ({
    "Təchizatçıya göndərildi": "Təklif gözləyir",
    "Cavab gözləyir": "Təklif gözləyir",
    "Təklif gəldi": "Təklif alındı",
    "Qiymət müqayisəsi": "Təklif alındı",
    "Qalib seçildi": "Bağlandı",
    "Təsdiqləndi": "Bağlandı"
  })[status] || (statusList.includes(status) ? status : "Yeni");
  const normalizeOffer = (offer = {}) => ({
    ...offer,
    id: offer.id || `offer-${Date.now()}`,
    supplierId: offer.supplierId || offer.supplier_id || "",
    supplier: offer.supplier || offer.supplier_name || "Təchizatçı",
    priceAmount: offer.priceAmount === null || offer.price_amount === null
      ? null
      : Number(offer.priceAmount ?? offer.price_amount),
    price: offer.price || offer.price_text || "Qiymət yoxdur",
    currency: offer.currency || "AZN",
    leadTime: offer.leadTime || offer.lead_time || "",
    orderId: offer.orderId || offer.order_id || offer.order?.id || "",
    orderNumber: Number(offer.orderNumber || offer.order_number || offer.order?.orderNumber || 0) || null,
    orderStatus: offer.orderStatus || offer.order_status || offer.order?.status || "",
    createdAt: offer.createdAt || offer.created_at || new Date().toISOString(),
    status: offer.status || "submitted"
  });
  const normalizeProposal = (proposal = {}) => ({
    ...proposal,
    id: proposal.id || "",
    documentNumber: proposal.documentNumber || proposal.document_number || "Kommersiya təklifi",
    version: Number(proposal.version || 1),
    status: proposal.status || "draft",
    totalAmount: Number(proposal.totalAmount ?? proposal.total_amount ?? 0),
    currency: proposal.currency || "AZN",
    validUntil: proposal.validUntil || proposal.valid_until || "",
    selectedOfferId: proposal.selectedOfferId || proposal.selected_offer_id || "",
    issuedAt: proposal.issuedAt || proposal.issued_at || "",
    acceptedAt: proposal.acceptedAt || proposal.accepted_at || "",
    createdAt: proposal.createdAt || proposal.created_at || ""
  });
  const normalizeCloudRfq = (rfq) => ({
    id: rfq.id,
    cloudId: rfq.id,
    type: rfq.rfq_type || rfq.type || "custom",
    status: normalizeRfqStatus(rfq.status),
    supplierId: rfq.supplier_id || rfq.supplierId || "",
    supplier: rfq.supplier_name || rfq.supplier || "Açıq sorğu",
    priority: rfq.priority || "Normal",
    product: rfq.title || rfq.product || "Sərbəst sorğu",
    quantity: rfq.items?.[0]?.quantity || rfq.quantity || "Miqdar yazılmayıb",
    company: rfq.company_name || rfq.company || "",
    contactName: rfq.contact_name || rfq.contactName || "",
    email: rfq.email || "",
    phone: rfq.phone || "",
    contact: rfq.contact || [rfq.contact_name, rfq.phone, rfq.email].filter(Boolean).join(" · "),
    city: rfq.city || "",
    address: rfq.address || "",
    needDate: rfq.need_date || rfq.needDate || "",
    budget: rfq.budget || "",
    deliveryMode: rfq.delivery_mode || rfq.deliveryMode || "",
    usage: rfq.usage_text || rfq.usage || "",
    note: rfq.note || "",
    items: rfq.items || [],
    offers: (rfq.offers || []).map(normalizeOffer),
    proposals: (rfq.proposals || []).map(normalizeProposal),
    createdAt: rfq.created_at || rfq.createdAt || new Date().toISOString(),
    updatedAt: rfq.updated_at || rfq.updatedAt || ""
  });
  const getDrafts = () => {
    let changed = false;
    const source = cloudDrafts ?? storage.read("constera-rfq-drafts");
    const drafts = source.map((draft, index) => {
      const next = {
        ...draft,
        id: draft.id || `rfq-migrated-${index}-${Date.parse(draft.createdAt || "") || index}`,
        type: draft.type || "custom",
        status: normalizeRfqStatus(draft.status),
        supplierId: draft.supplierId || "",
        supplier: draft.supplier || "Açıq sorğu",
        priority: draft.priority || "Normal",
        offers: Array.isArray(draft.offers) ? draft.offers.map(normalizeOffer) : [],
        proposals: Array.isArray(draft.proposals) ? draft.proposals.map(normalizeProposal) : []
      };
      if (!draft.id || !draft.type || !draft.status || draft.supplierId === undefined || !draft.priority || !Array.isArray(draft.offers) || !Array.isArray(draft.proposals)) changed = true;
      return next;
    });
    if (changed && cloudDrafts === null) storage.write("constera-rfq-drafts", drafts);
    return drafts;
  };
  const saveDrafts = (drafts) => {
    if (cloudDrafts === null) storage.write("constera-rfq-drafts", drafts);
    else cloudDrafts = drafts;
  };

  const renderOfferControls = (drafts) => {
    if (offerRfqSelect) {
      offerRfqSelect.innerHTML = `
        <option value="">Sorğu seç</option>
        ${drafts.map((draft) => `<option value="${escapeAttr(draft.id)}">${escapeHtml(draft.product || "Sərbəst sorğu")} · ${escapeHtml(draft.company || "şirkət yoxdur")}</option>`).join("")}
      `;
    }
    if (offerSupplierSelect) {
      offerSupplierSelect.innerHTML = cloudUser?.role === "supplier"
        ? '<option value="self">Şirkətim</option>'
        : `
          <option value="">Təchizatçı seç</option>
          ${(marketplace.suppliers || []).map((supplier) => `<option value="${escapeAttr(supplier.id)}">${escapeHtml(supplier.name)}</option>`).join("")}
        `;
    }
  };

  const updateDraft = (id, patch) => {
    const drafts = getDrafts().map((draft) => draft.id === id ? { ...draft, ...patch } : draft);
    saveDrafts(drafts);
    return drafts;
  };
  const buildSummaryText = (draft) => {
    if (!draft) return "";
    const offers = Array.isArray(draft.offers) ? draft.offers : [];
    const bestOffer = getBestOffer(draft);
    return [
      "ConstEra qiymət sorğusu xülasəsi",
      `Sorğu: ${draft.product || "Sərbəst sorğu"}`,
      `Miqdar: ${draft.quantity || "Yazılmayıb"}`,
      `Şirkət: ${draft.company || "Yazılmayıb"}`,
      `Əlaqə: ${draft.contact || "Yazılmayıb"}`,
      `Şəhər/Rayon: ${draft.city || "Açıq"}`,
      `Təchizatçı: ${draft.supplier || "Açıq sorğu"}`,
      `Vəziyyət: ${draft.status || "Yeni"}`,
      `Prioritet: ${draft.priority || "Normal"}`,
      `Tələb tarixi: ${formatDisplayDate(draft.needDate)}`,
      `Büdcə: ${draft.budget || "Seçilməyib"}`,
      `Çatdırılma/operator: ${draft.deliveryMode || "Seçilməyib"}`,
      `Qeyd: ${draft.note || draft.usage || "Qeyd yoxdur"}`,
      bestOffer ? `Ən uyğun təklif: ${bestOffer.supplier || "Təchizatçı"} - ${bestOffer.price || "Qiymət yoxdur"} (${bestOffer.leadTime || "müddət açıq"})` : "Ən uyğun təklif: hələ yoxdur",
      offers.length ? "Təkliflər:" : "",
      ...offers.map((offer, index) => `${index + 1}. ${offer.supplier || "Təchizatçı"} - ${offer.price || "Qiymət yoxdur"}; müddət: ${offer.leadTime || "açıq"}; çatdırılma: ${offer.delivery || "açıq"}; zəmanət: ${offer.warranty || "açıq"}`)
    ].filter(Boolean).join("\n");
  };
  const copyText = async (text) => {
    if (!text) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback below handles browsers without clipboard permission.
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.className = "clipboard-fallback";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  };
  const canUseAiComparison = (draft) => cloudDrafts !== null
    && ["super_admin", "admin", "sales", "customer"].includes(cloudUser?.role)
    && (draft.offers || []).filter((offer) => offer.status !== "withdrawn").length >= 2;
  const renderAiOfferComparison = (draft) => {
    if (!aiComparisonResult) return;
    const state = aiOfferComparisons.get(draft.id);
    if (!state?.comparison) {
      aiComparisonResult.hidden = true;
      aiComparisonResult.innerHTML = "";
      return;
    }
    const comparison = state.comparison;
    const approvalStatus = state.approval?.status || state.approvalStatus || "pending";
    const recommended = (comparison.rankedOffers || [])
      .find((offer) => offer.offerId === comparison.recommendedOfferId);
    const accepted = (draft.offers || []).find((offer) => offer.status === "accepted");
    const canAwardRecommended = approvalStatus === "approved"
      && recommended
      && !comparison.locked
      && !accepted
      && ["super_admin", "admin", "sales", "customer"].includes(cloudUser?.role);
    const confidence = Number.isFinite(Number(comparison.confidence))
      ? `${Math.round(Number(comparison.confidence) * 100)}%`
      : "-";
    aiComparisonResult.hidden = false;
    aiComparisonResult.innerHTML = `
      <div class="rfq-ai-comparison-head">
        <div>
          <p class="eyebrow">AI satınalma analizi</p>
          <h3>${recommended ? `${escapeHtml(recommended.supplier)} tövsiyə olunur` : "Əlavə məlumat tələb olunur"}</h3>
          <p>${escapeHtml(comparison.summary || "Təkliflər müqayisə edildi.")}</p>
        </div>
        <div class="rfq-ai-confidence" aria-label="AI nəticəsinin etibar göstəricisi">
          <strong>${escapeHtml(confidence)}</strong>
          <span>etibar</span>
        </div>
      </div>
      <div class="rfq-ai-rank-list">
        ${(comparison.rankedOffers || []).map((offer, index) => `
          <article class="rfq-ai-rank-row ${offer.offerId === comparison.recommendedOfferId ? "is-recommended" : ""}">
            <div class="rfq-ai-rank-number">${index + 1}</div>
            <div class="rfq-ai-rank-main">
              <strong>${escapeHtml(offer.supplier || "Təchizatçı")}</strong>
              <span>${escapeHtml(offer.price || "Sorğu əsasında")} · ${escapeHtml(offer.leadTime || "müddət göstərilməyib")}</span>
              <small>${escapeHtml(offer.reason || "Kommersiya şərtlərinə əsasən qiymətləndirilib.")}</small>
            </div>
            <div class="rfq-ai-rank-score">
              <strong>${Math.round(Number(offer.score || 0) * 100)}</strong>
              <span>AI balı</span>
              <small>${Math.round(Number(offer.deterministicScore || 0))} fakt balı</small>
            </div>
            <div class="rfq-ai-rank-facts">
              ${(offer.strengths || []).length ? `<p><strong>Üstünlük:</strong> ${(offer.strengths || []).map((item) => escapeHtml(item)).join(" · ")}</p>` : ""}
              ${(offer.risks || []).length ? `<p data-type="warning"><strong>Risk:</strong> ${(offer.risks || []).map((item) => escapeHtml(item)).join(" · ")}</p>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
      ${(comparison.warnings || []).length ? `<p class="admin-import-status" data-type="warning"><strong>Yoxlanmalı:</strong> ${(comparison.warnings || []).map((item) => escapeHtml(item)).join(" · ")}</p>` : ""}
      ${(comparison.questions || []).length ? `<p class="admin-import-status"><strong>Təchizatçıdan soruş:</strong> ${(comparison.questions || []).map((item) => escapeHtml(item)).join(" · ")}</p>` : ""}
      <div class="admin-actions rfq-ai-decision-actions">
        ${approvalStatus === "pending" ? `
          <button class="button button-primary" type="button" data-rfq-ai-review="approve" data-run-id="${escapeAttr(state.runId || "")}">Analizi təsdiqlə</button>
          <button class="button button-outline" type="button" data-rfq-ai-review="reject" data-run-id="${escapeAttr(state.runId || "")}">Rədd et</button>
        ` : ""}
        ${canAwardRecommended ? `<button class="button button-primary" type="button" data-rfq-offer-select="${escapeAttr(recommended.offerId)}" data-rfq-offer-rfq="${escapeAttr(draft.id)}">Tövsiyə olunan təklifi seç</button>` : ""}
        <span class="status-pill">${approvalStatus === "approved" ? "İnsan tərəfindən təsdiqlənib" : approvalStatus === "rejected" ? "Rədd edilib" : "İnsan təsdiqi gözləyir"}</span>
      </div>
      ${comparison.locked ? '<p class="admin-import-status">RFQ artıq qalib təklifə bağlanıb. Bu analiz məlumat xarakterlidir.</p>' : ""}
    `;
  };
  const renderSummaryPanel = (draft) => {
    if (!summaryPanel || !summaryContent || !draft) return;
    const offers = Array.isArray(draft.offers) ? draft.offers : [];
    const proposals = Array.isArray(draft.proposals) ? draft.proposals : [];
    const latestProposal = proposals[0] || null;
    const bestOffer = getBestOffer(draft);
    const canCreateProposal = cloudDrafts !== null
      && ["super_admin", "admin", "sales"].includes(cloudUser?.role)
      && offers.some((offer) => Number.isFinite(parseOfferPrice(offer)) && parseOfferPrice(offer) > 0 && offer.supplierId);
    const canChooseOffer = cloudDrafts === null;
    latestSummaryText = buildSummaryText(draft);
    selectedSummaryId = draft.id;
    summaryPanel.hidden = false;
    if (proposalForm && proposalForm.elements.rfqId?.value !== draft.id) proposalForm.hidden = true;
    if (createProposalButton) createProposalButton.hidden = !canCreateProposal;
    if (aiCompareButton) {
      const canCompare = canUseAiComparison(draft);
      aiCompareButton.hidden = !canCompare;
      aiCompareButton.disabled = canCompare && !aiProviderReady;
      aiCompareButton.textContent = aiOfferComparisons.has(draft.id) ? "AI müqayisəsini yenilə" : "AI ilə müqayisə et";
      aiCompareButton.title = canCompare && !aiProviderReady ? "OpenAI bağlantısı hazır deyil" : "";
    }
    if (openProposalLink) {
      openProposalLink.hidden = !latestProposal?.id;
      openProposalLink.href = latestProposal?.id
        ? `proposal-detail.html?proposal=${encodeURIComponent(latestProposal.id)}`
        : "proposal-detail.html";
      openProposalLink.textContent = latestProposal?.status === "accepted" ? "Qəbul edilmiş təklifi aç" : "Son təklifi aç";
    }
    if (summaryTitle) summaryTitle.textContent = draft.product || "Sərbəst sorğu";
    summaryContent.innerHTML = `
      <article class="rfq-summary-head">
        <span class="data-badge">${escapeHtml(draft.status || "Yeni")}</span>
        <h3>${escapeHtml(draft.product || "Sərbəst sorğu")}</h3>
        <p class="rfq-summary-note">${escapeHtml(draft.note || draft.usage || "Qeyd əlavə edilməyib.")}</p>
      </article>
      <dl class="rfq-summary-grid">
        <div><dt>Miqdar</dt><dd>${escapeHtml(draft.quantity || "Yazılmayıb")}</dd></div>
        <div><dt>Şirkət</dt><dd>${escapeHtml(draft.company || "Yazılmayıb")}</dd></div>
        <div><dt>Əlaqə</dt><dd>${escapeHtml(draft.contact || "Yazılmayıb")}</dd></div>
        <div><dt>Şəhər/Rayon</dt><dd>${escapeHtml(draft.city || "Açıq")}</dd></div>
        <div><dt>Təchizatçı</dt><dd>${escapeHtml(draft.supplier || "Açıq sorğu")}</dd></div>
        <div><dt>Prioritet</dt><dd>${escapeHtml(draft.priority || "Normal")}</dd></div>
        <div><dt>Tələb tarixi</dt><dd>${escapeHtml(formatDisplayDate(draft.needDate))}</dd></div>
        <div><dt>Büdcə</dt><dd>${escapeHtml(draft.budget || "Seçilməyib")}</dd></div>
        <div><dt>Çatdırılma/operator</dt><dd>${escapeHtml(draft.deliveryMode || "Seçilməyib")}</dd></div>
        <div><dt>${bestOffer?.status === "accepted" ? "Qalib təklif" : "Ən aşağı təklif"}</dt><dd>${bestOffer ? `${escapeHtml(bestOffer.supplier || "Təchizatçı")} · ${escapeHtml(bestOffer.price || "Qiymət yoxdur")}` : "Hələ yoxdur"}</dd></div>
        <div><dt>Kommersiya təklifi</dt><dd>${latestProposal ? `${escapeHtml(latestProposal.documentNumber)} · ${escapeHtml(proposalStatusLabels[latestProposal.status] || latestProposal.status)}` : "Hələ yaradılmayıb"}</dd></div>
      </dl>
      <div class="rfq-offer-grid">
        ${offers.length ? offers.map((offer) => `
          <article class="rfq-offer-card ${offer.id === bestOffer?.id ? "is-best" : ""} ${offer.status === "accepted" ? "is-selected" : ""}">
            <span>${offer.status === "accepted" ? "Qalib təklif" : offer.status === "rejected" ? "Seçilməyib" : offer.id === bestOffer?.id ? "Ən aşağı təklif" : "Təchizatçı təklifi"}</span>
            <strong>${escapeHtml(offer.price || "Qiymət yoxdur")}</strong>
            <small>${escapeHtml(offer.supplier || "Təchizatçı")}</small>
            <small>Müddət: ${escapeHtml(offer.leadTime || "açıq")}</small>
            <small>Çatdırılma: ${escapeHtml(offer.delivery || "açıq")}</small>
            <small>Zəmanət: ${escapeHtml(offer.warranty || "açıq")}</small>
            <p class="rfq-summary-note">${escapeHtml(offer.note || "Qeyd yoxdur.")}</p>
            ${offer.orderId
              ? `<a class="button button-secondary" href="order-detail.html?order=${encodeURIComponent(offer.orderId)}">Sifariş #${escapeHtml(offer.orderNumber || "")} və proforma</a>`
              : ""}
            ${canChooseOffer && (!offer.status || ["draft", "submitted"].includes(offer.status))
              ? `<button class="button button-primary" type="button" data-rfq-offer-select="${escapeAttr(offer.id)}" data-rfq-offer-rfq="${escapeAttr(draft.id)}">Lokal qalib seç</button>`
              : ""}
          </article>
        `).join("") : `
          <article class="rfq-offer-card">
            <span>Təklif yoxdur</span>
            <strong>Sorğu gözləyir</strong>
            <small>Təchizatçı təklifi əlavə olunanda burada görünəcək.</small>
          </article>
        `}
      </div>
    `;
    renderAiOfferComparison(draft);
    if (summaryStatus) {
      const aiState = aiOfferComparisons.get(draft.id);
      summaryStatus.textContent = aiState?.comparison
        ? aiState.approval?.status === "approved"
          ? "AI müqayisəsi insan tərəfindən təsdiqlənib. Qərardan əvvəl qiymət və şərtləri son dəfə yoxla."
          : "AI müqayisəsi hazırdır. Qalib seçimindən əvvəl nəticəni təsdiqlə və ya rədd et."
        : latestProposal
        ? `${latestProposal.documentNumber} sənədi hazırdır. Açıb PDF kimi saxlaya və ya qəbul edə bilərsən.`
        : canCreateProposal
          ? "Təkliflər müqayisə edildi. İndi kommersiya təklifi yaradıb müştəriyə göndər."
          : "Təklif aktı hazırdır. Kommersiya sənədi üçün qiymətli təchizatçı təklifi tələb olunur.";
    }
  };

  const exportDrafts = (drafts) => {
    const headers = ["id", "status", "tip", "sorğu", "miqdar", "şirkət", "təchizatçı", "prioritet", "ən yaxşı təklif", "əlaqə", "tarix", "büdcə", "qeyd"];
    const csv = [headers.join(","), ...drafts.map((draft) => {
      const bestOffer = getBestOffer(draft);
      return [
        draft.id,
        draft.status,
        typeLabels[draft.type] || draft.type,
        draft.product,
        draft.quantity,
        draft.company,
        draft.supplier,
        draft.priority,
        bestOffer ? `${bestOffer.supplier}: ${bestOffer.price}` : "",
        draft.contact,
        draft.needDate,
        draft.budget,
        draft.note || draft.usage
      ].map(escapeCsvValue).join(",");
    })].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `constera-rfq-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportOffers = (drafts) => {
    const headers = ["sorğu id", "sorğu", "təchizatçı", "qiymət", "müddət", "çatdırılma", "zəmanət", "qeyd"];
    const rowsForOffers = drafts.flatMap((draft) =>
      (draft.offers || []).map((offer) => [
        draft.id,
        draft.product,
        offer.supplier,
        offer.price,
        offer.leadTime,
        offer.delivery,
        offer.warranty,
        offer.note
      ].map(escapeCsvValue).join(","))
    );
    const blob = new Blob([[headers.join(","), ...rowsForOffers].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `constera-rfq-offers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const render = () => {
    const drafts = getDrafts();
    const query = searchInput?.value || "";
    const activeStatus = statusFilter?.value || "all";
    const activeType = typeFilter?.value || "all";
    const activeSupplier = supplierFilter?.value || "all";
    const activeSort = sortFilter?.value || "newest";
    const filtered = drafts.filter((draft) => {
      const matchesStatus = activeStatus === "all" || draft.status === activeStatus;
      const matchesType = activeType === "all" || draft.type === activeType;
      const matchesSupplier = activeSupplier === "all" ||
        (activeSupplier === "open" && !draft.supplierId) ||
        draft.supplierId === activeSupplier;
      const matchesQuery = matchesExpandedSearch([
        draft.product,
        draft.quantity,
        draft.company,
        draft.contact,
        draft.city,
        draft.supplier,
        draft.note,
        draft.usage
      ].join(" "), query);
      return matchesStatus && matchesType && matchesSupplier && matchesQuery;
    }).sort((a, b) => {
      if (activeSort === "needDate") {
        return (Date.parse(a.needDate || "9999-12-31") || Number.MAX_SAFE_INTEGER) -
          (Date.parse(b.needDate || "9999-12-31") || Number.MAX_SAFE_INTEGER);
      }
      if (activeSort === "offers") {
        return (b.offers || []).length - (a.offers || []).length;
      }
      if (activeSort === "priority") {
        return getPriorityScore(b.priority) - getPriorityScore(a.priority);
      }
      return (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
    });
    const counts = statusList.reduce((acc, status) => {
      acc[status] = drafts.filter((draft) => draft.status === status).length;
      return acc;
    }, {});
    const offerCount = drafts.reduce((sum, draft) => sum + (draft.offers || []).length, 0);
    const acceptedCount = drafts.filter((draft) => (draft.offers || []).some((offer) => offer.status === "accepted")).length;
    const proposalCount = drafts.reduce((sum, draft) => sum + (draft.proposals || []).length, 0);
    const canManageRfq = cloudDrafts === null || ["super_admin", "admin", "sales"].includes(cloudUser?.role);

    stats.innerHTML = `
      <article class="stat-card"><span class="stat-value">${drafts.length}</span><p>ümumi sorğu</p></article>
      <article class="stat-card"><span class="stat-value">${counts["Yeni"] || 0}</span><p>yeni sorğu</p></article>
      <article class="stat-card"><span class="stat-value">${counts["Təklif gözləyir"] || 0}</span><p>təklif gözləyir</p></article>
      <article class="stat-card"><span class="stat-value">${counts["Təklif alındı"] || 0}</span><p>təklif alınıb</p></article>
      <article class="stat-card"><span class="stat-value">${offerCount}</span><p>təchizatçı təklifi</p></article>
      <article class="stat-card"><span class="stat-value">${proposalCount}</span><p>kommersiya təklifi</p></article>
      <article class="stat-card"><span class="stat-value">${acceptedCount}</span><p>qalib seçilib</p></article>
    `;

    rows.innerHTML = filtered.map((draft) => `
      <tr>
        <td data-label="Sorğu">
          <strong>${escapeHtml(draft.product || "Sərbəst sorğu")}</strong>
          <small>${escapeHtml(draft.note || draft.usage || "Qeyd yoxdur")}</small>
        </td>
        <td data-label="Tip">${escapeHtml(typeLabels[draft.type] || "Sərbəst")}</td>
        <td data-label="Miqdar">${escapeHtml(draft.quantity || "Yazılmayıb")}</td>
        <td data-label="Şirkət">${escapeHtml(draft.company || "Şirkət yoxdur")}</td>
        <td data-label="Təchizatçı">
          <select class="table-select" data-rfq-supplier="${escapeAttr(draft.id)}" aria-label="${escapeAttr(draft.product || "Sorğu")} üçün təchizatçı" ${canManageRfq ? "" : "disabled"}>
            ${supplierOptions()}
          </select>
        </td>
        <td data-label="Prioritet"><span class="status-pill">${escapeHtml(draft.priority || "Normal")}</span></td>
        <td data-label="Təkliflər">${renderOfferText(draft)}</td>
        <td data-label="Əlaqə">${escapeHtml(draft.contact || "Əlaqə yoxdur")}</td>
        <td data-label="Tarix">${escapeHtml(draft.needDate || "Açıq")}</td>
        <td data-label="Vəziyyət"><span class="status-pill">${escapeHtml(draft.status)}</span></td>
        <td data-label="Əməliyyat">
          <div class="status-actions">
            <button type="button" data-rfq-summary="${escapeAttr(draft.id)}">Aktı aç</button>
            <button type="button" data-rfq-copy="${escapeAttr(draft.id)}">Kopyala</button>
            ${canManageRfq ? statusList.map((status) => `
              <button type="button" data-rfq-status="${escapeAttr(status)}" data-rfq-id="${escapeAttr(draft.id)}">${escapeHtml(status)}</button>
            `).join("") : ""}
          </div>
        </td>
      </tr>
    `).join("");
    rows.querySelectorAll("[data-rfq-supplier]").forEach((select) => {
      const draft = filtered.find((item) => item.id === select.dataset.rfqSupplier);
      if (draft) select.value = draft.supplierId || "";
    });
    if (empty) empty.hidden = filtered.length > 0;
    renderOfferControls(drafts);
    if (selectedSummaryId) {
      const selectedDraft = drafts.find((draft) => draft.id === selectedSummaryId);
      if (selectedDraft) renderSummaryPanel(selectedDraft);
    }
  };

  if (statusFilter) {
    statusFilter.innerHTML = `<option value="all">Bütün vəziyyətlər</option>${statusList.map((status) => `<option value="${escapeAttr(status)}">${escapeHtml(status)}</option>`).join("")}`;
    statusFilter.addEventListener("change", render);
  }
  if (typeFilter) {
    typeFilter.innerHTML = `
      <option value="all">Bütün tiplər</option>
      ${Object.entries(typeLabels).map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join("")}
    `;
    typeFilter.addEventListener("change", render);
  }
  if (supplierFilter) {
    supplierFilter.innerHTML = `
      <option value="all">Bütün təchizatçılar</option>
      <option value="open">Açıq sorğu</option>
      ${(marketplace.suppliers || []).map((supplier) => `<option value="${escapeAttr(supplier.id)}">${escapeHtml(supplier.name)}</option>`).join("")}
    `;
    supplierFilter.addEventListener("change", render);
  }
  searchInput?.addEventListener("input", render);
  sortFilter?.addEventListener("change", render);
  exportButton?.addEventListener("click", () => exportDrafts(getDrafts()));
  offerExportButton?.addEventListener("click", () => exportOffers(getDrafts()));
  copySummaryButton?.addEventListener("click", async () => {
    const copied = await copyText(latestSummaryText);
    if (summaryStatus) summaryStatus.textContent = copied ? "Xülasə kopyalandı." : "Kopyalama alınmadı. Brauzer icazəsini yoxla.";
  });
  printSummaryButton?.addEventListener("click", () => {
    if (!selectedSummaryId && summaryStatus) {
      summaryStatus.textContent = "Əvvəlcə cədvəldən sorğu seç.";
      return;
    }
    const restoreProposalForm = proposalForm && !proposalForm.hidden;
    if (proposalForm) proposalForm.hidden = true;
    window.print();
    if (proposalForm && restoreProposalForm) proposalForm.hidden = false;
  });
  const fillProposalTermsFromOffer = (draft, offerId) => {
    if (!proposalForm || !draft) return;
    const offer = (draft.offers || []).find((item) => item.id === offerId);
    const deliveryTerms = proposalForm.elements.deliveryTerms;
    const warrantyTerms = proposalForm.elements.warrantyTerms;
    if (deliveryTerms) deliveryTerms.value = offer?.delivery || "";
    if (warrantyTerms) warrantyTerms.value = offer?.warranty || "";
  };
  createProposalButton?.addEventListener("click", () => {
    const draft = getDrafts().find((item) => item.id === selectedSummaryId);
    if (!draft || !proposalForm || !proposalOfferSelect) return;
    const eligibleOffers = (draft.offers || [])
      .filter((offer) => Number.isFinite(parseOfferPrice(offer)) && parseOfferPrice(offer) > 0 && offer.supplierId)
      .sort((a, b) => parseOfferPrice(a) - parseOfferPrice(b));
    if (!eligibleOffers.length) {
      if (summaryStatus) summaryStatus.textContent = "Əvvəlcə qiyməti və təchizatçısı təsdiqlənmiş təklif əlavə et.";
      return;
    }
    proposalForm.reset();
    proposalForm.elements.vatRate.disabled = false;
    proposalForm.elements.rfqId.value = draft.id;
    proposalOfferSelect.innerHTML = eligibleOffers.map((offer) => `
      <option value="${escapeAttr(offer.id)}">${escapeHtml(offer.supplier || "Təchizatçı")} · ${escapeHtml(offer.price || "Qiymət yoxdur")} · ${escapeHtml(offer.leadTime || "müddət açıq")}</option>
    `).join("");
    proposalOfferSelect.value = getBestOffer(draft)?.id || eligibleOffers[0].id;
    fillProposalTermsFromOffer(draft, proposalOfferSelect.value);
    proposalForm.hidden = false;
    proposalForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  proposalOfferSelect?.addEventListener("change", () => {
    const draft = getDrafts().find((item) => item.id === proposalForm?.elements.rfqId?.value);
    fillProposalTermsFromOffer(draft, proposalOfferSelect.value);
  });
  proposalForm?.elements.vatMode?.addEventListener("change", () => {
    const vatRateInput = proposalForm.elements.vatRate;
    if (!vatRateInput) return;
    const disabled = proposalForm.elements.vatMode.value === "not_applicable";
    vatRateInput.disabled = disabled;
    vatRateInput.value = disabled ? "0" : vatRateInput.value || "18";
  });
  cancelProposalButton?.addEventListener("click", () => {
    if (proposalForm) proposalForm.hidden = true;
  });
  proposalForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.ConstEraAPI?.createProposal || cloudDrafts === null) {
      if (proposalStatus) proposalStatus.textContent = "Kommersiya təklifi üçün canlı hesab və Neon bağlantısı tələb olunur.";
      return;
    }
    const data = new FormData(proposalForm);
    const submitButton = proposalForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    if (proposalStatus) proposalStatus.textContent = "Müqayisə və kommersiya şərtləri sənədə yazılır...";
    try {
      const result = await window.ConstEraAPI.createProposal({
        action: "issue",
        rfqId: data.get("rfqId"),
        selectedOfferId: data.get("selectedOfferId"),
        validDays: data.get("validDays"),
        discountAmount: data.get("discountAmount"),
        deliveryAmount: data.get("deliveryAmount"),
        vatMode: data.get("vatMode"),
        vatRate: data.get("vatRate"),
        paymentTerms: data.get("paymentTerms"),
        deliveryTerms: data.get("deliveryTerms"),
        warrantyTerms: data.get("warrantyTerms"),
        note: data.get("note")
      });
      await refreshCloudRfqs();
      if (proposalStatus) proposalStatus.textContent = `${result.data.documentNumber} yaradıldı və müştəriyə göndərildi.`;
      window.location.assign(`proposal-detail.html?proposal=${encodeURIComponent(result.data.id)}`);
    } catch (error) {
      if (proposalStatus) proposalStatus.textContent = error.message;
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
  const refreshAiComparisonHistory = async () => {
    if (!window.ConstEraAPI?.aiDashboard) return;
    const response = await window.ConstEraAPI.aiDashboard("mine");
    aiProviderReady = Boolean(response.data?.readiness?.structuredOutput);
    for (const run of response.data?.runs || []) {
      if (run.feature !== "offer_comparison" || !run.rfqId || !run.output || aiOfferComparisons.has(run.rfqId)) continue;
      aiOfferComparisons.set(run.rfqId, {
        runId: run.id,
        comparison: run.output,
        sources: run.sources || [],
        approval: { required: true, status: run.approvalStatus || "pending" }
      });
    }
  };
  const refreshCloudRfqs = async () => {
    if (!cloudUser || !window.ConstEraAPI?.rfqs) return;
    const result = await window.ConstEraAPI.rfqs();
    cloudDrafts = (result.data || []).map(normalizeCloudRfq);
    if (connectionStatus) connectionStatus.textContent = `Neon · ${cloudDrafts.length} sorğu`;
    render();
  };
  const connectRfqAccount = async () => {
    if (!window.ConstEraAPI?.session) return;
    try {
      const session = await window.ConstEraAPI.session();
      cloudUser = session.user;
      if (!cloudUser) {
        if (connectionStatus) connectionStatus.textContent = "Lokal ehtiyat · giriş tələb olunur";
        if (offerStatus) offerStatus.textContent = "Canlı sorğu və təkliflər üçün hesaba daxil ol.";
        return;
      }
      if (offerPanel) offerPanel.hidden = cloudUser.role === "customer";
      await refreshAiComparisonHistory().catch(() => {
        aiProviderReady = false;
      });
      await refreshCloudRfqs();
      if (offerStatus && cloudUser.role !== "customer") {
        offerStatus.textContent = `${cloudUser.name} hesabı Neon təklif moduluna qoşuldu.`;
      }
    } catch (error) {
      if (connectionStatus) connectionStatus.textContent = "Lokal ehtiyat";
      if (offerStatus) offerStatus.textContent = `Canlı sorğular yüklənmədi: ${error.message}`;
    }
  };

  offerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(offerForm);
    const rfqId = String(data.get("rfqId") || "");
    const supplierId = String(data.get("supplierId") || "");
    const supplier = (marketplace.suppliers || []).find((item) => item.id === supplierId);
    const draft = getDrafts().find((item) => item.id === rfqId);
    if (!draft || (cloudDrafts === null && !supplier)) {
      if (offerStatus) offerStatus.textContent = "Qiymət sorğusu və təchizatçı seçilməlidir.";
      return;
    }
    const submitButton = offerForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    if (cloudDrafts !== null && window.ConstEraAPI?.saveOffer) {
      try {
        await window.ConstEraAPI.saveOffer({
          rfqId,
          supplierId: supplierId === "self" ? "" : supplierId,
          price: data.get("price"),
          currency: "AZN",
          leadTime: data.get("leadTime"),
          delivery: data.get("delivery"),
          warranty: data.get("warranty"),
          note: data.get("note")
        });
        await refreshCloudRfqs();
        offerForm.reset();
        if (offerStatus) offerStatus.textContent = "Təklif Neon bazasında saxlandı.";
      } catch (error) {
        if (offerStatus) offerStatus.textContent = error.message;
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
      return;
    }
    const offer = {
      id: `offer-${Date.now()}`,
      supplierId,
      supplier: supplier.name,
      price: data.get("price"),
      leadTime: data.get("leadTime"),
      delivery: data.get("delivery"),
      warranty: data.get("warranty"),
      note: data.get("note"),
      createdAt: new Date().toISOString(),
      status: "submitted"
    };
    updateDraft(rfqId, {
      status: "Təklif alındı",
      offers: [...(draft.offers || []), offer]
    });
    offerForm.reset();
    if (offerStatus) offerStatus.textContent = `${supplier.name} təklifi əlavə edildi.`;
    if (submitButton) submitButton.disabled = false;
    render();
  });

  rows.addEventListener("click", async (event) => {
    const summaryButton = event.target.closest("[data-rfq-summary]");
    if (summaryButton) {
      const draft = getDrafts().find((item) => item.id === summaryButton.dataset.rfqSummary);
      if (!draft) return;
      renderSummaryPanel(draft);
      summaryPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const copyButton = event.target.closest("[data-rfq-copy]");
    if (copyButton) {
      const draft = getDrafts().find((item) => item.id === copyButton.dataset.rfqCopy);
      if (!draft) return;
      copyText(buildSummaryText(draft)).then((copied) => {
        if (offerStatus) offerStatus.textContent = copied ? "Sorğu xülasəsi kopyalandı." : "Kopyalama alınmadı.";
      });
      return;
    }
    const button = event.target.closest("[data-rfq-status]");
    if (!button) return;
    if (cloudDrafts !== null && window.ConstEraAPI?.updateRfq) {
      button.disabled = true;
      try {
        await window.ConstEraAPI.updateRfq(button.dataset.rfqId, button.dataset.rfqStatus);
        await refreshCloudRfqs();
        if (offerStatus) offerStatus.textContent = "Sorğunun vəziyyəti yeniləndi.";
      } catch (error) {
        if (offerStatus) offerStatus.textContent = error.message;
      }
      return;
    }
    updateDraft(button.dataset.rfqId, { status: button.dataset.rfqStatus });
    render();
  });
  rows.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-rfq-supplier]");
    if (!select) return;
    const supplier = (marketplace.suppliers || []).find((item) => item.id === select.value);
    if (cloudDrafts !== null && window.ConstEraAPI?.updateRfq) {
      select.disabled = true;
      try {
        await window.ConstEraAPI.updateRfq(select.dataset.rfqSupplier, {
          supplierId: select.value,
          status: select.value ? "Təklif gözləyir" : "Yeni"
        });
        await refreshCloudRfqs();
        if (offerStatus) offerStatus.textContent = select.value ? "Sorğu təchizatçıya yönləndirildi." : "Sorğu açıq vəziyyətə qaytarıldı.";
      } catch (error) {
        if (offerStatus) offerStatus.textContent = error.message;
        await refreshCloudRfqs();
      }
      return;
    }
    updateDraft(select.dataset.rfqSupplier, {
      supplierId: select.value,
      supplier: supplier?.name || "Açıq sorğu",
      status: select.value ? "Təklif gözləyir" : "Yeni"
    });
    render();
  });
  summaryPanel?.addEventListener("click", async (event) => {
    const compareButton = event.target.closest("[data-rfq-ai-compare]");
    if (compareButton) {
      const draft = getDrafts().find((item) => item.id === selectedSummaryId);
      if (!draft || !window.ConstEraAPI?.aiOfferComparison || !canUseAiComparison(draft)) return;
      compareButton.disabled = true;
      if (summaryStatus) summaryStatus.textContent = "Təkliflərin real qiymətləri, şərtləri və təchizatçı göstəriciləri AI ilə müqayisə olunur...";
      try {
        const response = await window.ConstEraAPI.aiOfferComparison(draft.id);
        aiOfferComparisons.set(draft.id, response.data || {});
        renderSummaryPanel(draft);
        if (summaryStatus) summaryStatus.textContent = "AI müqayisəsi hazırdır. Nəticəni yoxlayıb təsdiqlə və ya rədd et.";
      } catch (error) {
        if (summaryStatus) summaryStatus.textContent = error.message || "AI müqayisəsi hazırlanmadı.";
        compareButton.disabled = !aiProviderReady;
      }
      return;
    }
    const reviewButton = event.target.closest("[data-rfq-ai-review]");
    if (reviewButton && window.ConstEraAPI?.reviewAiRun) {
      const draft = getDrafts().find((item) => item.id === selectedSummaryId);
      const state = draft ? aiOfferComparisons.get(draft.id) : null;
      if (!draft || !state) return;
      const decision = reviewButton.dataset.rfqAiReview === "reject" ? "reject" : "approve";
      reviewButton.disabled = true;
      try {
        const response = await window.ConstEraAPI.reviewAiRun(
          reviewButton.dataset.runId,
          decision,
          decision === "approve"
            ? "İstifadəçi təklif müqayisəsini və əsas faktları yoxlayıb təsdiqlədi."
            : "İstifadəçi təklif müqayisəsini kommersiya qərarı üçün qəbul etmədi."
        );
        aiOfferComparisons.set(draft.id, {
          ...state,
          approval: { ...state.approval, status: response.data?.approvalStatus || (decision === "approve" ? "approved" : "rejected") }
        });
        renderSummaryPanel(draft);
        if (summaryStatus) summaryStatus.textContent = decision === "approve"
          ? "AI analizi təsdiqləndi. Tövsiyə olunan təklifi seçməzdən əvvəl kommersiya şərtlərini son dəfə yoxla."
          : "AI analizi rədd edildi. Yeni müqayisə yarada və ya təklifləri əl ilə qiymətləndirə bilərsən.";
      } catch (error) {
        if (summaryStatus) summaryStatus.textContent = error.message || "AI qərarı saxlanmadı.";
        reviewButton.disabled = false;
      }
      return;
    }
    const button = event.target.closest("[data-rfq-offer-select]");
    if (!button) return;
    const draft = getDrafts().find((item) => item.id === button.dataset.rfqOfferRfq);
    if (!draft) return;
    if (cloudDrafts !== null && window.ConstEraAPI?.updateOffer) {
      button.disabled = true;
      try {
        const result = await window.ConstEraAPI.updateOffer(button.dataset.rfqOfferSelect, "accepted");
        await refreshCloudRfqs();
        const updated = getDrafts().find((item) => item.id === draft.id);
        if (updated) renderSummaryPanel(updated);
        if (summaryStatus) {
          summaryStatus.textContent = result.data?.order?.orderNumber
            ? `Qalib təklif təsdiqləndi. Sifariş #${result.data.order.orderNumber} və proforma yaradıldı.`
            : "Qalib təklif təsdiqləndi, digər təkliflər bağlandı.";
        }
      } catch (error) {
        if (summaryStatus) summaryStatus.textContent = error.message;
      }
      return;
    }
    updateDraft(draft.id, {
      status: "Bağlandı",
      offers: (draft.offers || []).map((offer) => ({
        ...offer,
        status: offer.id === button.dataset.rfqOfferSelect ? "accepted" : "rejected"
      }))
    });
    render();
  });
  refreshButton?.addEventListener("click", async () => {
    refreshButton.disabled = true;
    try {
      if (cloudUser) await refreshCloudRfqs();
      else await connectRfqAccount();
    } finally {
      refreshButton.disabled = false;
    }
  });

  render();
  connectRfqAccount();
};

const initTender = () => {
  const form = document.querySelector("[data-tender-form]");
  const list = document.querySelector("[data-tender-list]");
  const empty = document.querySelector("[data-tender-empty]");
  const stats = document.querySelector("[data-tender-stats]");
  const statusFilter = document.querySelector("[data-tender-status-filter]");
  const supplierSelect = document.querySelector("[data-tender-supplier-select]");
  const exportButton = document.querySelector("[data-tender-export]");
  const clearButton = document.querySelector("[data-tender-clear]");
  const statusOutput = document.querySelector("[data-tender-status]");
  if (!form || !list) return;

  const statusList = ["Yeni", "Təchizatçılara göndərildi", "Təklif toplanır", "Qiymətləndirmə", "Qalib seçildi", "Bağlandı"];
  const apiStatusLabels = {
    draft: "Yeni",
    published: "Təklif toplanır",
    evaluation: "Qiymətləndirmə",
    awarded: "Qalib seçildi",
    closed: "Bağlandı",
    cancelled: "Bağlandı"
  };
  const labelApiStatuses = {
    "Yeni": "draft",
    "Təchizatçılara göndərildi": "published",
    "Təklif toplanır": "published",
    "Qiymətləndirmə": "evaluation",
    "Qalib seçildi": "awarded",
    "Bağlandı": "closed"
  };
  let cloudTenders = null;
  let cloudUser = null;
  const normalizeCloudTender = (tender) => ({
    ...tender,
    company: tender.companyName,
    supplier: tender.visibility === "invited" ? "Dəvətli tender" : "Açıq tender",
    status: apiStatusLabels[tender.status] || tender.status,
    lots: (tender.lots || []).map((lot) => ({
      ...lot,
      name: lot.title || lot.name,
      quantity: lot.quantity || lot.quantityText
    })),
    orderId: tender.orderId || "",
    orderNumber: tender.orderNumber || null,
    orderStatus: tender.orderStatus || ""
  });
  const getTenders = () => (cloudTenders ?? storage.read("constera-tenders")).map((tender, index) => ({
    id: tender.id || `tender-migrated-${index}`,
    status: tender.status || "Yeni",
    lots: Array.isArray(tender.lots) ? tender.lots : [],
    createdAt: tender.createdAt || new Date().toISOString(),
    ...tender
  }));
  const saveTenders = (tenders) => {
    if (cloudTenders === null) storage.write("constera-tenders", tenders);
    else cloudTenders = tenders;
  };
  const parseLots = (value) => String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,;\t]/).map((part) => part.trim());
      return {
        name: parts[0] || "Lot",
        quantity: parts[1] || "1",
        unit: parts[2] || "ədəd"
      };
    });
  const supplierName = (id) => (marketplace.suppliers || []).find((supplier) => supplier.id === id)?.name || "Açıq tender";
  const updateTender = (id, patch) => {
    const tenders = getTenders().map((tender) => tender.id === id ? { ...tender, ...patch } : tender);
    saveTenders(tenders);
    return tenders;
  };
  const exportTenders = (tenders) => {
    const headers = ["id", "vəziyyət", "tender", "şirkət", "şəhər", "təchizatçı", "son tarix", "büdcə", "lot sayı", "təsvir"];
    const csv = [headers.join(","), ...tenders.map((tender) => [
      tender.id,
      tender.status,
      tender.title,
      tender.company,
      tender.city,
      tender.supplier,
      tender.deadline,
      tender.budget,
      (tender.lots || []).length,
      tender.description
    ].map(escapeCsvValue).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `constera-tenders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (supplierSelect) {
    supplierSelect.innerHTML = `
      <option value="">Açıq tender - hamıya göndər</option>
      ${(marketplace.suppliers || []).map((supplier) => `<option value="${escapeAttr(supplier.id)}">${escapeHtml(supplier.name)}</option>`).join("")}
    `;
  }
  if (statusFilter) {
    statusFilter.innerHTML = `<option value="all">Bütün tenderlər</option>${statusList.map((status) => `<option value="${escapeAttr(status)}">${escapeHtml(status)}</option>`).join("")}`;
  }

  const render = () => {
    const tenders = getTenders();
    const activeStatus = statusFilter?.value || "all";
    const filtered = tenders.filter((tender) => activeStatus === "all" || tender.status === activeStatus);
    const lotCount = tenders.reduce((sum, tender) => sum + (tender.lots || []).length, 0);

    if (stats) {
      stats.innerHTML = `
        <article class="stat-card"><span class="stat-value">${tenders.length}</span><p>tender</p></article>
        <article class="stat-card"><span class="stat-value">${lotCount}</span><p>lot</p></article>
        <article class="stat-card"><span class="stat-value">${tenders.filter((tender) => tender.status === "Təklif toplanır").length}</span><p>təklif toplanır</p></article>
        <article class="stat-card"><span class="stat-value">${tenders.filter((tender) => tender.status === "Qalib seçildi").length}</span><p>qalib seçildi</p></article>
      `;
    }

    list.innerHTML = filtered.map((tender) => `
      <article class="tender-card glass">
        <div class="market-section-heading">
          <div>
            <p class="eyebrow">${escapeHtml(tender.status)}</p>
            <h2>${escapeHtml(tender.title)}</h2>
          </div>
          <span class="data-badge">${(tender.lots || []).length} lot</span>
        </div>
        <dl class="supplier-list">
          <div><dt>Şirkət</dt><dd>${escapeHtml(tender.company)}</dd></div>
          <div><dt>Şəhər</dt><dd>${escapeHtml(tender.city || "Açıq")}</dd></div>
          <div><dt>Son tarix</dt><dd>${escapeHtml(tender.deadline || "Açıq")}</dd></div>
          <div><dt>Büdcə</dt><dd>${escapeHtml(tender.budget || "Açıq")}</dd></div>
          <div><dt>Təchizatçı</dt><dd>${escapeHtml(tender.supplier || "Açıq tender")}</dd></div>
        </dl>
        <p class="admin-import-status">${escapeHtml(tender.description || "Əlavə təsvir yoxdur.")}</p>
        <div class="tender-lot-list">
          ${(tender.lots || []).map((lot) => `
            <span>${escapeHtml(lot.name)} · ${escapeHtml(lot.quantity)} ${escapeHtml(lot.unit)}</span>
          `).join("")}
        </div>
        ${tender.orderId ? `<a class="button button-secondary" href="order-detail.html?order=${encodeURIComponent(tender.orderId)}">Sifariş #${escapeHtml(tender.orderNumber || "")} və proforma</a>` : ""}
        ${!cloudUser || ["super_admin", "admin", "sales"].includes(cloudUser.role) ? `
          <div class="status-actions">
            ${statusList.map((status) => `<button type="button" data-tender-status="${escapeAttr(status)}" data-tender-id="${escapeAttr(tender.id)}">${escapeHtml(status)}</button>`).join("")}
          </div>` : ""}
        ${cloudUser?.role === "supplier" ? `
          <form class="tender-bid-inline" data-tender-bid-form="${escapeAttr(tender.id)}">
            <label><span>Təklif qiyməti</span><input name="price" required maxlength="160" placeholder="Məsələn: 12 500 AZN" /></label>
            <label><span>Çatdırılma</span><input name="delivery" maxlength="200" placeholder="Məsələn: 5 iş günü" /></label>
            <button class="button button-primary" type="submit">Təklif göndər</button>
          </form>` : ""}
      </article>
    `).join("");
    if (empty) empty.hidden = filtered.length > 0;
  };

  const connectTenderAccount = async () => {
    if (!window.ConstEraAPI?.tenders) return;
    try {
      const session = await window.ConstEraAPI.session();
      cloudUser = session.user;
      if (!cloudUser) {
        if (statusOutput) statusOutput.textContent = "Canlı tenderlər üçün hesaba daxil ol. Lokal ehtiyat rejimi aktivdir.";
        return;
      }
      const result = await window.ConstEraAPI.tenders();
      cloudTenders = (result.data || []).map(normalizeCloudTender);
      if (form.elements.company && !form.elements.company.value) form.elements.company.value = cloudUser.companyName || "";
      if (cloudUser.role === "supplier") form.hidden = true;
      if (statusOutput) statusOutput.textContent = `${cloudUser.name} hesabı Neon tender moduluna qoşuldu.`;
      render();
    } catch (error) {
      if (statusOutput) statusOutput.textContent = `Canlı tenderlər yüklənmədi: ${error.message}`;
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const tender = {
      id: `tender-${Date.now()}`,
      title: data.title,
      company: data.company,
      city: data.city,
      deadline: data.deadline,
      budget: data.budget,
      supplierId: data.supplierId || "",
      supplier: supplierName(data.supplierId),
      description: data.description,
      lots: parseLots(data.lots),
      status: data.supplierId ? "Təchizatçılara göndərildi" : "Təklif toplanır",
      createdAt: new Date().toISOString()
    };
    if (cloudUser && window.ConstEraAPI?.saveTender) {
      try {
        const result = await window.ConstEraAPI.saveTender({
          companyName: tender.company,
          title: tender.title,
          description: tender.description,
          city: tender.city,
          deadline: tender.deadline,
          budget: tender.budget,
          status: "published",
          visibility: tender.supplierId ? "invited" : "public",
          supplierIds: tender.supplierId ? [tender.supplierId] : [],
          lots: tender.lots.map((lot) => ({ title: lot.name, quantity: lot.quantity, unit: lot.unit }))
        });
        saveTenders([normalizeCloudTender(result.data), ...getTenders().filter((item) => item.id !== result.data.id)].slice(0, 100));
        if (statusOutput) statusOutput.textContent = `${tender.title} Neon bazasında yaradıldı.`;
      } catch (error) {
        if (statusOutput) statusOutput.textContent = `Tender serverə yazılmadı: ${error.message}`;
        return;
      }
    } else {
      saveTenders([tender, ...getTenders()].slice(0, 40));
      if (statusOutput) statusOutput.textContent = `${tender.title} lokal ehtiyat rejimində yaradıldı.`;
    }
    form.reset();
    if (supplierSelect) supplierSelect.value = "";
    render();
  });
  clearButton?.addEventListener("click", () => {
    form.reset();
    if (statusOutput) statusOutput.textContent = "Forma təmizləndi.";
  });
  exportButton?.addEventListener("click", () => exportTenders(getTenders()));
  statusFilter?.addEventListener("change", render);
  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-tender-status]");
    if (!button) return;
    const previousStatus = getTenders().find((item) => item.id === button.dataset.tenderId)?.status;
    if (cloudUser && window.ConstEraAPI?.saveTender) {
      button.disabled = true;
      try {
        await window.ConstEraAPI.saveTender({
          id: button.dataset.tenderId,
          status: labelApiStatuses[button.dataset.tenderStatus] || "draft"
        }, true);
        updateTender(button.dataset.tenderId, { status: button.dataset.tenderStatus });
        if (statusOutput) statusOutput.textContent = "Tender statusu yeniləndi.";
      } catch (error) {
        if (previousStatus) updateTender(button.dataset.tenderId, { status: previousStatus });
        if (statusOutput) statusOutput.textContent = `Tender statusu yenilənmədi: ${error.message}`;
      } finally {
        render();
      }
      return;
    }
    updateTender(button.dataset.tenderId, { status: button.dataset.tenderStatus });
    render();
  });
  list.addEventListener("submit", async (event) => {
    const bidForm = event.target.closest("[data-tender-bid-form]");
    if (!bidForm || !window.ConstEraAPI?.saveTenderBid) return;
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(bidForm).entries());
    const submit = bidForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await window.ConstEraAPI.saveTenderBid({
        tenderId: bidForm.dataset.tenderBidForm,
        price: fields.price,
        currency: "AZN",
        delivery: fields.delivery
      });
      bidForm.reset();
      if (statusOutput) statusOutput.textContent = "Tender təklifi göndərildi.";
    } catch (error) {
      if (statusOutput) statusOutput.textContent = `Tender təklifi göndərilmədi: ${error.message}`;
    } finally {
      submit.disabled = false;
    }
  });
  render();
  connectTenderAccount();
};

const initServiceCalculator = () => {
  const form = document.querySelector("[data-service-calculator]");
  const output = document.querySelector("[data-service-calculator-output]");
  if (!form || !output) return;

  const render = () => {
    const data = new FormData(form);
    const area = Math.max(Number(data.get("area")) || 0, 1);
    const scope = Number(data.get("scope")) || 1;
    const level = data.get("level") || "Standart";
    const workIndex = Math.round(area * scope);
    const materialIndex = Math.round(workIndex * (level === "Premium" ? 1.35 : level === "Ekonom" ? 0.82 : 1));
    const daysMin = Math.max(1, Math.ceil(workIndex / 45));
    const daysMax = Math.max(daysMin + 1, Math.ceil(workIndex / 28));

    output.innerHTML = `
      <strong>${workIndex} m² iş indeksi</strong>
      <span>${escapeHtml(level)} material səviyyəsi · ${materialIndex} material indeksi · ${daysMin}-${daysMax} gün ilkin icra aralığı</span>
      <a class="button button-secondary" href="rfq.html?service=menzil-temiri-paketi">Qiymət sorğusuna göndər</a>
    `;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  render();
};

const initPackageCalculator = () => {
  const form = document.querySelector("[data-package-calculator]");
  const output = document.querySelector("[data-package-calculator-output]");
  if (!form || !output) return;

  const render = () => {
    const data = new FormData(form);
    const area = Math.max(Number(data.get("area")) || 0, 1);
    const scope = Number(data.get("scope")) || 1;
    const level = data.get("level") || "Standart";
    const packageId = data.get("packageId") || "standart-temir-paketi";
    const packageIndex = Math.round(area * scope);
    const riskReserve = Math.round(packageIndex * (level === "Premium" ? 0.18 : level === "Ekonom" ? 0.08 : 0.12));
    const totalIndex = packageIndex + riskReserve;

    output.innerHTML = `
      <strong>${totalIndex} paket indeksi</strong>
      <span>${escapeHtml(level)} səviyyə · ${area} m² baza · ${riskReserve} ehtiyat indeksi · qiymət sorğusu ilə təsdiqlənir</span>
      <a class="button button-secondary" href="rfq.html?package=${encodeURIComponent(packageId)}">Paket sorğusuna göndər</a>
    `;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  render();
};

const initRentalCalculator = () => {
  const form = document.querySelector("[data-rental-calculator]");
  const output = document.querySelector("[data-rental-calculator-output]");
  if (!form || !output) return;

  const render = () => {
    const data = new FormData(form);
    const days = Math.max(Number(data.get("days")) || 0, 1);
    const shift = Number(data.get("shift")) || 8;
    const operator = data.get("operator") || "Operatorla";
    const zone = data.get("zone") || "Bakı";
    const hours = days * shift;
    const reservationType = days >= 22 ? "aylıq" : days >= 7 ? "həftəlik" : "günlük";

    output.innerHTML = `
      <strong>${hours} saatlıq rezervasiya</strong>
      <span>${days} gün · ${shift} saatlıq növbə · ${escapeHtml(operator)} · ${escapeHtml(zone)} zonası · ${reservationType} qiymət sorğusu</span>
      <a class="button button-secondary" href="rfq.html?rental=ekskavator-20t">İcarə sorğusu yarat</a>
    `;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  render();
};

const initAiSmeta = () => {
  const form = document.querySelector("[data-ai-smeta-form]");
  const output = document.querySelector("[data-ai-smeta-output]");
  const historyList = document.querySelector("[data-ai-smeta-history]");
  const empty = document.querySelector("[data-ai-smeta-empty]");
  const stats = document.querySelector("[data-ai-smeta-stats]");
  const status = document.querySelector("[data-ai-smeta-status]");
  const exportButton = document.querySelector("[data-ai-smeta-export]");
  const resetButton = document.querySelector("[data-ai-smeta-reset]");
  const clearHistoryButton = document.querySelector("[data-ai-smeta-clear-history]");
  const importFile = document.querySelector("[data-ai-smeta-file]");
  const importButton = document.querySelector("[data-ai-smeta-import]");
  if (!form || !output) return;

  const plannerParams = new URLSearchParams(window.location.search);
  const plannerProjectType = plannerParams.get("projectType");
  const plannerArea = Number(plannerParams.get("area"));
  const plannerCity = plannerParams.get("city");
  if (plannerProjectType && [...form.elements.projectType.options].some((option) => option.value === plannerProjectType)) {
    form.elements.projectType.value = plannerProjectType;
  }
  if (Number.isFinite(plannerArea) && plannerArea >= 20) form.elements.area.value = String(plannerArea);
  if (plannerCity) form.elements.city.value = plannerCity.slice(0, 160);

  const estimateKey = "constera-ai-estimates";
  const requestedEstimateId = new URLSearchParams(window.location.search).get("estimate") || "";
  const projectLabels = {
    villa: "Villa / fərdi ev",
    apartment: "Mənzil təmiri",
    office: "Ofis / kommersiya",
    warehouse: "Anbar / istehsalat"
  };
  const scopeLabels = {
    shell: "Qara karkas",
    white: "Ağ suvaq",
    renovation: "Tam təmir",
    turnkey: "Tam tikinti + təmir"
  };
  const levelLabels = {
    economy: "Ekonom",
    standard: "Standart",
    premium: "Premium"
  };
  const complexityLabels = {
    simple: "Sadə",
    standard: "Standart",
    complex: "Mürəkkəb"
  };
  const scopeMultipliers = {
    shell: 0.78,
    white: 0.9,
    renovation: 0.82,
    turnkey: 1
  };
  const levelMultipliers = {
    economy: 0.86,
    standard: 1,
    premium: 1.22
  };
  const complexityMultipliers = {
    simple: 0.94,
    standard: 1,
    complex: 1.14
  };
  let cloudUser = null;
  let aiProviderReady = false;
  let currentPlan = null;
  const projectProfiles = {
    villa: { concrete: 0.24, rebar: 0.034, block: 12.2, plaster: 1.75, paint: 0.24, tile: 0.42, cable: 5.6, pipe: 1.05, insulation: 0.9, roof: 0.72 },
    apartment: { concrete: 0.04, rebar: 0.006, block: 3.8, plaster: 1.45, paint: 0.28, tile: 0.38, cable: 4.8, pipe: 0.86, insulation: 0.18, roof: 0 },
    office: { concrete: 0.08, rebar: 0.012, block: 4.8, plaster: 1.2, paint: 0.3, tile: 0.26, cable: 7.2, pipe: 0.72, insulation: 0.36, roof: 0.08 },
    warehouse: { concrete: 0.32, rebar: 0.042, block: 7.5, plaster: 0.75, paint: 0.14, tile: 0.08, cable: 3.8, pipe: 0.34, insulation: 0.52, roof: 1.05 }
  };
  const materialRules = [
    { key: "concrete", title: "Hazır beton / sement bazası", unit: "m³", category: "Konstruksiya", keywords: ["beton", "sement", "m400", "m500"], scopes: ["shell", "white", "turnkey"], confidence: "Orta" },
    { key: "rebar", title: "Armatur və metal karkas", unit: "ton", category: "Metal", keywords: ["armatur", "metal", "profil"], scopes: ["shell", "white", "turnkey"], confidence: "Orta" },
    { key: "block", title: "Hörgü bloku / kərpic", unit: "ədəd", category: "Hörgü", keywords: ["blok", "kərpic", "kerpic", "hörgü"], scopes: ["shell", "white", "turnkey"], confidence: "Yüksək" },
    { key: "plaster", title: "Suvaq, şpaklyovka və gips qarışıqları", unit: "kisə", category: "Kimya", keywords: ["suvaq", "gips", "şpaklyovka", "spaklyovka", "rotband", "epomix"], scopes: ["white", "renovation", "turnkey"], confidence: "Yüksək" },
    { key: "paint", title: "Daxili və xarici boya", unit: "litr", category: "Boya", keywords: ["boya", "paint", "penguin", "zink", "interior", "eksteryer"], scopes: ["renovation", "turnkey"], confidence: "Yüksək" },
    { key: "tile", title: "Kafel, keramoqranit və yapışdırıcı", unit: "m²", category: "Döşəmə", keywords: ["kafel", "keramoqranit", "plitə", "yapışdırıcı"], scopes: ["renovation", "turnkey"], confidence: "Orta" },
    { key: "cable", title: "Elektrik kabeli və avtomatika", unit: "metr", category: "Elektrik", keywords: ["kabel", "elektrik", "schneider", "legrand", "avtomat"], scopes: ["white", "renovation", "turnkey"], confidence: "Orta" },
    { key: "pipe", title: "Santexnika boruları və fitinqlər", unit: "metr", category: "Santexnika", keywords: ["boru", "ppr", "pvc", "fitinq", "santexnika"], scopes: ["white", "renovation", "turnkey"], confidence: "Orta" },
    { key: "insulation", title: "İzolyasiya və membran", unit: "m²", category: "İzolyasiya", keywords: ["izolyasiya", "xps", "eps", "membran", "daş yun"], scopes: ["shell", "white", "turnkey"], confidence: "Orta" },
    { key: "roof", title: "Dam örtüyü və aksesuarları", unit: "m²", category: "Dam", keywords: ["dam", "profnastil", "membran", "kirəmit"], scopes: ["shell", "turnkey"], confidence: "Aşağı" }
  ];

  const workflowPhaseRules = [
    { phase: "Bünövrə və konstruksiya", terms: ["beton", "sement", "armatur", "metal", "profil", "blok", "kərpic", "hörgü", "bünövrə", "konstruksiya"] },
    { phase: "Qapalı kontur", terms: ["dam", "fasad", "izolyasiya", "membran", "pəncərə", "qapı", "şüşə", "xps", "eps", "daş yun"] },
    { phase: "MEP sistemləri", terms: ["elektrik", "kabel", "avtomat", "santexnika", "boru", "fitinq", "hvac", "havalandırma", "kondisioner", "yanğın"] },
    { phase: "Tamamlama", terms: ["boya", "suvaq", "şpaklyovka", "gips", "kafel", "keramoqranit", "döşəmə", "laminat", "parket", "yapışdırıcı", "dekor"] }
  ];
  const estimatePhase = (row) => {
    const source = normalize(`${row?.category || ""} ${row?.title || ""}`);
    return workflowPhaseRules.find((rule) => rule.terms.some((term) => source.includes(normalize(term))))?.phase || "Ümumi";
  };
  const enrichWorkflowRow = (row) => {
    const phase = row?.phase || estimatePhase(row);
    const criticality = row?.criticality
      || (["Bünövrə və konstruksiya", "MEP sistemləri"].includes(phase) ? "Yüksək" : phase === "Qapalı kontur" ? "Orta" : "Normal");
    return {
      ...row,
      phase,
      criticality,
      included: row?.included !== false,
      products: Array.isArray(row?.products) ? row.products : []
    };
  };
  const workflowStatusFor = (estimate) => {
    if (estimate?.rfqId || estimate?.cloudRfqId) return "converted";
    if (estimate?.workflowStatus) return estimate.workflowStatus;
    if (estimate?.aiApprovalStatus === "approved") return "approved";
    if (estimate?.aiApprovalStatus === "rejected") return "rejected";
    if (estimate?.aiProvider) return "review_pending";
    return "draft";
  };
  const normalizeEstimateWorkflow = (estimate) => ({
    ...estimate,
    workflowStatus: workflowStatusFor(estimate),
    sourceType: estimate?.sourceType || "calculator",
    sourceFileName: estimate?.sourceFileName || "",
    rows: (Array.isArray(estimate?.rows) ? estimate.rows : []).map(enrichWorkflowRow)
  });

  const numberFormat = new Intl.NumberFormat("az-AZ", {
    maximumFractionDigits: 1
  });
  const readEstimates = () => storage.read(estimateKey).map(normalizeEstimateWorkflow);
  const writeEstimates = (items) => storage.write(estimateKey, items.map(normalizeEstimateWorkflow).slice(0, 25));
  const asNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  };
  const formatQty = (value) => numberFormat.format(Math.max(value, 0));
  const productSearchText = (product) => normalize([
    product.name,
    product.brand,
    product.category,
    product.subcategory,
    product.supplier,
    product.specs
  ].flat().join(" "));
  const recommendProducts = (rule) => {
    const keywords = (Array.isArray(rule.keywords) && rule.keywords.length
      ? rule.keywords
      : [rule.key, rule.title, rule.category]).filter(Boolean).map(normalize);
    return (marketplace.products || [])
      .map((product) => {
        const text = productSearchText(product);
        const score = keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
        return { product, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || compareSourceQuality(a.product, b.product, "product"))
      .slice(0, 3)
      .map((entry) => entry.product);
  };
  const createMaterialRows = ({ projectType, area, floors, rooms, wetZones, scope, finishLevel, complexity, wastePercent }) => {
    const profile = projectProfiles[projectType] || projectProfiles.villa;
    const floorFactor = projectType === "apartment" ? 1 : Math.max(floors, 1) ** 0.18;
    const scopeFactor = scopeMultipliers[scope] || 1;
    const levelFactor = levelMultipliers[finishLevel] || 1;
    const complexityFactor = complexityMultipliers[complexity] || 1;
    const roomFactor = Math.max(0.86, Math.min(1.22, 0.92 + rooms * 0.025));
    const wetFactor = Math.max(0.9, Math.min(1.32, 0.96 + wetZones * 0.055));
    const wasteFactor = 1 + Math.max(0, Math.min(wastePercent, 35)) / 100;

    return materialRules
      .filter((rule) => rule.scopes.includes(scope))
      .map((rule) => {
        const base = profile[rule.key] || 0;
        const finishSensitive = ["paint", "tile", "plaster", "cable", "pipe"].includes(rule.key);
        const roomSensitive = ["paint", "plaster", "cable"].includes(rule.key) ? roomFactor : 1;
        const wetSensitive = ["tile", "pipe"].includes(rule.key) ? wetFactor : 1;
        const rawQty = area * base * floorFactor * scopeFactor * complexityFactor * roomSensitive * wetSensitive * (finishSensitive ? levelFactor : 1);
        const qtyWithWaste = rawQty * wasteFactor;
        const quantity = rule.key === "rebar" ? Math.max(rawQty, 0.1) : Math.ceil(rawQty);
        return enrichWorkflowRow({
          ...rule,
          baseQuantity: rule.key === "rebar" ? Math.round(quantity * 10) / 10 : quantity,
          quantity: rule.key === "rebar" ? Math.round(Math.max(qtyWithWaste, 0.1) * 10) / 10 : Math.ceil(qtyWithWaste),
          wastePercent,
          products: recommendProducts(rule)
        });
      })
      .filter((row) => row.quantity > 0);
  };
  const createEstimate = (data) => {
    const projectType = String(data.get("projectType") || "villa");
    const scope = String(data.get("scope") || "turnkey");
    const finishLevel = String(data.get("finishLevel") || "standard");
    const area = asNumber(data.get("area"), 120);
    const floors = Math.max(1, Math.round(asNumber(data.get("floors"), 1)));
    const rooms = Math.max(1, Math.round(asNumber(data.get("rooms"), 4)));
    const wetZones = Math.max(0, Math.round(asNumber(data.get("wetZones"), 2)));
    const complexity = String(data.get("complexity") || "standard");
    const wastePercent = Math.max(0, Math.min(35, Math.round(asNumber(data.get("wastePercent"), 10))));
    const deliveryPercent = Math.max(0, Math.min(25, Math.round(asNumber(data.get("deliveryPercent"), 5))));
    const laborPercent = Math.max(0, Math.min(80, Math.round(asNumber(data.get("laborPercent"), 28))));
    const docType = String(data.get("docType") || "rfq");
    const rows = createMaterialRows({ projectType, area, floors, rooms, wetZones, scope, finishLevel, complexity, wastePercent });
    const baseRisk = finishLevel === "premium" ? 15 : finishLevel === "economy" ? 8 : 12;
    const riskReserve = baseRisk + (complexity === "complex" ? 5 : complexity === "simple" ? -2 : 0);

    return {
      id: `smeta-${Date.now()}`,
      projectType,
      projectLabel: projectLabels[projectType] || projectType,
      area,
      floors,
      rooms,
      wetZones,
      scope,
      scopeLabel: scopeLabels[scope] || scope,
      finishLevel,
      finishLabel: levelLabels[finishLevel] || finishLevel,
      complexity,
      complexityLabel: complexityLabels[complexity] || complexity,
      wastePercent,
      deliveryPercent,
      laborPercent,
      docType,
      city: String(data.get("city") || "").trim(),
      note: String(data.get("note") || "").trim(),
      riskReserve,
      rows,
      workflowStatus: "draft",
      sourceType: "calculator",
      sourceFileName: "",
      createdAt: new Date().toISOString()
    };
  };
  const applyCatalogPricing = (estimate, pricing) => {
    const pricingByKey = new Map((pricing.rows || []).map((row) => [row.key, row]));
    const rows = estimate.rows.map((row) => {
      const catalog = pricingByKey.get(row.key) || null;
      const selected = catalog?.selected || null;
      const products = [...new Map([
        selected,
        ...(catalog?.alternatives || []),
        ...(row.products || [])
      ].filter((product) => product?.id).map((product) => [product.id, product])).values()].slice(0, 3);
      return { ...row, products, catalog };
    });
    const materialSubtotal = Number(pricing.materialSubtotal || 0);
    const laborAmount = Math.round(materialSubtotal * Number(estimate.laborPercent || 0)) / 100;
    const deliveryAmount = Math.round(materialSubtotal * Number(estimate.deliveryPercent || 0)) / 100;
    const riskAmount = Math.round(materialSubtotal * Number(estimate.riskReserve || 0)) / 100;
    return {
      ...estimate,
      rows,
      catalogPricing: {
        ...pricing,
        materialSubtotal,
        laborAmount,
        deliveryAmount,
        riskAmount,
        estimatedTotal: Math.round((materialSubtotal + laborAmount + deliveryAmount + riskAmount) * 100) / 100
      }
    };
  };
  const estimateCatalogRows = (estimate) => (estimate.rows || []).map((row) => ({
    key: row.key,
    title: row.title,
    category: row.category,
    quantity: row.quantity,
    unit: row.unit,
    keywords: row.keywords,
    productIds: (row.products || []).map((product) => product.id)
  }));
  const enrichEstimateWithCatalog = async (estimate) => {
    const result = await window.ConstEraAPI.catalogEstimate(estimateCatalogRows(estimate));
    return applyCatalogPricing(estimate, result.data || {});
  };
  const compactEstimateProduct = (product) => product?.id ? {
    id: product.id,
    name: product.name || product.title || "Məhsul",
    brand: product.brand || "",
    price: product.price || "Sorğu əsasında",
    offerId: product.offerId || "",
    sourceLabel: product.sourceLabel || "",
    sourceUrl: product.sourceUrl || ""
  } : null;
  const estimatePayloadForCloud = (estimate) => ({
    ...estimate,
    aiSources: (estimate.aiSources || []).slice(0, 20),
    rows: (estimate.rows || []).slice(0, 120).map((row) => {
      const selected = compactEstimateProduct(row.catalog?.selected);
      const products = [...new Map([
        selected,
        ...(row.products || []).map(compactEstimateProduct)
      ].filter(Boolean).map((product) => [product.id, product])).values()].slice(0, 3);
      return {
        key: row.key,
        title: row.title,
        category: row.category,
        phase: row.phase,
        criticality: row.criticality,
        included: row.included !== false,
        quantity: row.quantity,
        baseQuantity: row.baseQuantity,
        unit: row.unit,
        confidence: row.confidence,
        reasoning: row.reasoning || "",
        keywords: (row.keywords || []).slice(0, 8),
        products,
        catalog: row.catalog ? {
          selected,
          matchedBy: row.catalog.matchedBy || "",
          packageCount: row.catalog.packageCount ?? null,
          packageSize: row.catalog.packageSize ?? null,
          lineTotal: row.catalog.lineTotal ?? null,
          pricingConfidence: row.catalog.pricingConfidence || "request"
        } : null
      };
    }),
    catalogPricing: estimate.catalogPricing ? {
      ...estimate.catalogPricing,
      rows: undefined,
      unresolvedRows: (estimate.catalogPricing.unresolvedRows || []).slice(0, 30)
    } : null
  });
  const persistEstimate = async (estimate) => {
    if (!cloudUser || !window.ConstEraAPI?.saveEstimate || workflowStatusFor(estimate) === "converted") return null;
    return window.ConstEraAPI.saveEstimate({
      id: estimate.id,
      title: estimate.projectLabel,
      payload: estimatePayloadForCloud(estimate),
      workflowStatus: workflowStatusFor(estimate),
      sourceType: estimate.sourceType || "calculator",
      sourceFileName: estimate.sourceFileName || "",
      aiRunId: estimate.aiRunId || ""
    });
  };
  const estimateToRfq = (estimate, legalAccepted) => {
    const selectedRows = (estimate.rows || []).filter((row) => row.included !== false);
    if (!selectedRows.length) throw new Error("RFQ üçün ən azı bir material mövqeyi seçilməlidir.");
    if (selectedRows.length > 20) throw new Error("Bir RFQ-də maksimum 20 material mövqeyi seçilə bilər.");
    const items = selectedRows.map((row) => {
      const selected = row.catalog?.selected || null;
      const packageCount = Number(row.catalog?.packageCount);
      const usePackage = Boolean(selected?.id && Number.isFinite(packageCount) && packageCount > 0);
      const quantity = usePackage ? packageCount : Number(row.quantity || 1);
      const unit = usePackage ? "paket" : row.unit || "ədəd";
      return {
        kind: selected?.id ? "product" : "custom",
        productId: selected?.id || "",
        title: selected?.name || row.title,
        quantity,
        quantityText: `${formatQty(quantity)} ${unit}`,
        unit,
        specs: [
          selected?.id ? `Smeta mövqeyi: ${row.title}` : "Kataloq uyğunluğu tapılmayıb",
          `İlkin tələb: ${formatQty(row.quantity)} ${row.unit}`,
          `Etibar: ${row.confidence || "Orta"}`,
          `Satınalma mərhələsi: ${row.phase || "Ümumi"}`,
          `Kritiklik: ${row.criticality || "Normal"}`
        ]
      };
    });
    const summary = items.map((item) => `${item.title}: ${item.quantityText}`).join("; ").slice(0, 2_200);
    const rfq = {
      id: `rfq-${Date.now()}`,
      type: "custom",
      sourceId: estimate.id,
      estimateId: estimate.id,
      status: "Yeni",
      supplierId: "",
      supplier: "Açıq sorğu",
      priority: "Qiymət müqayisəsi",
      product: `Ağıllı smeta: ${estimate.projectLabel} · ${estimate.area} m²`,
      quantity: `${items.length} material mövqeyi`,
      items,
      aiRunId: estimate.aiApprovalStatus === "approved" ? estimate.aiRunId || "" : "",
      needDate: "",
      budget: "Sorğu əsasında",
      deliveryMode: "Layihə üzrə paket təklif",
      usage: estimate.scopeLabel,
      company: "",
      contact: "",
      city: estimate.city,
      note: `${summary} | Ehtiyat: ${estimate.wastePercent || 0}% | İşçilik indeksi: ${estimate.laborPercent || 0}% | Logistika: ${estimate.deliveryPercent || 0}%${estimate.note ? ` | Qeyd: ${estimate.note}` : ""}`.slice(0, 3_000),
      legalAccepted: Boolean(legalAccepted),
      sourcePath: `${window.location.pathname}${window.location.search}`,
      createdAt: new Date().toISOString()
    };
    const drafts = storage.read("constera-rfq-drafts");
    storage.write("constera-rfq-drafts", [rfq, ...drafts].slice(0, 30));
    return rfq;
  };
  const submitEstimateRfq = async (estimate, legalAccepted, button) => {
    if (!legalAccepted) throw new Error("Sorğu yaratmaq üçün istifadə şərtləri və məxfilik siyasəti ilə razılaş.");
    if (estimate.aiProvider && !["approved", "not_required"].includes(estimate.aiApprovalStatus)) {
      throw new Error("AI smetası insan tərəfindən təsdiqlənmədən RFQ-yə çevrilə bilməz.");
    }
    let approvedEstimate = estimate;
    if (!estimate.aiProvider && workflowStatusFor(estimate) !== "approved") {
      approvedEstimate = { ...estimate, workflowStatus: "approved" };
      currentEstimate = approvedEstimate;
      writeEstimates([approvedEstimate, ...readEstimates().filter((item) => item.id !== approvedEstimate.id)]);
      if (cloudUser) await persistEstimate(approvedEstimate);
    }
    const rfq = estimateToRfq(approvedEstimate, legalAccepted);
    if (cloudUser?.role !== "customer" || !window.ConstEraAPI?.createRfq) {
      if (status) status.innerHTML = `Sorğu qaralaması yaradıldı: ${escapeHtml(rfq.product)}. <a class="source-link" href="rfq-dashboard.html">Sorğu panelində aç</a>`;
      return { estimate: approvedEstimate, rfq, cloud: false };
    }
    if (button) button.disabled = true;
    try {
      const result = await window.ConstEraAPI.createRfq({
        type: rfq.type,
        sourceId: rfq.sourceId,
        estimateId: rfq.estimateId,
        product: rfq.product,
        quantity: rfq.quantity,
        company: cloudUser.companyName || cloudUser.name,
        contact: cloudUser.email,
        city: rfq.city,
        priority: rfq.priority,
        budget: rfq.budget,
        deliveryMode: rfq.deliveryMode,
        usage: rfq.usage,
        note: rfq.note,
        items: rfq.items,
        aiRunId: rfq.aiRunId,
        legalAccepted: rfq.legalAccepted,
        sourcePath: rfq.sourcePath
      });
      const convertedEstimate = {
        ...approvedEstimate,
        workflowStatus: "converted",
        rfqId: result.data.id,
        cloudRfqId: result.data.id,
        convertedAt: new Date().toISOString()
      };
      currentEstimate = convertedEstimate;
      writeEstimates([convertedEstimate, ...readEstimates().filter((item) => item.id !== convertedEstimate.id)]);
      const drafts = storage.read("constera-rfq-drafts").map((draft) =>
        draft.id === rfq.id ? { ...draft, cloudId: result.data.id, cloudSyncedAt: new Date().toISOString() } : draft
      );
      storage.write("constera-rfq-drafts", drafts);
      renderEstimate(convertedEstimate, false);
      renderHistory();
      window.ConstEraTrack?.("rfq_created", { entityType: "rfq", entityId: result.data.id, payload: { source: "estimate" } });
      if (status) status.innerHTML = `${escapeHtml(result.data.itemCount || rfq.items.length)} material mövqeyi ilə sorğu yaradıldı. <a class="source-link" href="rfq-dashboard.html">Sorğu panelində aç</a>`;
      return { estimate: convertedEstimate, rfq, cloud: true, result };
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  };
  const exportEstimate = (estimate) => {
    if (!estimate) return;
    const headers = ["satınalma mərhələsi", "kritiklik", "rfq seçimi", "kateqoriya", "material", "baza miqdar", "ehtiyatli miqdar", "vahid", "etibar", "ehtiyat %", "seçilmiş kataloq məhsulu", "paket sayı", "məbləğ", "tövsiyə olunan məhsullar"];
    const rows = estimate.rows.map((row) => [
      row.phase || "Ümumi",
      row.criticality || "Normal",
      row.included === false ? "xeyr" : "bəli",
      row.category,
      row.title,
      formatQty(row.baseQuantity || row.quantity),
      formatQty(row.quantity),
      row.unit,
      row.confidence,
      row.wastePercent || estimate.wastePercent || 0,
      row.catalog?.selected?.name || "",
      row.catalog?.packageCount ?? "",
      row.catalog?.lineTotal ?? "",
      row.products.map((product) => `${product.name} (${product.price || "Sorğu əsasında"})`).join("; ")
    ].map(escapeCsvValue).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    downloadTextFile(`constera-ai-smeta-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
  };
  const renderStats = () => {
    if (!stats) return;
    const estimates = readEstimates();
    const latest = estimates[0];
    stats.innerHTML = `
      <article class="stat-card"><span class="stat-value">${estimates.length}</span><p>smeta</p></article>
      <article class="stat-card"><span class="stat-value">${latest ? latest.rows.length : 0}</span><p>material qrupu</p></article>
      <article class="stat-card"><span class="stat-value">${latest ? latest.area : 0}</span><p>son m²</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.products.length}</span><p>kataloq məhsulu</p></article>
    `;
  };
  const renderHistory = () => {
    const estimates = readEstimates();
    if (historyList) {
      historyList.innerHTML = estimates.slice(0, 6).map((estimate) => `
        <button class="ai-smeta-history-card" type="button" data-ai-smeta-open="${escapeAttr(estimate.id)}">
          <strong>${escapeHtml(estimate.projectLabel)} · ${escapeHtml(estimate.area)} m²</strong>
          <span>${escapeHtml(estimate.scopeLabel)} · ${escapeHtml(estimate.finishLabel)} · ${escapeHtml(estimate.rows.length)} qrup</span>
          <small>${new Date(estimate.createdAt).toLocaleString("az-AZ")}</small>
        </button>
      `).join("");
    }
    if (empty) empty.hidden = estimates.length > 0;
    renderStats();
  };
  const planStatusLabels = {
    draft: "Redaktə edilir",
    review_pending: "İnsan təsdiqi gözləyir",
    approved: "RFQ üçün təsdiqlənib",
    rejected: "Rədd edilib",
    activated: "RFQ-lər yaradılıb"
  };
  const planRiskLabels = { low: "Aşağı", medium: "Orta", high: "Yüksək" };
  const defaultPlanStartDate = () => {
    const date = new Date(Date.now() + 7 * 86_400_000);
    return date.toISOString().slice(0, 10);
  };
  const loadProcurementPlan = async (estimateId) => {
    if (!cloudUser || !estimateId || !window.ConstEraAPI?.procurementPlans) {
      currentPlan = null;
      return null;
    }
    const result = await window.ConstEraAPI.procurementPlans(estimateId);
    currentPlan = Array.isArray(result.data) ? result.data[0] || null : null;
    if (currentEstimate?.id === estimateId) renderEstimate(currentEstimate, false);
    return currentPlan;
  };
  const renderProcurementPlan = (estimate, workflowStatus) => {
    const plan = currentPlan?.estimateId === estimate.id ? currentPlan : null;
    if (!cloudUser) return `
      <section class="ai-procurement-plan ai-smeta-history" data-ai-procurement-plan>
        <div class="admin-import-status" data-type="warning">
          <strong>AI satınalma planı hesab tələb edir.</strong>
          <a class="source-link" href="login.html?next=ai-smeta.html">Daxil ol və smetanı Neon-da saxla</a>.
        </div>
      </section>
    `;
    if (!plan) {
      const blocked = !["draft", "approved"].includes(workflowStatus);
      return `
        <section class="ai-procurement-plan ai-smeta-history" data-ai-procurement-plan>
          <div class="market-section-heading">
            <div><p class="eyebrow">AI satınalma təqvimi</p><h3>Mərhələli material planı yarat</h3></div>
            <span class="data-badge">Maksimum 20 mövqe / RFQ</span>
          </div>
          <div class="admin-form-grid ai-procurement-plan-create">
            <label class="admin-field"><span>Layihə başlanğıcı</span><input type="date" value="${escapeAttr(defaultPlanStartDate())}" data-ai-plan-start ${blocked ? "disabled" : ""} /></label>
            <label class="admin-field"><span>Layihə müddəti, gün</span><input type="number" min="30" max="730" step="1" value="150" inputmode="numeric" data-ai-plan-duration ${blocked ? "disabled" : ""} /></label>
            <button class="button button-primary" type="button" data-ai-plan-generate="${escapeAttr(estimate.id)}" ${blocked ? "disabled" : ""}>AI satınalma planı yarat</button>
          </div>
          <p class="admin-import-status" data-type="${blocked ? "warning" : "info"}">${blocked
            ? "Əvvəl smeta üzrə insan təsdiqini tamamla."
            : "Qayda əsaslı tikinti ardıcıllığı AI ilə yoxlanacaq; material, miqdar və büdcə serverdə dəyişməz qalacaq."}</p>
        </section>
      `;
    }
    const editable = ["draft", "review_pending", "rejected"].includes(plan.status);
    const confidence = Number.isFinite(Number(plan.confidence)) ? `${Math.round(Number(plan.confidence) * 100)}%` : "-";
    const activeWaves = (plan.waves || []).filter((wave) => wave.included !== false);
    const rfqIds = activeWaves.map((wave) => wave.rfqId).filter(Boolean);
    return `
      <section class="ai-procurement-plan ai-smeta-history" data-ai-procurement-plan data-plan-status="${escapeAttr(plan.status)}">
        <div class="market-section-heading">
          <div><p class="eyebrow">AI satınalma təqvimi</p><h3>${escapeHtml(plan.title)}</h3></div>
          <span class="data-badge">${escapeHtml(planStatusLabels[plan.status] || plan.status)}</span>
        </div>
        <div class="ai-smeta-summary ai-procurement-kpis">
          <article><strong>${escapeHtml(activeWaves.length)}</strong><span>aktiv dalğa</span></article>
          <article><strong>${escapeHtml(plan.projectStartDate)}</strong><span>başlanğıc</span></article>
          <article><strong>${escapeHtml(plan.targetEndDate)}</strong><span>hədəf son</span></article>
          <article><strong>${escapeHtml(confidence)}</strong><span>AI etibarı</span></article>
          <article><strong>${formatMoney(plan.totalBudget, plan.currency || "AZN")}</strong><span>qiymətlənən büdcə</span></article>
          <article><strong>${escapeHtml(plan.unpricedRows)}</strong><span>qiymətsiz mövqe</span></article>
        </div>
        <p class="admin-import-status">${escapeHtml(plan.summary || "Satınalma planı hazırdır.")}</p>
        ${(plan.warnings || []).length ? `<p class="admin-import-status" data-type="warning"><strong>Yoxlanmalı məqamlar:</strong> ${(plan.warnings || []).map(escapeHtml).join(" · ")}</p>` : ""}
        <div class="ai-smeta-table ai-procurement-wave-list">
          ${(plan.waves || []).map((wave) => `
            <article class="ai-procurement-wave ${wave.included === false ? "is-excluded" : ""}" data-ai-plan-wave data-wave-id="${escapeAttr(wave.id)}">
              <header>
                <label class="ai-smeta-row-select">
                  <input type="checkbox" data-ai-plan-included ${wave.included === false ? "" : "checked"} ${editable ? "" : "disabled"} />
                  <span>${escapeHtml(wave.title)}</span>
                </label>
                <span class="status-pill">${escapeHtml(planRiskLabels[wave.riskLevel] || wave.riskLevel)} risk</span>
              </header>
              <p class="admin-import-status">${escapeHtml(wave.rowCount)} material · ${wave.budget === null ? "Qiymət sorğu əsasında" : formatMoney(wave.budget, wave.currency || plan.currency)} · ${escapeHtml(wave.unpricedCount)} qiymətsiz mövqe</p>
              <div class="admin-form-grid ai-procurement-wave-fields">
                <label class="admin-field"><span>Tələb tarixi</span><input type="date" value="${escapeAttr(wave.needByDate)}" data-ai-plan-need ${editable ? "" : "disabled"} /></label>
                <label class="admin-field"><span>İş başlanğıcı</span><input type="date" value="${escapeAttr(wave.startDate)}" data-ai-plan-wave-start ${editable ? "" : "disabled"} /></label>
                <label class="admin-field"><span>İş sonu</span><input type="date" value="${escapeAttr(wave.endDate)}" data-ai-plan-wave-end ${editable ? "" : "disabled"} /></label>
                <label class="admin-field"><span>Təchizat, gün</span><input type="number" min="1" max="90" step="1" value="${escapeAttr(wave.leadTimeDays)}" data-ai-plan-lead ${editable ? "" : "disabled"} /></label>
                <label class="admin-field"><span>Risk</span><select data-ai-plan-risk ${editable ? "" : "disabled"}>
                  ${Object.entries(planRiskLabels).map(([value, label]) => `<option value="${value}" ${wave.riskLevel === value ? "selected" : ""}>${label}</option>`).join("")}
                </select></label>
              </div>
              <p class="admin-import-status">${escapeHtml(wave.reason || "Tikinti ardıcıllığına əsasən planlaşdırılıb.")}</p>
              ${(wave.checks || []).length ? `<small class="admin-import-status">${wave.checks.map(escapeHtml).join(" · ")}</small>` : ""}
              ${wave.rfqId ? `<a class="source-link" href="rfq-dashboard.html?rfq=${encodeURIComponent(wave.rfqId)}">RFQ-ni aç · ${escapeHtml(wave.rfqStatus || "Yeni")}</a>` : ""}
            </article>
          `).join("")}
        </div>
        <div class="admin-actions">
          ${editable ? `<button class="button button-secondary" type="button" data-ai-plan-save="${escapeAttr(plan.id)}">${plan.status === "rejected" ? "Düzəlt və yenidən baxışa göndər" : "Düzəlişləri saxla"}</button>` : ""}
          ${plan.status === "review_pending" ? `
            <button class="button button-primary" type="button" data-ai-plan-review="approve" data-run-id="${escapeAttr(plan.aiRunId || "")}">Planı təsdiqlə</button>
            <button class="button button-outline" type="button" data-ai-plan-review="reject" data-run-id="${escapeAttr(plan.aiRunId || "")}">Planı rədd et</button>
          ` : ""}
          ${plan.status === "approved" ? `<button class="button button-primary" type="button" data-ai-plan-activate="${escapeAttr(plan.id)}">${escapeHtml(activeWaves.length)} mərhələ RFQ-si yarat</button>` : ""}
          ${plan.status === "activated" ? `<a class="button button-secondary" href="rfq-dashboard.html">${escapeHtml(rfqIds.length)} RFQ-ni paneldə aç</a>` : ""}
        </div>
      </section>
    `;
  };
  const renderEstimate = (estimate, shouldScroll = true) => {
    const aiApprovalLabels = {
      pending: "İnsan təsdiqi gözləyir",
      approved: "Ekspert tərəfindən təsdiqlənib",
      rejected: "Ekspert tərəfindən rədd edilib",
      not_required: "Təsdiq tələb etmir"
    };
    const aiApprovalStatus = estimate.aiApprovalStatus || "pending";
    const aiActionLocked = Boolean(estimate.aiProvider && aiApprovalStatus !== "approved" && aiApprovalStatus !== "not_required");
    const aiConfidence = Number.isFinite(Number(estimate.aiConfidence))
      ? `${Math.round(Number(estimate.aiConfidence) * 100)}%`
      : "-";
    const aiSources = Array.isArray(estimate.aiSources) ? estimate.aiSources : [];
    const aiWarnings = Array.isArray(estimate.aiWarnings) ? estimate.aiWarnings : [];
    const includedRows = (estimate.rows || []).filter((row) => row.included !== false);
    const phaseCounts = [...new Set((estimate.rows || []).map((row) => row.phase || "Ümumi"))]
      .map((phase) => ({ phase, count: estimate.rows.filter((row) => (row.phase || "Ümumi") === phase && row.included !== false).length }))
      .filter((item) => item.count > 0);
    const workflowLabels = {
      draft: "Redaktə edilir",
      review_pending: "İnsan təsdiqi gözləyir",
      approved: "RFQ üçün təsdiqlənib",
      rejected: "Yenidən işlənməlidir",
      converted: "RFQ yaradılıb"
    };
    const workflowStatus = workflowStatusFor(estimate);
    const plan = currentPlan?.estimateId === estimate.id ? currentPlan : null;
    const planOwnsWorkflow = Boolean(plan);
    const planApproved = ["approved", "activated"].includes(plan?.status);
    const planActivated = plan?.status === "activated";
    output.hidden = false;
    output.innerHTML = `
      <div class="market-section-heading">
        <div>
          <p class="eyebrow">${estimate.aiProvider ? "AI + qayda əsaslı nəticə" : "Qayda əsaslı ilkin nəticə"}</p>
          <h2>${escapeHtml(estimate.projectLabel)} · ${escapeHtml(estimate.area)} m²</h2>
        </div>
        <span class="data-badge">${escapeHtml(estimate.sourceFileName || estimate.scopeLabel)}</span>
      </div>
      <div class="ai-smeta-workflow" data-workflow-status="${escapeAttr(workflowStatus)}">
        <span class="is-complete"><strong>1</strong>Sənəd</span>
        <span class="is-complete"><strong>2</strong>Kataloq</span>
        <span class="${["approved", "converted"].includes(workflowStatus) ? "is-complete" : "is-current"}"><strong>3</strong>${escapeHtml(workflowLabels[workflowStatus] || workflowStatus)}</span>
        <span class="${planApproved ? "is-complete" : workflowStatus === "approved" ? "is-current" : ""}"><strong>4</strong>Satınalma planı</span>
        <span class="${planActivated || workflowStatus === "converted" ? "is-complete" : planApproved ? "is-current" : ""}"><strong>5</strong>RFQ dalğaları</span>
      </div>
      <div class="ai-smeta-phase-strip">
        ${phaseCounts.map((item) => `<span>${escapeHtml(item.phase)} <strong>${escapeHtml(item.count)}</strong></span>`).join("")}
        <span>Seçilmiş <strong>${escapeHtml(includedRows.length)} / ${escapeHtml(estimate.rows.length)}</strong></span>
      </div>
      <div class="ai-smeta-summary">
        ${estimate.catalogPricing ? `
          <article><strong>${formatMoney(estimate.catalogPricing.materialSubtotal)}</strong><span>qiymətlənən material</span></article>
          <article><strong>${escapeHtml(estimate.catalogPricing.coveragePercent)}%</strong><span>kataloq əhatəsi</span></article>
          <article><strong>${escapeHtml(estimate.catalogPricing.matchPercent ?? 0)}%</strong><span>real məhsul uyğunluğu</span></article>
          <article><strong>${escapeHtml(estimate.catalogPricing.searchMatchedRows ?? 0)}</strong><span>server axtarışı ilə tapılan</span></article>
          <article><strong>${formatMoney(estimate.catalogPricing.laborAmount)}</strong><span>işçilik ehtiyatı</span></article>
          <article><strong>${formatMoney(estimate.catalogPricing.estimatedTotal)}</strong><span>ilkin yekun</span></article>
        ` : ""}
        <article><strong>${escapeHtml(estimate.finishLabel)}</strong><span>səviyyə</span></article>
        <article><strong>${escapeHtml(estimate.floors)}</strong><span>mərtəbə</span></article>
        <article><strong>${escapeHtml(estimate.riskReserve)}%</strong><span>ehtiyat</span></article>
        <article><strong>${escapeHtml(estimate.rows.length)}</strong><span>material qrupu</span></article>
        <article><strong>${escapeHtml(estimate.rooms || 0)}</strong><span>otaq</span></article>
        <article><strong>${escapeHtml(estimate.wetZones || 0)}</strong><span>yaş zona</span></article>
        <article><strong>${escapeHtml(estimate.deliveryPercent || 0)}%</strong><span>logistika</span></article>
        <article><strong>${escapeHtml(estimate.laborPercent || 0)}%</strong><span>işçilik indeksi</span></article>
      </div>
      ${estimate.catalogPricing?.unresolvedRows?.length ? `
        <p class="admin-import-status" data-type="warning">
          <strong>${escapeHtml(estimate.catalogPricing.unresolvedRows.length)} mövqe kataloqda dəqiq tapılmadı:</strong>
          ${estimate.catalogPricing.unresolvedRows.map((row) => escapeHtml(row.title)).join(" · ")}
        </p>
      ` : ""}
      ${includedRows.length > 20 ? `
        <p class="admin-import-status" data-type="warning"><strong>RFQ limiti:</strong> ${escapeHtml(includedRows.length)} mövqedən maksimum 20-si seçilməlidir.</p>
      ` : ""}
      ${estimate.aiProvider ? `
        <div class="admin-v2-section-heading admin-import-status" data-type="${aiApprovalStatus === "approved" ? "success" : aiApprovalStatus === "rejected" ? "error" : "warning"}">
          <div>
            <strong>AI qaralaması · ${escapeHtml(aiConfidence)} etibar</strong>
            <br><span>${escapeHtml(aiApprovalLabels[aiApprovalStatus] || aiApprovalStatus)}${estimate.aiModel ? ` · ${escapeHtml(estimate.aiModel)}` : ""}</span>
          </div>
          ${aiApprovalStatus === "pending" ? `
            <div class="admin-actions">
              <button class="button button-primary" type="button" data-ai-smeta-review="approve" data-run-id="${escapeAttr(estimate.aiRunId || "")}">Nəticəni təsdiqlə</button>
              <button class="button button-outline" type="button" data-ai-smeta-review="reject" data-run-id="${escapeAttr(estimate.aiRunId || "")}">Rədd et</button>
            </div>
          ` : ""}
        </div>
        ${aiWarnings.length ? `<div class="admin-import-status" data-type="warning"><strong>Yoxlanmalı məqamlar:</strong> ${aiWarnings.map((warning) => escapeHtml(warning)).join(" · ")}</div>` : ""}
        ${aiSources.length ? `<p class="admin-import-status"><strong>Mənbələr:</strong> ${aiSources.map((source) => source.url
          ? `<a class="source-link" href="${escapeAttr(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title || source.id)}</a>`
          : `<span>${escapeHtml(source.title || source.id)}</span>`).join(" · ")}</p>` : ""}
      ` : ""}
      ${estimate.aiSummary ? `<p class="admin-import-status" data-type="success">${escapeHtml(estimate.aiSummary)}</p>` : ""}
      <div class="ai-smeta-table">
        ${estimate.rows.map((row, rowIndex) => `
          <article class="ai-smeta-row ${row.included === false ? "is-excluded" : ""}" data-ai-smeta-row="${escapeAttr(rowIndex)}">
            <div>
              <div class="ai-smeta-row-flags">
                <label class="ai-smeta-row-select">
                  <input type="checkbox" data-ai-smeta-row-include data-row-index="${escapeAttr(rowIndex)}" ${row.included === false ? "" : "checked"} ${workflowStatus === "converted" ? "disabled" : ""} />
                  <span>RFQ-yə daxil et</span>
                </label>
                <span class="status-pill">${escapeHtml(row.phase || "Ümumi")}</span>
                <span class="status-pill">${escapeHtml(row.criticality || "Normal")}</span>
              </div>
              <h3>${escapeHtml(row.title)}</h3>
              <p>${escapeHtml(row.category)} · baza: ${formatQty(row.baseQuantity || row.quantity)} ${escapeHtml(row.unit)} · etibar: ${escapeHtml(row.confidence)}${row.catalog?.lineTotal !== null && row.catalog?.lineTotal !== undefined
                ? ` · ${formatMoney(row.catalog.lineTotal)} · ${escapeHtml(row.catalog.packageCount)} paket`
                : " · Qiymət sorğusu ilə dəqiqləşdirilməlidir"}</p>
              <div class="ai-smeta-row-editor">
                <label><span>Miqdar</span><input type="number" min="0.001" step="0.001" inputmode="decimal" value="${escapeAttr(row.quantity)}" data-ai-smeta-row-quantity data-row-index="${escapeAttr(rowIndex)}" ${workflowStatus === "converted" ? "disabled" : ""} /></label>
                <label><span>Vahid</span><input type="text" maxlength="40" value="${escapeAttr(row.unit)}" data-ai-smeta-row-unit data-row-index="${escapeAttr(rowIndex)}" ${workflowStatus === "converted" ? "disabled" : ""} /></label>
              </div>
            </div>
            <div class="ai-smeta-products">
              ${row.products.length ? row.products.map((product) => `
                <a href="product-detail.html?product=${encodeURIComponent(product.id)}">
                  <strong>${escapeHtml(product.name)}</strong>
                  <span>${escapeHtml(product.brand || "Brend")} · ${escapeHtml(product.price || "Sorğu əsasında")}${product.sourceLabel ? ` · ${escapeHtml(product.sourceLabel)}` : ""}</span>
                </a>
              `).join("") : "<span class=\"admin-import-status\">Uyğun məhsul üçün kataloqa yeni pozisiya əlavə et.</span>"}
            </div>
          </article>
        `).join("")}
      </div>
      ${renderProcurementPlan(estimate, workflowStatus)}
      <label class="supplier-application-consent">
        <input type="checkbox" value="true" data-ai-smeta-legal />
        <span><a href="terms.html">İstifadə şərtləri</a> və <a href="privacy.html">məxfilik siyasəti</a> ilə razıyam.</span>
      </label>
      <div class="admin-actions">
        ${estimate.aiProvider && aiApprovalStatus === "pending" && !planOwnsWorkflow ? `<button class="button button-primary" type="button" data-ai-smeta-approve-rfq="${escapeAttr(estimate.id)}">Təsdiqlə və tək RFQ yarat</button>` : ""}
        <button class="button button-primary" type="button" data-ai-smeta-rfq="${escapeAttr(estimate.id)}" ${aiActionLocked || planOwnsWorkflow ? "disabled title=\"Satınalma planı aktiv olduqda tək RFQ yaradılmır\"" : ""}>Tək RFQ qaralaması yarat</button>
        <button class="button button-secondary" type="button" data-ai-smeta-reprice="${escapeAttr(estimate.id)}" ${workflowStatus === "converted" ? "disabled" : ""}>Qiymətləri yenilə</button>
        <button class="button button-secondary" type="button" data-ai-smeta-cart="${escapeAttr(estimate.id)}" ${aiActionLocked ? "disabled title=\"Əvvəl AI nəticəsini yoxlayıb təsdiqlə\"" : ""}>Qiymətlənənləri səbətə əlavə et</button>
        <button class="button button-secondary" type="button" data-ai-smeta-export-current="${escapeAttr(estimate.id)}">Bu smetanı CSV-yə ixrac et</button>
        <button class="button button-secondary" type="button" data-ai-smeta-print>PDF üçün çap et</button>
        <a class="button button-outline" href="catalog.html">Kataloqda bax</a>
      </div>
    `;
    if (shouldScroll) output.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  let currentEstimate = readEstimates().find((estimate) => estimate.id === requestedEstimateId) || readEstimates()[0] || null;
  if (currentEstimate) renderEstimate(currentEstimate, false);
  renderHistory();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const estimateInput = Object.fromEntries(formData.entries());
    currentPlan = null;
    currentEstimate = createEstimate(formData);
    window.ConstEraTrack?.("estimate_created", { entityType: "estimate", entityId: currentEstimate.id, payload: { source: "calculator", rows: currentEstimate.rows.length } });
    writeEstimates([currentEstimate, ...readEstimates()]);
    renderEstimate(currentEstimate);
    renderHistory();
    if (status) status.textContent = `${currentEstimate.rows.length} material qrupu hazırlandı. Sorğu qaralaması yarada bilərsən.`;
    if (window.ConstEraAPI?.catalogEstimate) {
      try {
        if (status) status.textContent = "Material siyahısı hazırdır. Real Neon kataloqunda uyğun məhsul və qiymətlər axtarılır...";
        currentEstimate = await enrichEstimateWithCatalog(currentEstimate);
        writeEstimates([currentEstimate, ...readEstimates().filter((item) => item.id !== currentEstimate.id)]);
        renderEstimate(currentEstimate, false);
        renderHistory();
        if (status) status.textContent = `${currentEstimate.catalogPricing.matchedRows}/${currentEstimate.catalogPricing.totalRows} material real məhsulla uyğunlaşdırıldı; ${currentEstimate.catalogPricing.pricedRows} mövqe təsdiqli qiymətlə hesablandı.`;
      } catch (error) {
        if (status) status.textContent = `Material miqdarları hazırdır. Kataloq qiymətləndirilməsi alınmadı: ${error.message}`;
      }
    }
    if (cloudUser && aiProviderReady && window.ConstEraAPI?.aiEstimate) {
      try {
        if (status) status.textContent = "Qayda əsaslı nəticə hazırdır. Xarici AI smetanı yoxlayır...";
        const result = await window.ConstEraAPI.aiEstimate(estimateInput, currentEstimate);
        const providerEstimate = result.data?.estimate || {};
        const providerRows = Array.isArray(providerEstimate.rows) ? providerEstimate.rows : [];
        const normalizedRows = providerRows.map((row, index) => {
          const fallback = currentEstimate.rows.find((item) => item.key === row.key)
            || currentEstimate.rows.find((item) => normalize(item.title) === normalize(row.title))
            || currentEstimate.rows[index]
            || {};
          const quantity = Number(row.quantity);
          return enrichWorkflowRow({
            ...fallback,
            title: String(row.title || fallback.title || `Material ${index + 1}`),
            category: String(row.category || fallback.category || "Material"),
            unit: String(row.unit || fallback.unit || "ədəd"),
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : fallback.quantity || 1,
            confidence: String(row.confidence || fallback.confidence || "Orta"),
            phase: String(row.phase || fallback.phase || estimatePhase({ title: row.title, category: row.category })),
            criticality: String(row.criticality || fallback.criticality || ""),
            included: fallback.key ? fallback.included !== false : index < 20,
            products: Array.isArray(fallback.products) ? fallback.products : []
          });
        }).filter((row) => row.title);
        currentEstimate = {
          ...currentEstimate,
          rows: (normalizedRows.length ? normalizedRows : currentEstimate.rows).map((row) => ({ ...row, catalog: null })),
          catalogPricing: null,
          riskReserve: Number.isFinite(Number(providerEstimate.riskReserve))
            ? Number(providerEstimate.riskReserve)
            : currentEstimate.riskReserve,
          aiProvider: true,
          aiRunId: String(result.data?.runId || result.data?.requestId || ""),
          aiModel: String(result.data?.model || ""),
          aiConfidence: Number(result.data?.confidence ?? providerEstimate.confidence ?? 0),
          aiSources: Array.isArray(result.data?.sources) ? result.data.sources : [],
          aiWarnings: Array.isArray(result.data?.warnings) ? result.data.warnings : [],
          aiApprovalStatus: String(result.data?.approval?.status || "pending"),
          workflowStatus: "review_pending",
          aiSummary: String(providerEstimate.summary || providerEstimate.note || "Xarici AI miqdarları və layihə risklərini yoxladı.").slice(0, 1_000)
        };
        let catalogRefreshError = "";
        if (window.ConstEraAPI?.catalogEstimate) {
          if (status) status.textContent = "AI nəticəsi hazırdır. Yenilənmiş miqdarlar real kataloqla təkrar hesablanır...";
          try {
            currentEstimate = await enrichEstimateWithCatalog(currentEstimate);
          } catch (error) {
            catalogRefreshError = error.message || "Kataloq qiymətləndirilməsi alınmadı.";
          }
        }
        writeEstimates([currentEstimate, ...readEstimates().filter((item) => item.id !== currentEstimate.id)]);
        renderEstimate(currentEstimate, false);
        renderHistory();
        if (status) status.textContent = catalogRefreshError
          ? `${currentEstimate.rows.length} material qrupu AI ilə yoxlanıldı. Kataloq yenilənmədi: ${catalogRefreshError}`
          : `${currentEstimate.rows.length} material qrupu AI ilə yoxlanıldı və real kataloqla yenidən qiymətləndirildi.`;
      } catch (error) {
        if (status) status.textContent = `Qayda əsaslı smeta hazırdır. Xarici AI cavab vermədi: ${error.message}`;
      }
    }
    if (cloudUser && window.ConstEraAPI?.saveEstimate) {
      try {
        await persistEstimate(currentEstimate);
        if (status) status.textContent = `${currentEstimate.rows.length} material qrupu hazırlandı və Neon kabinetində saxlandı.`;
      } catch (error) {
        if (status) status.textContent = `Smeta lokal saxlandı. Neon: ${error.message}`;
      }
    }
  });
  resetButton?.addEventListener("click", () => {
    form.reset();
    output.hidden = true;
    currentEstimate = null;
    if (status) status.textContent = "Forma yeniləndi.";
  });
  exportButton?.addEventListener("click", () => exportEstimate(currentEstimate || readEstimates()[0]));
  clearHistoryButton?.addEventListener("click", () => {
    writeEstimates([]);
    currentEstimate = null;
    output.hidden = true;
    renderHistory();
    if (status) status.textContent = "Smeta tarixçəsi təmizləndi.";
  });
  importButton?.addEventListener("click", async () => {
    const file = importFile?.files?.[0];
    if (!file) {
      if (status) status.textContent = "İdxal üçün XLSX, CSV, TXT, TSV və ya PDF faylı seç.";
      return;
    }
    importButton.disabled = true;
    try {
      if (status) status.textContent = "Material siyahısı təhlükəsiz şəkildə oxunur...";
      const contentBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Faylı oxumaq mümkün olmadı."));
        reader.onload = () => resolve(String(reader.result || "").split(",").pop() || "");
        reader.readAsDataURL(file);
      });
      const parsed = await window.ConstEraAPI.importEstimateDocument({
        fileName: file.name,
        mimeType: file.type,
        contentBase64
      });
      const base = createEstimate(new FormData(form));
      currentPlan = null;
      currentEstimate = {
        ...base,
        id: `smeta-import-${Date.now()}`,
        projectLabel: `${file.name} sənədindən smeta`,
        rows: (parsed.data.rows || []).map((row, index) => enrichWorkflowRow({
          ...row,
          included: index < 20,
          products: recommendProducts(row)
        })),
        note: [base.note, `Mənbə faylı: ${file.name}`].filter(Boolean).join(" · "),
        sourceType: String(parsed.data.sourceType || "document"),
        sourceFileName: file.name,
        aiProvider: Boolean(parsed.data.requiresAi),
        aiRunId: String(parsed.data.aiRunId || ""),
        aiConfidence: Number(parsed.data.confidence || 0),
        aiSources: Array.isArray(parsed.data.sources) ? parsed.data.sources : [],
        aiWarnings: Array.isArray(parsed.data.warnings) ? parsed.data.warnings : [],
        aiApprovalStatus: String(parsed.data.approval?.status || (parsed.data.requiresAi ? "pending" : "not_required")),
        workflowStatus: parsed.data.requiresAi ? "review_pending" : "draft"
      };
      let catalogImportError = "";
      if (window.ConstEraAPI?.catalogEstimate) {
        try {
          currentEstimate = await enrichEstimateWithCatalog(currentEstimate);
        } catch (error) {
          catalogImportError = error.message || "Kataloq qiymətləndirilməsi alınmadı.";
        }
      }
      writeEstimates([currentEstimate, ...readEstimates()]);
      renderEstimate(currentEstimate);
      renderHistory();
      window.ConstEraTrack?.("estimate_created", { entityType: "estimate", entityId: currentEstimate.id, payload: { source: parsed.data.sourceType, rows: currentEstimate.rows.length } });
      if (cloudUser && window.ConstEraAPI?.saveEstimate) {
        await persistEstimate(currentEstimate);
      }
      if (status) status.textContent = catalogImportError
        ? `${currentEstimate.rows.length} material sətri idxal edildi. Kataloq qiymətləndirilmədi: ${catalogImportError}`
        : `${currentEstimate.rows.length} material sətri idxal edildi və kataloqla qiymətləndirildi.`;
    } catch (error) {
      if (status) status.textContent = error.message || "Smeta faylı idxal olunmadı.";
    } finally {
      importButton.disabled = false;
    }
  });
  historyList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ai-smeta-open]");
    if (!button) return;
    currentPlan = null;
    currentEstimate = readEstimates().find((estimate) => estimate.id === button.dataset.aiSmetaOpen) || null;
    if (currentEstimate) {
      renderEstimate(currentEstimate);
      loadProcurementPlan(currentEstimate.id).catch((error) => {
        if (status) status.textContent = `Satınalma planı yüklənmədi: ${error.message}`;
      });
    }
  });
  output.addEventListener("change", async (event) => {
    const target = event.target.closest("[data-ai-smeta-row-include], [data-ai-smeta-row-quantity], [data-ai-smeta-row-unit]");
    if (!target || !currentEstimate || workflowStatusFor(currentEstimate) === "converted") return;
    const rowIndex = Number(target.dataset.rowIndex);
    if (!Number.isInteger(rowIndex) || !currentEstimate.rows[rowIndex]) return;
    const rows = currentEstimate.rows.map((row) => ({ ...row }));
    const row = rows[rowIndex];
    let pricingChanged = false;
    if (target.matches("[data-ai-smeta-row-include]")) {
      const nextIncluded = Boolean(target.checked);
      const nextCount = rows.filter((item, index) => index === rowIndex ? nextIncluded : item.included !== false).length;
      if (nextIncluded && nextCount > 20) {
        target.checked = false;
        if (status) status.textContent = "Bir RFQ üçün maksimum 20 material mövqeyi seçilə bilər.";
        return;
      }
      row.included = nextIncluded;
    } else if (target.matches("[data-ai-smeta-row-quantity]")) {
      const quantity = Number(target.value);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        if (status) status.textContent = "Material miqdarı sıfırdan böyük olmalıdır.";
        renderEstimate(currentEstimate, false);
        return;
      }
      row.quantity = quantity;
      row.catalog = null;
      pricingChanged = true;
    } else {
      const unit = String(target.value || "").trim().slice(0, 40);
      if (!unit) {
        renderEstimate(currentEstimate, false);
        return;
      }
      row.unit = unit;
      row.catalog = null;
      pricingChanged = true;
    }
    currentEstimate = {
      ...currentEstimate,
      rows,
      ...(pricingChanged ? { catalogPricing: null } : {}),
      humanEditedAt: new Date().toISOString()
    };
    writeEstimates([currentEstimate, ...readEstimates().filter((item) => item.id !== currentEstimate.id)]);
    renderEstimate(currentEstimate, false);
    renderHistory();
    try {
      await persistEstimate(currentEstimate);
      if (status) status.textContent = pricingChanged
        ? "Düzəliş saxlandı. Məbləği yeniləmək üçün qiymətləri yenilə."
        : "RFQ üçün material seçimi saxlandı.";
    } catch (error) {
      if (status) status.textContent = `Düzəliş lokal saxlandı. Neon: ${error.message}`;
    }
  });
  output.addEventListener("click", async (event) => {
    const generatePlanButton = event.target.closest("[data-ai-plan-generate]");
    if (generatePlanButton) {
      const estimate = readEstimates().find((item) => item.id === generatePlanButton.dataset.aiPlanGenerate) || currentEstimate;
      if (!estimate || !cloudUser || !window.ConstEraAPI?.generateProcurementPlan) {
        if (status) status.textContent = "AI satınalma planı üçün hesaba daxil ol.";
        return;
      }
      const projectStartDate = String(output.querySelector("[data-ai-plan-start]")?.value || "");
      const durationDays = Number(output.querySelector("[data-ai-plan-duration]")?.value || 150);
      generatePlanButton.disabled = true;
      try {
        let approvedEstimate = estimate;
        if (workflowStatusFor(estimate) === "draft") {
          approvedEstimate = { ...estimate, workflowStatus: "approved" };
          currentEstimate = approvedEstimate;
          writeEstimates([approvedEstimate, ...readEstimates().filter((item) => item.id !== approvedEstimate.id)]);
          await persistEstimate(approvedEstimate);
        }
        if (status) status.textContent = "Tikinti ardıcıllığı və təchizat riskləri AI ilə planlaşdırılır...";
        const response = await window.ConstEraAPI.generateProcurementPlan({
          estimateId: approvedEstimate.id,
          projectStartDate,
          durationDays
        });
        currentPlan = response.data?.plan || null;
        currentEstimate = approvedEstimate;
        renderEstimate(currentEstimate, false);
        renderHistory();
        if (status) status.textContent = currentPlan
          ? `${currentPlan.waves.length} satınalma dalğası hazırlandı. Tarixləri yoxla və planı təsdiqlə.`
          : "Satınalma planı yaradılmadı.";
      } catch (error) {
        if (status) status.textContent = error.message || "Satınalma planı yaradılmadı.";
      } finally {
        if (generatePlanButton.isConnected) generatePlanButton.disabled = false;
      }
      return;
    }
    const savePlanButton = event.target.closest("[data-ai-plan-save]");
    if (savePlanButton) {
      if (!currentPlan || !window.ConstEraAPI?.updateProcurementPlan) return;
      const waves = [...output.querySelectorAll("[data-ai-plan-wave]")].map((element) => {
        const source = currentPlan.waves.find((wave) => wave.id === element.dataset.waveId) || {};
        return {
          id: element.dataset.waveId,
          included: Boolean(element.querySelector("[data-ai-plan-included]")?.checked),
          needByDate: element.querySelector("[data-ai-plan-need]")?.value,
          startDate: element.querySelector("[data-ai-plan-wave-start]")?.value,
          endDate: element.querySelector("[data-ai-plan-wave-end]")?.value,
          leadTimeDays: Number(element.querySelector("[data-ai-plan-lead]")?.value || source.leadTimeDays),
          riskLevel: element.querySelector("[data-ai-plan-risk]")?.value || source.riskLevel,
          reason: source.reason || "",
          checks: source.checks || []
        };
      });
      if (!waves.some((wave) => wave.included)) {
        if (status) status.textContent = "Ən azı bir satınalma dalğası aktiv qalmalıdır.";
        return;
      }
      savePlanButton.disabled = true;
      try {
        const response = await window.ConstEraAPI.updateProcurementPlan(currentPlan.id, waves);
        currentPlan = response.data?.plan || currentPlan;
        renderEstimate(currentEstimate, false);
        if (status) status.textContent = "Satınalma planındakı insan düzəlişləri Neon-da saxlandı.";
      } catch (error) {
        if (status) status.textContent = error.message || "Satınalma planı saxlanmadı.";
      } finally {
        if (savePlanButton.isConnected) savePlanButton.disabled = false;
      }
      return;
    }
    const planReviewButton = event.target.closest("[data-ai-plan-review]");
    if (planReviewButton) {
      const decision = planReviewButton.dataset.aiPlanReview;
      const note = decision === "reject"
        ? window.prompt("Planın rədd səbəbini yaz:", "Təchizat tarixləri yenidən hesablanmalıdır.")
        : "İstifadəçi satınalma tarixlərini, dalğaları və riskləri yoxlayıb təsdiqlədi.";
      if (decision === "reject" && note === null) return;
      if (!planReviewButton.dataset.runId || !window.ConstEraAPI?.reviewAiRun || !currentPlan) return;
      planReviewButton.disabled = true;
      try {
        await window.ConstEraAPI.reviewAiRun(planReviewButton.dataset.runId, decision, note || "");
        await loadProcurementPlan(currentPlan.estimateId);
        if (status) status.textContent = decision === "approve"
          ? "Satınalma planı təsdiqləndi. İndi mərhələli RFQ-ləri yarada bilərsən."
          : "Satınalma planı rədd edildi.";
      } catch (error) {
        if (status) status.textContent = error.message || "Satınalma planı təsdiqlənmədi.";
      } finally {
        if (planReviewButton.isConnected) planReviewButton.disabled = false;
      }
      return;
    }
    const activatePlanButton = event.target.closest("[data-ai-plan-activate]");
    if (activatePlanButton) {
      const legalAccepted = Boolean(output.querySelector("[data-ai-smeta-legal]")?.checked);
      if (!legalAccepted) {
        if (status) status.textContent = "RFQ dalğalarını yaratmaq üçün istifadə şərtləri ilə razılaş.";
        output.querySelector("[data-ai-smeta-legal]")?.focus();
        return;
      }
      if (!currentPlan || !window.ConstEraAPI?.activateProcurementPlan) return;
      activatePlanButton.disabled = true;
      try {
        const response = await window.ConstEraAPI.activateProcurementPlan(currentPlan.id, {
          legalAccepted: true,
          sourcePath: `${window.location.pathname}${window.location.search}`
        });
        currentPlan = response.data?.plan || currentPlan;
        const rfqIds = (currentPlan.waves || []).map((wave) => wave.rfqId).filter(Boolean);
        currentEstimate = {
          ...(currentEstimate || {}),
          workflowStatus: "converted",
          procurementPlanId: currentPlan.id,
          procurementRfqIds: rfqIds
        };
        writeEstimates([currentEstimate, ...readEstimates().filter((item) => item.id !== currentEstimate.id)]);
        renderEstimate(currentEstimate, false);
        renderHistory();
        if (status) status.innerHTML = `${rfqIds.length} mərhələ RFQ-si yaradıldı. <a class="source-link" href="rfq-dashboard.html">Sorğu panelini aç</a>`;
      } catch (error) {
        if (status) status.textContent = error.message || "Mərhələli RFQ-lər yaradılmadı.";
      } finally {
        if (activatePlanButton.isConnected) activatePlanButton.disabled = false;
      }
      return;
    }
    const repriceButton = event.target.closest("[data-ai-smeta-reprice]");
    if (repriceButton) {
      const estimate = readEstimates().find((item) => item.id === repriceButton.dataset.aiSmetaReprice) || currentEstimate;
      if (!estimate || !window.ConstEraAPI?.catalogEstimate) return;
      repriceButton.disabled = true;
      try {
        if (status) status.textContent = "Seçilmiş miqdarlar real kataloqla yenidən qiymətləndirilir...";
        currentEstimate = await enrichEstimateWithCatalog(estimate);
        writeEstimates([currentEstimate, ...readEstimates().filter((item) => item.id !== currentEstimate.id)]);
        await persistEstimate(currentEstimate);
        renderEstimate(currentEstimate, false);
        renderHistory();
        if (status) status.textContent = `${currentEstimate.catalogPricing.pricedRows} mövqe təsdiqli qiymətlə yeniləndi.`;
      } catch (error) {
        if (status) status.textContent = error.message || "Kataloq qiymətləri yenilənmədi.";
      } finally {
        if (repriceButton.isConnected) repriceButton.disabled = false;
      }
      return;
    }
    const approveRfqButton = event.target.closest("[data-ai-smeta-approve-rfq]");
    if (approveRfqButton) {
      const estimate = readEstimates().find((item) => item.id === approveRfqButton.dataset.aiSmetaApproveRfq) || currentEstimate;
      const legalAccepted = Boolean(output.querySelector("[data-ai-smeta-legal]")?.checked);
      if (!estimate?.aiRunId || !window.ConstEraAPI?.reviewAiRun) {
        if (status) status.textContent = "AI nəticəsinin audit nömrəsi tapılmadı.";
        return;
      }
      if (!legalAccepted) {
        if (status) status.textContent = "Təsdiq və RFQ üçün istifadə şərtləri ilə razılaş.";
        output.querySelector("[data-ai-smeta-legal]")?.focus();
        return;
      }
      approveRfqButton.disabled = true;
      try {
        const response = await window.ConstEraAPI.reviewAiRun(
          estimate.aiRunId,
          "approve",
          "İstifadəçi smetanı yoxladı və RFQ yaradılmasını təsdiqlədi."
        );
        currentEstimate = {
          ...estimate,
          aiApprovalStatus: response.data?.approvalStatus || "approved",
          workflowStatus: "approved"
        };
        writeEstimates([currentEstimate, ...readEstimates().filter((item) => item.id !== currentEstimate.id)]);
        await persistEstimate(currentEstimate);
        await submitEstimateRfq(currentEstimate, true, approveRfqButton);
      } catch (error) {
        if (status) status.textContent = error.message || "Smeta təsdiqlənmədi və RFQ yaradılmadı.";
      } finally {
        if (approveRfqButton.isConnected) approveRfqButton.disabled = false;
      }
      return;
    }
    const reviewButton = event.target.closest("[data-ai-smeta-review]");
    if (reviewButton) {
      const decision = reviewButton.dataset.aiSmetaReview;
      const note = decision === "reject"
        ? window.prompt("Rədd səbəbini yaz:", "Miqdarlar ekspert tərəfindən yenidən yoxlanmalıdır.")
        : "İstifadəçi smeta qaralamasını yoxladı və təsdiqlədi.";
      if (decision === "reject" && note === null) return;
      if (!reviewButton.dataset.runId || !window.ConstEraAPI?.reviewAiRun) {
        if (status) status.textContent = "AI nəticəsinin audit nömrəsi tapılmadı.";
        return;
      }
      reviewButton.disabled = true;
      try {
        const response = await window.ConstEraAPI.reviewAiRun(reviewButton.dataset.runId, decision, note || "");
        currentEstimate = {
          ...(currentEstimate || {}),
          aiApprovalStatus: response.data?.approvalStatus || (decision === "approve" ? "approved" : "rejected"),
          workflowStatus: decision === "approve" ? "approved" : "rejected"
        };
        writeEstimates([currentEstimate, ...readEstimates().filter((item) => item.id !== currentEstimate.id)]);
        renderEstimate(currentEstimate, false);
        renderHistory();
        if (cloudUser && window.ConstEraAPI?.saveEstimate) {
          await persistEstimate(currentEstimate);
        }
        if (status) status.textContent = decision === "approve"
          ? "AI qaralaması təsdiqləndi. İndi sorğu və səbət əməliyyatları açıqdır."
          : "AI qaralaması rədd edildi. Yeni parametrlərlə smetanı yenidən hazırla.";
      } catch (error) {
        if (status) status.textContent = error.message || "AI nəticəsi yoxlanmadı.";
      } finally {
        reviewButton.disabled = false;
      }
      return;
    }
    const exportCurrent = event.target.closest("[data-ai-smeta-export-current]");
    if (exportCurrent) {
      const estimate = readEstimates().find((item) => item.id === exportCurrent.dataset.aiSmetaExportCurrent) || currentEstimate;
      exportEstimate(estimate);
      return;
    }
    if (event.target.closest("[data-ai-smeta-print]")) {
      window.print();
      return;
    }
    const cartButton = event.target.closest("[data-ai-smeta-cart]");
    if (cartButton) {
      const estimate = readEstimates().find((item) => item.id === cartButton.dataset.aiSmetaCart) || currentEstimate;
      const selected = (estimate?.rows || []).filter((row) => row.included !== false).map((row) => ({
        product: row.catalog?.selected,
        quantity: Number(row.catalog?.packageCount || row.quantity || 1)
      })).filter((item) => item.product?.id && Number.isFinite(item.quantity) && item.quantity > 0);
      const next = new Map(getCart().map((item) => [item.id, item]));
      selected.forEach((item) => next.set(item.product.id, {
        id: item.product.id,
        quantity: item.quantity,
        offerId: item.product.offerId || ""
      }));
      saveCart([...next.values()]);
      updateCartIndicators();
      window.ConstEraTrack?.("add_to_cart", { entityType: "estimate", entityId: estimate?.id || "", payload: { products: selected.length } });
      if (status) status.innerHTML = `${selected.length} qiymətlənmiş məhsul səbətə əlavə edildi. <a class="source-link" href="checkout.html">Səbəti aç</a>`;
      return;
    }
    const rfqButton = event.target.closest("[data-ai-smeta-rfq]");
    if (!rfqButton) return;
    const estimate = readEstimates().find((item) => item.id === rfqButton.dataset.aiSmetaRfq) || currentEstimate;
    if (!estimate) return;
    const legalAccepted = Boolean(output.querySelector("[data-ai-smeta-legal]")?.checked);
    try {
      await submitEstimateRfq(estimate, legalAccepted, rfqButton);
    } catch (error) {
      if (status) status.textContent = error.message || "Smeta RFQ-yə çevrilmədi.";
      if (!legalAccepted) output.querySelector("[data-ai-smeta-legal]")?.focus();
    }
  });

  const connectEstimateAccount = async () => {
    if (!window.ConstEraAPI?.session) return;
    try {
      const [session, integrations] = await Promise.all([
        window.ConstEraAPI.session(),
        window.ConstEraAPI.integrationReadiness?.().catch(() => ({ data: { readiness: {} } }))
      ]);
      cloudUser = session.user;
      aiProviderReady = Boolean(integrations?.data?.readiness?.aiEstimate);
      if (cloudUser && requestedEstimateId && currentEstimate?.id !== requestedEstimateId && window.ConstEraAPI?.cabinet) {
        const cabinet = await window.ConstEraAPI.cabinet();
        const entry = (cabinet.data?.estimates || []).find((estimate) => estimate.id === requestedEstimateId);
        if (entry) {
          currentEstimate = normalizeEstimateWorkflow({
            ...(entry.payload || {}),
            id: entry.id,
            workflowStatus: entry.workflowStatus,
            sourceType: entry.sourceType,
            sourceFileName: entry.sourceFileName,
            aiRunId: entry.aiRunId,
            rfqId: entry.rfqId,
            procurementPlanId: entry.procurementPlanId || entry.payload?.procurementPlanId
          });
          writeEstimates([currentEstimate, ...readEstimates().filter((estimate) => estimate.id !== currentEstimate.id)]);
          renderEstimate(currentEstimate, false);
          renderHistory();
        }
      }
      if (cloudUser && status) {
        status.textContent = `${cloudUser.name} hesabı qoşuldu. ${aiProviderReady ? "AI yoxlaması və insan təsdiqi aktivdir." : "Smetalar qayda əsaslı hesablanacaq və Neon kabinetində saxlanacaq."}`;
      }
      if (cloudUser && currentEstimate) await loadProcurementPlan(currentEstimate.id);
    } catch {
      cloudUser = null;
    }
  };
  connectEstimateAccount();
};

const initSupplierPortal = () => {
  const form = document.querySelector("[data-supplier-product-form]");
  const categorySelect = document.querySelector("[data-supplier-category]");
  const subcategorySelect = document.querySelector("[data-supplier-subcategory]");
  const clearFormButton = document.querySelector("[data-supplier-clear-form]");
  const csvInput = document.querySelector("[data-supplier-price-csv]");
  const importButton = document.querySelector("[data-supplier-import-csv]");
  const exportButton = document.querySelector("[data-supplier-export-csv]");
  const templateButton = document.querySelector("[data-supplier-template]");
  const importFileInput = document.querySelector("[data-supplier-import-file]");
  const validateFileButton = document.querySelector("[data-supplier-validate-file]");
  const importFileButton = document.querySelector("[data-supplier-import-file-run]");
  const importStatus = document.querySelector("[data-supplier-import-status]");
  const bulkInput = document.querySelector("[data-inventory-bulk-input]");
  const bulkFile = document.querySelector("[data-inventory-bulk-file]");
  const bulkFormat = document.querySelector("[data-inventory-bulk-format]");
  const bulkTemplateButton = document.querySelector("[data-inventory-bulk-template]");
  const bulkPreviewButton = document.querySelector("[data-inventory-bulk-preview]");
  const bulkApplyButton = document.querySelector("[data-inventory-bulk-apply]");
  const bulkStatus = document.querySelector("[data-inventory-bulk-status]");
  const bulkPreviewList = document.querySelector("[data-inventory-bulk-preview-list]");
  const rows = document.querySelector("[data-supplier-product-rows]");
  const count = document.querySelector("[data-supplier-product-count]");
  const stats = document.querySelector("[data-supplier-portal-stats]");
  const status = document.querySelector("[data-supplier-status]");
  const inventorySearch = document.querySelector("[data-inventory-search]");
  const inventoryFilter = document.querySelector("[data-inventory-filter]");
  const inventorySaveAll = document.querySelector("[data-inventory-save-all]");
  const inventoryStatus = document.querySelector("[data-inventory-status]");
  const historyPanel = document.querySelector("[data-inventory-history-panel]");
  const historyTitle = document.querySelector("[data-inventory-history-title]");
  const historyList = document.querySelector("[data-inventory-history]");
  const historyClose = document.querySelector("[data-inventory-history-close]");
  const offerRows = document.querySelector("[data-supplier-offer-rows]");
  const offerCount = document.querySelector("[data-supplier-offer-count]");
  const offerSearch = document.querySelector("[data-supplier-offer-search]");
  const offerFilter = document.querySelector("[data-supplier-offer-filter]");
  const offerStatus = document.querySelector("[data-supplier-offer-status]");
  const orderRows = document.querySelector("[data-supplier-order-rows]");
  const orderCount = document.querySelector("[data-supplier-order-count]");

  if (!form || !categorySelect || !subcategorySelect) return;

  let cloudProducts = null;
  let cloudUser = null;
  let inventoryState = null;
  let supplierOffers = [];
  let supplierFulfillments = [];
  let supplierPurchaseOrders = [];
  let bulkInventoryPreview = [];
  const inventoryDrafts = new Map();
  const inventoryDirty = new Set();
  const supplierNameInput = form.elements.supplier;
  const getSupplierName = () => String(supplierNameInput?.value || "Yeni təchizatçı").trim() || "Yeni təchizatçı";
  const getSupplierProducts = () => {
    const serverProducts = inventoryState?.products ?? cloudProducts;
    const products = (serverProducts ?? getAdminProducts())
      .map((product, index) => ensureAdminProductShape(product, index));
    return serverProducts === null || serverProducts === undefined
      ? products.filter((product) => normalize(product.supplier) === normalize(getSupplierName()))
      : products;
  };

  const renderCategoryOptions = () => {
    categorySelect.innerHTML = groupCategories(marketplace.categories).map((group) => `
      <optgroup label="${escapeAttr(group.name)}">
        ${group.categories.map((category) => `<option value="${escapeAttr(category.id)}">${escapeHtml(category.title)}</option>`).join("")}
      </optgroup>
    `).join("");
  };

  const renderSubcategoryOptions = () => {
    const category = getCategory(categorySelect.value);
    subcategorySelect.innerHTML = (category?.subcategories || ["Ümumi"]).map((subcategory) =>
      `<option value="${escapeAttr(subcategory)}">${escapeHtml(subcategory)}</option>`
    ).join("");
  };

  const renderStats = () => {
    if (!stats) return;
    const supplierProducts = getSupplierProducts();
    const metrics = inventoryState?.metrics;
    const confirmed = metrics?.confirmed ?? supplierProducts.filter((product) => product.priceStatus === "confirmed").length;
    const stale = metrics?.stale ?? supplierProducts.filter((product) => product.priceStatus === "expired").length;
    const lowStock = metrics?.lowStock ?? supplierProducts.filter((product) =>
      product.availableQuantity !== "" && Number(product.availableQuantity) <= Math.max(Number(product.minimumOrder || 0), 5)
    ).length;
    const inventoryValue = metrics?.inventoryValue ?? supplierProducts.reduce((sum, product) =>
      sum + Number(product.priceAmount || 0) * Number(product.stockQuantity || 0), 0
    );
    stats.innerHTML = `
      <article class="stat-card"><span class="stat-value">${supplierProducts.length}</span><p>məhsulum</p></article>
      <article class="stat-card"><span class="stat-value">${confirmed}</span><p>təsdiqli qiymət</p></article>
      <article class="stat-card"><span class="stat-value">${stale}</span><p>köhnəlmiş qiymət</p></article>
      <article class="stat-card"><span class="stat-value">${lowStock}</span><p>az stok</p></article>
      <article class="stat-card"><span class="stat-value">${supplierOffers.length}</span><p>aktiv təklif</p></article>
      <article class="stat-card"><span class="stat-value">${supplierPurchaseOrders.length}</span><p>alt-sifariş</p></article>
      <article class="stat-card"><span class="stat-value">${Number(inventoryValue).toLocaleString("az-AZ", { maximumFractionDigits: 0 })}</span><p>stok dəyəri, AZN</p></article>
    `;
  };

  const renderOrders = () => {
    if (orderCount) orderCount.textContent = `${supplierPurchaseOrders.length} alt-sifariş`;
    if (!orderRows) return;
    const purchaseOrderLabels = {
      draft: "Təsdiq gözləyir",
      issued: "Göndərilib",
      accepted: "Qəbul edilib",
      preparing: "Hazırlanır",
      ready: "Göndərişə hazırdır",
      shipped: "Göndərilib",
      delivered: "Çatdırılıb",
      cancelled: "Ləğv edilib"
    };
    const fulfillmentLabels = {
      pending: "Gözləyir",
      accepted: "Qəbul edilib",
      preparing: "Hazırlanır",
      ready: "Göndərişə hazırdır",
      shipped: "Göndərilib",
      delivered: "Çatdırılıb",
      cancelled: "Ləğv edilib"
    };
    const nextActions = {
      pending: ["accepted", "Qəbul et"],
      accepted: ["preparing", "Hazırlamağa başla"],
      preparing: ["ready", "Hazırdır"],
      ready: ["shipped", "Göndər"],
      shipped: ["delivered", "Çatdırıldı"]
    };
    orderRows.innerHTML = supplierPurchaseOrders.length ? supplierPurchaseOrders.map((order) => {
      const visibleItems = order.items || [];
      const fulfillment = supplierFulfillments.find((item) =>
        item.id === order.fulfillmentId || item.orderId === order.orderId
      );
      const next = fulfillment ? nextActions[fulfillment.status] : null;
      const amount = order.totalAmount;
      return `
        <tr>
          <td data-label="Alt-sifariş"><strong>${order.purchaseOrderNumber ? `AS-${escapeHtml(order.purchaseOrderNumber)}` : `#${escapeHtml(order.orderNumber)}`}</strong><small>Əsas sifariş #${escapeHtml(order.orderNumber)} · ${escapeHtml(order.deliveryMode || "Çatdırılma")}</small></td>
          <td data-label="Müştəri"><strong>${escapeHtml(order.companyName)}</strong><small>${escapeHtml(order.city)} · ${escapeHtml(order.contactName || "")}</small></td>
          <td data-label="Məhsullarım">${visibleItems.length}<small>${visibleItems.slice(0, 2).map((item) => escapeHtml(item.title)).join(" · ")}</small></td>
          <td data-label="Məbləğ"><strong>${amount === null ? "Sorğu əsasında" : formatMoney(amount, order.currency || "AZN")}</strong><small>${formatMoney(order.deliveryAmount, order.currency || "AZN")} logistika payı</small></td>
          <td data-label="Vəziyyət"><span class="status-pill">${escapeHtml(purchaseOrderLabels[order.status] || order.status)}</span></td>
          <td data-label="İcra">
            ${fulfillment ? `
              <span class="status-pill">${escapeHtml(fulfillmentLabels[fulfillment.status] || fulfillment.status)}</span>
              ${fulfillment.trackingCode || fulfillment.deliveryProvider
                ? `<small>${escapeHtml([fulfillment.deliveryProvider, fulfillment.trackingCode].filter(Boolean).join(" · "))}</small>`
                : ""}
              ${next ? `
                <div class="inventory-actions">
                  <button class="table-action" type="button"
                    data-fulfillment-update="${escapeAttr(fulfillment.id)}"
                    data-fulfillment-next="${escapeAttr(next[0])}">${escapeHtml(next[1])}</button>
                  ${!["shipped", "delivered"].includes(fulfillment.status)
                    ? `<button class="table-action is-danger" type="button"
                        data-fulfillment-update="${escapeAttr(fulfillment.id)}"
                        data-fulfillment-next="cancelled">Ləğv et</button>`
                    : ""}
                </div>
              ` : ""}
            ` : "<small>İcra qeydi hazırlanır</small>"}
          </td>
          <td data-label="Tarix">${Number.isFinite(Date.parse(order.issuedAt || order.createdAt)) ? new Date(order.issuedAt || order.createdAt).toLocaleDateString("az-AZ") : "-"}</td>
        </tr>
      `;
    }).join("") : '<tr><td colspan="7"><strong>Sifariş yoxdur.</strong><small>Məhsullarınız olan sifarişlər burada görünəcək.</small></td></tr>';
  };

  const renderOfferRows = () => {
    if (!offerRows) return;
    const query = normalize(offerSearch?.value);
    const filter = offerFilter?.value || "all";
    const visibleOffers = supplierOffers.filter((offer) => {
      const searchable = normalize([offer.productName, offer.productSku, offer.supplierSku, offer.supplier].join(" "));
      const lowStock = offer.stockQuantity !== null
        && offer.stockQuantity <= Math.max(Number(offer.minimumOrder || 0), 5);
      const matchesFilter = filter === "all"
        || offer.priceStatus === filter
        || offer.status === filter
        || (filter === "low-stock" && lowStock);
      return (!query || searchable.includes(query)) && matchesFilter;
    });
    if (offerCount) offerCount.textContent = `${visibleOffers.length} / ${supplierOffers.length} təklif`;
    offerRows.innerHTML = visibleOffers.length ? visibleOffers.map((offer) => `
      <tr data-supplier-offer-row="${escapeAttr(offer.id)}">
        <td data-label="Məhsul">
          <strong>${escapeHtml(offer.productName || "Məhsul")}</strong>
          <small>${escapeHtml(offer.productSku || offer.supplierSku || "")}</small>
        </td>
        <td data-label="Qiymət">
          <input class="inventory-input" data-supplier-offer-field="unitPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeAttr(offer.unitPrice ?? "")}" aria-label="Təklif qiyməti" />
          <small>${escapeHtml(offer.currency || "AZN")}</small>
        </td>
        <td data-label="Stok">
          <input class="inventory-input" data-supplier-offer-field="stockQuantity" type="number" min="0" step="0.001" inputmode="decimal" value="${escapeAttr(offer.stockQuantity ?? "")}" aria-label="Təklif stoku" />
        </td>
        <td data-label="Min. sifariş">
          <input class="inventory-input" data-supplier-offer-field="minimumOrder" type="number" min="0" step="0.001" inputmode="decimal" value="${escapeAttr(offer.minimumOrder ?? "")}" aria-label="Minimum sifariş" />
        </td>
        <td data-label="Təslimat">
          <input class="inventory-input" data-supplier-offer-field="leadTimeDays" type="number" min="0" max="3650" step="1" inputmode="numeric" value="${escapeAttr(offer.leadTimeDays ?? "")}" aria-label="Təslimat günü" />
          <small>gün</small>
        </td>
        <td data-label="Qiymət statusu">
          <select class="inventory-input" data-supplier-offer-field="priceStatus">
            <option value="confirmed" ${offer.priceStatus === "confirmed" ? "selected" : ""}>Təsdiqli</option>
            <option value="request" ${offer.priceStatus === "request" ? "selected" : ""}>Sorğu ilə</option>
            <option value="expired" ${offer.priceStatus === "expired" ? "selected" : ""}>Vaxtı keçib</option>
          </select>
          <small>${offer.priceVerifiedAt ? new Date(offer.priceVerifiedAt).toLocaleDateString("az-AZ") : "Yoxlanmayıb"}</small>
        </td>
        <td data-label="Mənbə">
          <input class="inventory-input inventory-source-input" data-supplier-offer-field="sourceUrl" type="url" value="${escapeAttr(offer.sourceUrl || "")}" placeholder="https://..." aria-label="Qiymət mənbəsi" />
        </td>
        <td data-label="Əməliyyat">
          <button class="table-action" type="button" data-supplier-offer-save="${escapeAttr(offer.id)}">Saxla</button>
        </td>
      </tr>
    `).join("") : '<tr><td colspan="8"><strong>Uyğun təklif yoxdur.</strong><small>Yeni məhsul əlavə etdikdə ona bağlı təklif burada görünəcək.</small></td></tr>';
    renderStats();
  };

  const renderRows = () => {
    if (!rows) return;
    const query = normalize(inventorySearch?.value);
    const filter = inventoryFilter?.value || "all";
    const now = Date.now();
    const allProducts = getSupplierProducts();
    const supplierProducts = allProducts.filter((product) => {
      const searchable = normalize([product.sku, product.name, product.brand, product.subcategory].join(" "));
      const stale = !product.priceVerifiedAt || now - new Date(product.priceVerifiedAt).getTime() > 30 * 86_400_000;
      const lowStock = product.availableQuantity !== "" && product.availableQuantity !== null && Number(product.availableQuantity) <= Math.max(Number(product.minimumOrder || 0), 5);
      const matchesFilter = filter === "all"
        || (filter === "stale" && stale)
        || (filter === "low-stock" && lowStock)
        || (filter === "missing-stock" && (product.stockQuantity === "" || product.stockQuantity === null))
        || (filter === "request" && product.priceStatus !== "confirmed");
      return (!query || searchable.includes(query)) && matchesFilter;
    }).slice(0, 500);
    if (count) count.textContent = `${supplierProducts.length} / ${allProducts.length} məhsul`;
    rows.innerHTML = supplierProducts.length ? supplierProducts.map((product) => {
      const draft = inventoryDrafts.get(product.id) || {};
      const view = { ...product, ...draft };
      return `
      <tr data-inventory-row="${escapeAttr(product.id)}" class="${inventoryDirty.has(product.id) ? "is-dirty" : ""}">
        <td data-label="Məhsul">
          <strong>${escapeHtml(product.name)}</strong>
          <small>${escapeHtml(product.sku)} · ${escapeHtml(product.brand)} · ${escapeHtml(product.package)}</small>
        </td>
        <td data-label="Qiymət">
          <input class="inventory-input" data-inventory-field="priceAmount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeAttr(view.priceAmount ?? "")}" aria-label="${escapeAttr(product.name)} qiyməti" />
          <small>${escapeHtml(product.priceCurrency || "AZN")}</small>
        </td>
        <td data-label="Stok">
          <input class="inventory-input" data-inventory-field="stockQuantity" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeAttr(view.stockQuantity ?? "")}" aria-label="${escapeAttr(product.name)} stok miqdarı" />
          <small>${Number(product.reservedQuantity || 0).toLocaleString("az-AZ")} rezerv · ${product.availableQuantity === null || product.availableQuantity === "" ? "-" : Number(product.availableQuantity).toLocaleString("az-AZ")} sərbəst</small>
        </td>
        <td data-label="Min. sifariş">
          <input class="inventory-input" data-inventory-field="minimumOrder" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeAttr(view.minimumOrder ?? "")}" aria-label="${escapeAttr(product.name)} minimum sifariş" />
        </td>
        <td data-label="Status">
          <select class="inventory-input" data-inventory-field="priceStatus" aria-label="${escapeAttr(product.name)} qiymət statusu">
            <option value="confirmed" ${view.priceStatus === "confirmed" ? "selected" : ""}>Təsdiqli</option>
            <option value="request" ${view.priceStatus === "request" ? "selected" : ""}>Sorğu ilə</option>
            <option value="expired" ${view.priceStatus === "expired" ? "selected" : ""}>Vaxtı keçib</option>
          </select>
          <small>${product.priceVerifiedAt ? new Date(product.priceVerifiedAt).toLocaleDateString("az-AZ") : "Yoxlanmayıb"}</small>
        </td>
        <td data-label="Mənbə">
          <input class="inventory-input inventory-source-input" data-inventory-field="sourceUrl" type="url" value="${escapeAttr(view.sourceUrl || "")}" placeholder="https://..." aria-label="${escapeAttr(product.name)} qiymət mənbəsi" />
        </td>
        <td data-label="Əməliyyat">
          <div class="inventory-actions">
            <button class="table-action" type="button" data-inventory-save="${escapeAttr(product.id)}">Saxla</button>
            <button class="table-action" type="button" data-inventory-history-open="${escapeAttr(product.id)}">Tarixçə</button>
          </div>
        </td>
      </tr>
    `;
    }).join("") : `
      <tr>
        <td colspan="7">
          <strong>Uyğun məhsul yoxdur.</strong>
          <small>Filtri dəyiş və ya formadan ilk məhsulu əlavə et.</small>
        </td>
      </tr>
    `;
    renderStats();
  };

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };
  const setInventoryStatus = (message, type = "info") => {
    if (!inventoryStatus) return;
    inventoryStatus.textContent = message;
    inventoryStatus.dataset.type = type;
  };

  const refreshCloudProducts = async () => {
    if (!window.ConstEraAPI?.inventory || cloudUser?.role !== "supplier") return;
    const result = await window.ConstEraAPI.inventory();
    inventoryState = result.data || null;
    cloudProducts = inventoryState?.products || [];
    inventoryDrafts.clear();
    inventoryDirty.clear();
    renderRows();
  };
  const refreshSupplierOffers = async () => {
    if (!window.ConstEraAPI?.managedProductOffers || cloudUser?.role !== "supplier") return;
    const result = await window.ConstEraAPI.managedProductOffers();
    supplierOffers = result.data || [];
    renderOfferRows();
  };
  const refreshSupplierOrders = async () => {
    if (!window.ConstEraAPI?.fulfillments || !window.ConstEraAPI?.purchaseOrders || cloudUser?.role !== "supplier") return;
    const [fulfillmentResult, purchaseOrderResult] = await Promise.all([
      window.ConstEraAPI.fulfillments(),
      window.ConstEraAPI.purchaseOrders()
    ]);
    supplierFulfillments = fulfillmentResult.data || [];
    supplierPurchaseOrders = purchaseOrderResult.data || [];
    renderOrders();
    renderStats();
  };

  const connectSupplierAccount = async () => {
    if (!window.ConstEraAPI) return;
    try {
      const session = await window.ConstEraAPI.session();
      cloudUser = session.user;
      if (cloudUser?.role !== "supplier") {
        setStatus(cloudUser
          ? "Bu səhifədə canlı dəyişiklik üçün təchizatçı rolu tələb olunur."
          : "Canlı kabinet üçün təchizatçı hesabına daxil ol. Lokal ehtiyat rejimi aktivdir.");
        return;
      }
      if (supplierNameInput) {
        supplierNameInput.value = cloudUser.companyName || getSupplierName();
        supplierNameInput.readOnly = true;
      }
      await Promise.all([refreshCloudProducts(), refreshSupplierOffers(), refreshSupplierOrders()]);
      setStatus(`${cloudUser.companyName || cloudUser.name} hesabı Neon kataloquna qoşuldu.`);
      setInventoryStatus("Qiymət və stok mərkəzi Neon bazasına qoşuldu.", "success");
    } catch (error) {
      setStatus(`Canlı baza əlçatan deyil: ${error.message}. Lokal ehtiyat rejimi aktivdir.`);
      setInventoryStatus(`Canlı inventar yüklənmədi: ${error.message}`, "error");
    }
  };

  const createProductFromForm = () => {
    const data = new FormData(form);
    const priceAmount = String(data.get("price") || "").trim();
    const priceStatus = String(data.get("priceStatus") || "request");
    const price = priceStatus === "confirmed" && priceAmount
      ? `${Number(priceAmount).toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AZN`
      : "Sorğu əsasında";
    return ensureAdminProductShape({
      sku: data.get("sku"),
      barcode: data.get("barcode"),
      name: data.get("name"),
      brand: data.get("brand"),
      category: data.get("category"),
      subcategory: data.get("subcategory"),
      package: data.get("package"),
      price,
      priceAmount: priceStatus === "confirmed" ? Number(priceAmount) : null,
      priceStatus,
      supplier: data.get("supplier"),
      availability: data.get("availability"),
      stockQuantity: data.get("stockQuantity"),
      minimumOrder: data.get("minimumOrder"),
      imageUrl: data.get("imageUrl"),
      sourceUrl: data.get("sourceUrl"),
      sourceLabel: data.get("supplier"),
      origin: data.get("origin"),
      specs: data.get("specs"),
      priceNote: priceStatus === "confirmed" ? "Təchizatçı tərəfindən təsdiqlənib" : "Qiymət təchizatçı ilə dəqiqləşdirilir"
    }, Date.now());
  };

  renderCategoryOptions();
  renderSubcategoryOptions();
  renderRows();
  renderOfferRows();
  renderOrders();

  categorySelect.addEventListener("change", renderSubcategoryOptions);
  supplierNameInput?.addEventListener("input", renderRows);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const product = createProductFromForm();
    upsertAdminProducts([product]);
    renderRows();
    if (cloudUser?.role !== "supplier" || !window.ConstEraAPI?.saveProduct) {
      setStatus(`${product.name} lokal ehtiyat qatında saxlandı.`);
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const result = await window.ConstEraAPI.saveProduct(product, false);
      await Promise.all([refreshCloudProducts(), refreshSupplierOffers()]);
      setStatus(`${product.name} Neon kataloqunda saxlandı.`);
    } catch (error) {
      setStatus(`${product.name} yalnız lokal saxlandı. Server: ${error.message}`);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  clearFormButton?.addEventListener("click", () => {
    const supplierName = getSupplierName();
    form.reset();
    if (supplierNameInput) supplierNameInput.value = supplierName;
    renderSubcategoryOptions();
    setStatus("Forma təmizləndi.");
  });

  templateButton?.addEventListener("click", () => {
    if (!csvInput) return;
    csvInput.value = [
      "sku,barkod,ad,brend,kateqoriya,subkateqoriya,qablaşdırma,qiymət,təchizatçı,mövcudluq,foto url,mənbə url,xüsusiyyətlər",
      "PNG-PENPLUS-15L,,Penguin Penplus 15 L,Penguin,Boya və örtüklər,Daxili boya,15 L,72.90 AZN,Penguin,Anbarda var,,https://www.penguin.az/,daxili boya; mat; 15 L",
      "EPO-EPOMIX-25KG,,EPO EPOMIX 25 kg,EPO,Tikinti kimyası,Epoksi sistemlər,25 kg,7.30 AZN,EPO,Stok sorğu ilə,,https://www.epo.com.az/,sement əsaslı qarışıq; 25 kg"
    ].join("\n");
    setStatus("CSV şablonu dolduruldu. Sətirləri öz qiymət siyahına uyğun dəyişə bilərsən.");
  });

  importButton?.addEventListener("click", async () => {
    const sourceRows = parseCsvRows(csvInput?.value || "");
    const imported = sourceRows
      .map((row, index) => {
        const product = productFromCsvRow(row, index);
        return ensureAdminProductShape({
          ...product,
          supplier: product.supplier || getSupplierName(),
          sourceLabel: product.sourceLabel || product.supplier || getSupplierName()
        }, index);
      })
      .filter((product) => product.name && product.sku);
    if (!imported.length) {
      setStatus("İdxal üçün uyğun CSV sətri tapılmadı.");
      return;
    }
    upsertAdminProducts(imported);
    renderRows();
    if (cloudUser?.role !== "supplier" || !window.ConstEraAPI?.runImport) {
      setStatus(`${imported.length} məhsul lokal ehtiyat qatına idxal edildi.`);
      return;
    }
    importButton.disabled = true;
    try {
      const result = await window.ConstEraAPI.runImport({
        importType: "product",
        action: "commit",
        filename: "supplier-products.csv",
        rows: sourceRows,
        allowPartial: true
      });
      await Promise.all([refreshCloudProducts(), refreshSupplierOffers()]);
      setStatus(`${result.data.imported} məhsul Neon kataloquna idxal edildi.`);
    } catch (error) {
      setStatus(`Lokal idxal hazırdır, server idxalı alınmadı: ${error.message}`);
    } finally {
      importButton.disabled = false;
    }
  });

  const fileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Fayl oxuna bilmədi."));
    reader.readAsDataURL(file);
  });
  const runSupplierFileImport = async (action, button) => {
    const file = importFileInput?.files?.[0];
    if (!file) {
      if (importStatus) importStatus.textContent = "CSV və ya XLSX faylı seç.";
      return;
    }
    if (cloudUser?.role !== "supplier" || !window.ConstEraAPI?.runImport) {
      if (importStatus) importStatus.textContent = "Fayl idxalı üçün təchizatçı hesabına daxil ol.";
      return;
    }
    button.disabled = true;
    if (importStatus) importStatus.textContent = action === "validate" ? "Fayl yoxlanılır..." : "Fayl idxal edilir...";
    try {
      const result = await window.ConstEraAPI.runImport({
        importType: "product",
        action,
        filename: file.name,
        fileType: file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv",
        fileBase64: await fileAsDataUrl(file),
        allowPartial: true
      });
      const data = result.data;
      if (importStatus) {
        importStatus.textContent = action === "validate"
          ? `${data.valid}/${data.total} sətir uyğundur, ${data.errors.length} səhv tapıldı.`
          : `${data.imported} məhsul Neon kataloquna yazıldı, ${data.errors.length} sətir buraxıldı.`;
      }
      if (action === "commit") await Promise.all([refreshCloudProducts(), refreshSupplierOffers()]);
    } catch (error) {
      if (importStatus) importStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  validateFileButton?.addEventListener("click", () => runSupplierFileImport("validate", validateFileButton));
  importFileButton?.addEventListener("click", () => runSupplierFileImport("commit", importFileButton));

  exportButton?.addEventListener("click", () => {
    const supplierProducts = getSupplierProducts();
    downloadTextFile(`constera-${createSlug(getSupplierName())}-products.csv`, productsToCsv(supplierProducts), "text/csv;charset=utf-8");
    setStatus(`${supplierProducts.length} məhsul CSV faylına hazırlandı.`);
  });

  const renderBulkInventoryPreview = () => {
    if (!bulkPreviewList) return;
    bulkPreviewList.hidden = false;
    if (!bulkInventoryPreview.length) {
      bulkPreviewList.innerHTML = '<div class="inventory-bulk-preview-row has-error"><strong>Uyğun sətir tapılmadı.</strong><span>Başlıq və ən azı bir məlumat sətri əlavə et.</span></div>';
      return;
    }
    bulkPreviewList.innerHTML = bulkInventoryPreview.map((item) => `
      <div class="inventory-bulk-preview-row ${item.valid ? "is-valid" : "has-error"}">
        <strong>${item.rowNumber}. sətir · ${escapeHtml(item.sku)}</strong>
        <span>${item.name ? escapeHtml(item.name) : "Məhsul tapılmadı"}</span>
        <small>${escapeHtml(item.valid ? item.changes.join(" · ") : item.errors.join(" "))}</small>
      </div>
    `).join("");
  };

  bulkTemplateButton?.addEventListener("click", () => {
    if (!bulkInput) return;
    const samples = getSupplierProducts().slice(0, 4);
    bulkInput.value = [
      "sku,qiymət,status,stok,minimum sifariş,mənbə url",
      ...samples.map((product) => [
        escapeCsvValue(product.sku),
        escapeCsvValue(product.priceStatus === "confirmed" ? product.priceAmount ?? "" : ""),
        escapeCsvValue(product.priceStatus || "request"),
        escapeCsvValue(product.stockQuantity ?? ""),
        escapeCsvValue(product.minimumOrder ?? ""),
        escapeCsvValue(product.sourceUrl || "")
      ].join(","))
    ].join("\n");
    if (bulkFormat) bulkFormat.value = "csv";
    bulkInventoryPreview = [];
    if (bulkPreviewList) bulkPreviewList.hidden = true;
    if (bulkStatus) {
      bulkStatus.textContent = samples.length
        ? `${samples.length} real məhsul nümunəsi əlavə edildi. Dəyərləri dəyişib uyğunluğu yoxla.`
        : "Məhsul tapılmadı. Əvvəl məhsul əlavə et və ya canlı təchizatçı hesabına daxil ol.";
      bulkStatus.dataset.type = samples.length ? "info" : "warning";
    }
  });
  bulkFile?.addEventListener("change", async () => {
    const file = bulkFile.files?.[0];
    if (!file || !bulkInput) return;
    if (file.size > 180_000) {
      if (bulkStatus) {
        bulkStatus.textContent = "Fayl maksimum 180 KB ola bilər.";
        bulkStatus.dataset.type = "error";
      }
      bulkFile.value = "";
      return;
    }
    try {
      bulkInput.value = await file.text();
      if (bulkFormat) bulkFormat.value = file.name.toLocaleLowerCase("az-AZ").endsWith(".json") ? "json" : "csv";
      bulkInput.dispatchEvent(new Event("input", { bubbles: true }));
      if (bulkStatus) {
        bulkStatus.textContent = `${file.name} oxundu. Saxlamadan əvvəl uyğunluğu yoxla.`;
        bulkStatus.dataset.type = "info";
      }
    } catch {
      if (bulkStatus) {
        bulkStatus.textContent = "Fayl brauzerdə oxunmadı.";
        bulkStatus.dataset.type = "error";
      }
    }
  });
  bulkInput?.addEventListener("input", () => {
    bulkInventoryPreview = [];
    if (bulkPreviewList) bulkPreviewList.hidden = true;
    if (bulkStatus) {
      bulkStatus.textContent = "Dəyişiklik var. Saxlamadan əvvəl uyğunluğu yenidən yoxla.";
      bulkStatus.dataset.type = "warning";
    }
  });
  const runBulkInventory = async (action, button) => {
    if (cloudUser?.role !== "supplier" || !window.ConstEraAPI?.importInventory) {
      if (bulkStatus) {
        bulkStatus.textContent = "Toplu yeniləmə üçün təchizatçı hesabına daxil ol.";
        bulkStatus.dataset.type = "warning";
      }
      return;
    }
    button.disabled = true;
    if (bulkStatus) bulkStatus.textContent = action === "validate" ? "CSV/JSON serverdə yoxlanılır..." : "Məhsullar Neon bazasında yenilənir...";
    try {
      const result = await window.ConstEraAPI.importInventory(
        bulkInput?.value || "",
        action,
        "",
        bulkFormat?.value || "auto"
      );
      if (action === "validate") {
        bulkInventoryPreview = result.data.preview || [];
        renderBulkInventoryPreview();
        if (bulkStatus) {
          bulkStatus.textContent = result.data.errors
            ? `${result.data.valid} sətir hazırdır, ${result.data.errors} sətirdə səhv var.`
            : `${result.data.valid} sətir saxlanmağa hazırdır.`;
          bulkStatus.dataset.type = result.data.errors ? "error" : "success";
        }
      } else {
        inventoryState = result.data;
        cloudProducts = inventoryState.products || [];
        inventoryDrafts.clear();
        inventoryDirty.clear();
        renderRows();
        await refreshSupplierOffers();
        if (bulkStatus) {
          bulkStatus.textContent = `${result.data.bulk?.valid || 0} məhsul Neon bazasında saxlandı.`;
          bulkStatus.dataset.type = "success";
        }
      }
    } catch (error) {
      bulkInventoryPreview = error.details?.preview || [];
      if (bulkInventoryPreview.length) renderBulkInventoryPreview();
      if (bulkStatus) {
        bulkStatus.textContent = error.message || "Toplu inventar yenilənmədi.";
        bulkStatus.dataset.type = "error";
      }
    } finally {
      button.disabled = false;
    }
  };
  bulkPreviewButton?.addEventListener("click", () => runBulkInventory("validate", bulkPreviewButton));
  bulkApplyButton?.addEventListener("click", () => runBulkInventory("commit", bulkApplyButton));

  const collectInventoryUpdate = (id) => {
    const product = getSupplierProducts().find((item) => item.id === id);
    if (!product) return null;
    const draft = inventoryDrafts.get(id) || {};
    return {
      id,
      priceAmount: draft.priceAmount ?? product.priceAmount ?? "",
      priceCurrency: product.priceCurrency || "AZN",
      priceStatus: draft.priceStatus ?? product.priceStatus ?? "request",
      stockQuantity: draft.stockQuantity ?? product.stockQuantity ?? "",
      minimumOrder: draft.minimumOrder ?? product.minimumOrder ?? "",
      sourceUrl: draft.sourceUrl ?? product.sourceUrl ?? "",
      priceNote: "Təchizatçı inventar mərkəzindən yenilənib"
    };
  };

  const saveInventoryUpdates = async (ids) => {
    if (cloudUser?.role !== "supplier" || !window.ConstEraAPI?.updateInventory) {
      setInventoryStatus("Canlı yeniləmə üçün təchizatçı hesabına daxil ol.", "warning");
      return;
    }
    const updates = ids.map(collectInventoryUpdate).filter(Boolean);
    if (!updates.length) {
      setInventoryStatus("Saxlanacaq dəyişiklik yoxdur.");
      return;
    }
    if (inventorySaveAll) inventorySaveAll.disabled = true;
    rows?.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    setInventoryStatus(`${updates.length} məhsul yenilənir...`);
    try {
      const result = await window.ConstEraAPI.updateInventory(updates);
      inventoryState = result.data;
      cloudProducts = inventoryState.products || [];
      updates.forEach((item) => {
        inventoryDrafts.delete(item.id);
        inventoryDirty.delete(item.id);
      });
      renderRows();
      await refreshSupplierOffers();
      setInventoryStatus(`${updates.length} məhsulun qiymət və stok məlumatı Neon bazasında saxlandı.`, "success");
    } catch (error) {
      setInventoryStatus(error.message || "İnventar yenilənmədi.", "error");
      renderRows();
    } finally {
      if (inventorySaveAll) inventorySaveAll.disabled = false;
    }
  };

  const renderPriceHistory = (id) => {
    const product = getSupplierProducts().find((item) => item.id === id);
    if (!product || !historyPanel || !historyList) return;
    historyPanel.hidden = false;
    if (historyTitle) historyTitle.textContent = `${product.name} · ${product.sku}`;
    historyList.innerHTML = (product.priceHistory || []).length ? product.priceHistory.map((entry) => `
      <article class="price-history-item">
        <strong>${entry.amount === null ? escapeHtml(entry.price) : formatMoney(entry.amount, entry.currency || "AZN")}</strong>
        <span>${new Date(entry.capturedAt).toLocaleString("az-AZ")}</span>
      </article>
    `).join("") : '<article class="cabinet-item"><strong>Tarixçə boşdur.</strong><span>İlk təsdiqli qiymət yeniləməsindən sonra burada görünəcək.</span></article>';
    historyPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  rows?.addEventListener("input", (event) => {
    const input = event.target.closest("[data-inventory-field]");
    const row = input?.closest("[data-inventory-row]");
    if (!input || !row) return;
    const id = row.dataset.inventoryRow;
    inventoryDrafts.set(id, { ...(inventoryDrafts.get(id) || {}), [input.dataset.inventoryField]: input.value });
    inventoryDirty.add(id);
    row.classList.add("is-dirty");
    setInventoryStatus(`${inventoryDirty.size} məhsulda saxlanmamış dəyişiklik var.`, "warning");
  });
  rows?.addEventListener("change", (event) => {
    if (event.target.matches("[data-inventory-field]")) event.target.dispatchEvent(new Event("input", { bubbles: true }));
  });
  rows?.addEventListener("click", (event) => {
    const saveButton = event.target.closest("[data-inventory-save]");
    if (saveButton) {
      saveInventoryUpdates([saveButton.dataset.inventorySave]);
      return;
    }
    const historyButton = event.target.closest("[data-inventory-history-open]");
    if (historyButton) renderPriceHistory(historyButton.dataset.inventoryHistoryOpen);
  });
  inventorySearch?.addEventListener("input", renderRows);
  inventoryFilter?.addEventListener("change", renderRows);
  inventorySaveAll?.addEventListener("click", () => saveInventoryUpdates([...inventoryDirty]));
  historyClose?.addEventListener("click", () => { if (historyPanel) historyPanel.hidden = true; });
  offerSearch?.addEventListener("input", renderOfferRows);
  offerFilter?.addEventListener("change", renderOfferRows);
  offerRows?.addEventListener("input", (event) => {
    const row = event.target.closest("[data-supplier-offer-row]");
    if (row && event.target.matches("[data-supplier-offer-field]")) row.classList.add("is-dirty");
  });
  offerRows?.addEventListener("change", (event) => {
    if (event.target.matches("[data-supplier-offer-field]")) {
      event.target.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  offerRows?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-supplier-offer-save]");
    if (!button || !window.ConstEraAPI?.saveProductOffer) return;
    const row = button.closest("[data-supplier-offer-row]");
    const offer = supplierOffers.find((item) => item.id === button.dataset.supplierOfferSave);
    if (!row || !offer) return;
    const value = (field) => row.querySelector(`[data-supplier-offer-field="${field}"]`)?.value ?? "";
    const unitPrice = value("unitPrice");
    const priceStatus = value("priceStatus");
    button.disabled = true;
    if (offerStatus) {
      offerStatus.textContent = `${offer.productName} təklifi saxlanır...`;
      offerStatus.dataset.type = "info";
    }
    try {
      const result = await window.ConstEraAPI.saveProductOffer({
        id: offer.id,
        unitPrice,
        price: priceStatus === "confirmed" && unitPrice !== ""
          ? `${Number(unitPrice).toFixed(2)} ${offer.currency || "AZN"}`
          : "Sorğu əsasında",
        priceStatus,
        stockQuantity: value("stockQuantity"),
        minimumOrder: value("minimumOrder"),
        leadTimeDays: value("leadTimeDays"),
        sourceUrl: value("sourceUrl")
      }, true);
      await Promise.all([refreshSupplierOffers(), refreshCloudProducts()]);
      if (offerStatus) {
        offerStatus.textContent = result.data.priceStatus === "confirmed"
          ? `${offer.productName} təklifi yeniləndi.`
          : `${offer.productName} sorğu qiyməti ilə saxlandı.`;
        offerStatus.dataset.type = result.data.priceStatus === "confirmed" ? "success" : "warning";
      }
    } catch (error) {
      if (offerStatus) {
        offerStatus.textContent = error.message || "Təklif yenilənmədi.";
        offerStatus.dataset.type = "error";
      }
      button.disabled = false;
    }
  });
  orderRows?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-fulfillment-update]");
    if (!button || !window.ConstEraAPI?.updateFulfillment) return;
    const nextStatus = button.dataset.fulfillmentNext;
    const id = button.dataset.fulfillmentUpdate;
    const payload = { status: nextStatus };
    if (nextStatus === "shipped") {
      const provider = window.prompt("Çatdırılma şirkəti", "Təchizatçı çatdırılması");
      if (provider === null) return;
      const trackingCode = window.prompt("İzləmə kodu (varsa)", "");
      if (trackingCode === null) return;
      payload.deliveryProvider = provider;
      payload.trackingCode = trackingCode;
    }
    if (nextStatus === "cancelled" && !window.confirm("Bu təchizatçı icrasını ləğv etmək istəyirsən?")) return;
    button.disabled = true;
    setStatus("Sifariş icrası yenilənir...");
    try {
      await window.ConstEraAPI.updateFulfillment(id, payload);
      await refreshSupplierOrders();
      setStatus("Sifariş icra mərhələsi yeniləndi.");
    } catch (error) {
      setStatus(error.message || "Sifariş icrası yenilənmədi.");
    } finally {
      button.disabled = false;
    }
  });
  connectSupplierAccount();
};

const initPriceImportCenter = () => {
  const sourceSelect = document.querySelector("[data-price-import-source]");
  const statusSelect = document.querySelector("[data-price-import-status-select]");
  const input = document.querySelector("[data-price-import-input]");
  const importButton = document.querySelector("[data-price-import-run]");
  const previewButton = document.querySelector("[data-price-import-preview-button]");
  const templateButton = document.querySelector("[data-price-import-template]");
  const exportTemplateButton = document.querySelector("[data-price-import-export-template]");
  const previewBody = document.querySelector("[data-price-import-preview]");
  const previewCount = document.querySelector("[data-price-preview-count]");
  const stats = document.querySelector("[data-price-quality-stats]");
  const qualityList = document.querySelector("[data-price-quality-list]");
  const status = document.querySelector("[data-price-import-status]");

  if (!input || !previewBody) return;

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  const parseProducts = () => {
    const source = sourceSelect?.value || "Ümumi təchizatçı";
    const forcedStatus = statusSelect?.value || "confirmed";
    return parseCsvRows(input.value)
      .map((row, index) => {
        const product = productFromCsvRow(row, index);
        const priceIsPresent = product.price && !normalize(product.price).includes("sorğu");
        const hasSource = Boolean(product.sourceUrl);
        const priceStatus = forcedStatus === "confirmed" && priceIsPresent && hasSource ? "confirmed" : "request";
        return ensureAdminProductShape({
          ...product,
          supplier: product.supplier || source,
          sourceLabel: product.sourceLabel || source,
          price: product.price || "Sorğu əsasında",
          priceStatus,
          priceNote: priceStatus === "confirmed"
            ? "Qiymət siyahısı mənbəsi ilə təsdiqlənib"
            : "Qiymət mənbə ilə təsdiqlənməyib, sorğu əsasında saxlanıldı"
        }, index);
      })
      .filter((product) => product.name && product.sku);
  };

  const renderQuality = () => {
    const quality = getDataQualitySnapshot();
    if (stats) {
      stats.innerHTML = `
        <article class="stat-card"><span class="stat-value">${quality.total}</span><p>məhsul</p></article>
        <article class="stat-card"><span class="stat-value">${quality.confirmedPrices}</span><p>təsdiqli qiymət</p></article>
        <article class="stat-card"><span class="stat-value">${quality.withImages}</span><p>foto linki</p></article>
        <article class="stat-card"><span class="stat-value">${quality.localChanges}</span><p>idxal düzəlişi</p></article>
      `;
    }
    if (qualityList) {
      const items = [
        ["Təsdiqli qiymətlər", quality.pricePercent, `${quality.confirmedPrices} məhsulda qiymət “Sorğu əsasında” deyil`],
        ["Foto linkləri", quality.imagePercent, `${quality.withImages} məhsulda foto URL var`],
        ["Mənbə linkləri", quality.sourcePercent, `${quality.withSources} məhsulda mənbə URL var`],
        ["Texniki xüsusiyyətlər", quality.specPercent, `${quality.withSpecs} məhsulda ən azı 2 xüsusiyyət var`]
      ];
      qualityList.innerHTML = items.map(([label, percent, detail]) => `
        <article class="quality-item">
          <header>
            <strong>${escapeHtml(label)}</strong>
            <span class="mini-badge">${escapeHtml(percent)}%</span>
          </header>
          <div class="quality-meter"><i style="width: ${Math.max(4, Math.min(percent, 100))}%"></i></div>
          <span>${escapeHtml(detail)}</span>
        </article>
      `).join("");
    }
  };

  const renderPreview = () => {
    const products = parseProducts();
    if (previewCount) previewCount.textContent = `${products.length} sətir`;
    previewBody.innerHTML = products.length ? products.slice(0, 120).map((product) => `
      <tr>
        <td>
          <strong>${escapeHtml(product.name)}</strong>
          <small>${escapeHtml(product.sku)} · ${escapeHtml(product.package)}</small>
        </td>
        <td>${escapeHtml(product.brand)}</td>
        <td>
          <strong>${escapeHtml(getCategory(product.category)?.title || product.category)}</strong>
          <small>${escapeHtml(product.subcategory)}</small>
        </td>
        <td>
          <strong>${escapeHtml(product.price)}</strong>
          <small>${product.priceStatus === "confirmed" ? "təsdiqli" : "sorğu əsasında"}</small>
        </td>
        <td>${product.imageUrl ? "var" : "yoxdur"}</td>
        <td>${product.sourceUrl ? "var" : "yoxdur"}</td>
      </tr>
    `).join("") : `
      <tr>
        <td colspan="6">
          <strong>Ön baxış boşdur.</strong>
          <small>CSV mətni daxil et və “Ön baxış” düyməsinə bas.</small>
        </td>
      </tr>
    `;
    setStatus(products.length
      ? `${products.length} məhsul oxundu. Mənbəsi olmayan real qiymətlər sorğu statusuna keçirilir.`
      : "CSV sətiri tapılmadı.");
  };

  renderQuality();
  renderPreview();

  templateButton?.addEventListener("click", () => {
    input.value = [
      "sku,ad,brend,kateqoriya,subkateqoriya,qablaşdırma,qiymət,təchizatçı,mövcudluq,foto url,mənbə url,xüsusiyyətlər",
      "ZNK-SILAN-15L,Zink Zinksilan İnterior 15 L,Zink,Boya və örtüklər,Daxili boya,15 L,74.40 AZN,Zink,Stok sorğu ilə,,https://www.knarrpaints.com/,daxili boya; silikonlu; 15 L",
      "KAP-ASTAR-30KG,Kəpəz astar suvağı 30 kg,Kəpəz,Quru qarışıqlar,Astar suvağı,30 kg,5.30 AZN,Kəpəz / Nur / Kars,Stok sorğu ilə,,https://www.epo.com.az/,astar suvağı; 30 kg"
    ].join("\n");
    renderPreview();
  });

  previewButton?.addEventListener("click", renderPreview);
  input.addEventListener("input", () => {
    if ((input.value || "").length < 4) renderPreview();
  });

  importButton?.addEventListener("click", () => {
    const products = parseProducts();
    if (!products.length) {
      setStatus("İdxal üçün uyğun məhsul tapılmadı.");
      return;
    }
    upsertAdminProducts(products);
    renderQuality();
    renderPreview();
    setStatus(`${products.length} məhsul qiymət idxalı mərkəzindən kataloqa yazıldı.`);
  });

  exportTemplateButton?.addEventListener("click", () => {
    const template = "sku,ad,brend,kateqoriya,subkateqoriya,qablaşdırma,qiymət,qiymət statusu,təchizatçı,mövcudluq,foto url,mənbə url,xüsusiyyətlər\n";
    downloadTextFile("constera-price-import-template.csv", template, "text/csv;charset=utf-8");
  });
};

const initCustomerCabinet = () => {
  const stats = document.querySelector("[data-customer-stats]");
  const sessionStatus = document.querySelector("[data-customer-session]");
  const projectForm = document.querySelector("[data-customer-project-form]");
  const projectStatus = document.querySelector("[data-customer-project-status]");
  const projectCount = document.querySelector("[data-customer-project-count]");
  const projectList = document.querySelector("[data-customer-projects]");
  const orderList = document.querySelector("[data-customer-orders]");
  const rfqList = document.querySelector("[data-customer-rfqs]");
  const estimateList = document.querySelector("[data-customer-estimates]");
  const procurementPlanList = document.querySelector("[data-customer-procurement-plans]");
  const favoriteGrid = document.querySelector("[data-customer-favorites]");
  const compareGrid = document.querySelector("[data-customer-compare]");
  const notificationList = document.querySelector("[data-customer-notifications]");
  const exportRfqsButton = document.querySelector("[data-customer-export-rfqs]");
  const exportEstimatesButton = document.querySelector("[data-customer-export-estimates]");
  const printButton = document.querySelector("[data-customer-print]");

  if (!stats || !projectForm || !projectList || !orderList || !rfqList || !estimateList || !procurementPlanList || !favoriteGrid || !compareGrid) return;

  const empty = (title, text) => `
    <article class="cabinet-item">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </article>
  `;
  const localState = () => {
    const productsById = new Map((marketplace.products || []).map((product) => [product.id, product]));
    return {
      user: null,
      cloud: false,
      orders: [],
      rfqs: storage.read("constera-rfq-drafts"),
      projects: storage.read("constera-customer-projects"),
      estimates: storage.read("constera-ai-estimates").map((payload) => ({
        id: payload.id,
        title: payload.projectLabel || "Smeta",
        payload,
        workflowStatus: payload.workflowStatus || (payload.rfqId ? "converted" : payload.aiProvider ? "review_pending" : "draft"),
        sourceType: payload.sourceType || "calculator",
        sourceFileName: payload.sourceFileName || "",
        rfqId: payload.rfqId || null,
        createdAt: payload.createdAt,
        updatedAt: payload.createdAt
      })),
      procurementPlans: [],
      saved: {
        favorites: storage.read("constera-favorites").map((id) => productsById.get(id)).filter(Boolean),
        compare: storage.read("constera-compare").map((id) => productsById.get(id)).filter(Boolean)
      },
      notifications: []
    };
  };
  let state = localState();

  const projectStatusLabels = {
    planning: "Planlama",
    estimating: "Smeta hazırlanır",
    procurement: "Satınalma",
    active: "İcradadır",
    completed: "Tamamlanıb",
    archived: "Arxiv"
  };
  const orderStatusLabels = {
    submitted: "Göndərilib",
    confirmed: "Təsdiqlənib",
    processing: "Hazırlanır",
    shipped: "Çatdırılır",
    completed: "Tamamlanıb",
    cancelled: "Ləğv edilib"
  };
  const estimateWorkflowLabels = {
    draft: "Redaktə edilir",
    review_pending: "Təsdiq gözləyir",
    approved: "Təsdiqlənib",
    rejected: "Rədd edilib",
    converted: "RFQ yaradılıb"
  };
  const procurementPlanStatusLabels = {
    draft: "Redaktə edilir",
    review_pending: "Təsdiq gözləyir",
    approved: "Təsdiqlənib",
    rejected: "Rədd edilib",
    activated: "RFQ-lər yaradılıb"
  };
  const renderProductMiniCards = (products, emptyTitle) => products.length ? products.map((product) => `
    <article class="cabinet-product-card">
      <header>
        <strong>${escapeHtml(product.name)}</strong>
        <span class="mini-badge">${escapeHtml(product.brand || "Brend")}</span>
      </header>
      <span>${escapeHtml(getCategory(product.category)?.title || product.category)} · ${escapeHtml(product.subcategory || "Subkateqoriya")}</span>
      <footer>
        <strong>${escapeHtml(product.price || "Sorğu əsasında")}</strong>
        <a class="source-link" href="product-detail.html?product=${encodeURIComponent(product.id)}">Detallı bax</a>
      </footer>
    </article>
  `).join("") : empty(emptyTitle, "Kataloqdan məhsul seç və bu blok avtomatik dolacaq.");

  const applyCabinetData = (data) => {
    state = { ...data, cloud: true };
    render();
  };

  const render = () => {
    const cart = getCart();
    const favorites = state.saved?.favorites || [];
    const compare = state.saved?.compare || [];
    stats.innerHTML = `
      <article class="stat-card"><span class="stat-value">${state.projects.length}</span><p>layihə</p></article>
      <article class="stat-card"><span class="stat-value">${state.orders.length}</span><p>sifariş</p></article>
      <article class="stat-card"><span class="stat-value">${state.rfqs.length}</span><p>sorğu</p></article>
      <article class="stat-card"><span class="stat-value">${state.estimates.length}</span><p>smeta</p></article>
      <article class="stat-card"><span class="stat-value">${(state.procurementPlans || []).length}</span><p>satınalma planı</p></article>
      <article class="stat-card"><span class="stat-value">${favorites.length + compare.length}</span><p>saxlanmış məhsul</p></article>
      <article class="stat-card"><span class="stat-value">${cart.length}</span><p>səbət mövqeyi</p></article>
    `;
    if (sessionStatus) {
      sessionStatus.innerHTML = state.user
        ? `${escapeHtml(state.user.name)} · ${escapeHtml(state.user.companyName || state.user.email)} · <strong>Neon sinxronizasiyası aktivdir</strong>`
        : 'Lokal baxış aktivdir. Cihazlararası sinxronizasiya üçün <a class="source-link" href="login.html?next=customer-cabinet.html">hesaba daxil ol</a>.';
      sessionStatus.dataset.type = state.user ? "success" : "warning";
    }
    if (projectCount) projectCount.textContent = `${state.projects.length} layihə`;
    projectList.innerHTML = state.projects.length ? state.projects.map((project) => `
      <article class="cabinet-item">
        <header><strong>${escapeHtml(project.title)}</strong><span class="mini-badge">${escapeHtml(projectStatusLabels[project.status] || project.status)}</span></header>
        <p>${escapeHtml(project.city || "Məkan qeyd edilməyib")} · ${project.area === null || project.area === "" ? "Sahə açıq" : `${escapeHtml(project.area)} m²`} · ${project.budget === null || project.budget === "" ? "Büdcə açıq" : formatMoney(project.budget, project.currency || "AZN")} · ${escapeHtml(project.itemCount || 0)} mövqe</p>
        <span>${escapeHtml(project.note || "Əlavə qeyd yoxdur.")}</span>
        <div class="cabinet-item-actions">
          <a class="table-action" href="project-planner.html?project=${encodeURIComponent(project.id)}">Layihə mərkəzi</a>
          <a class="table-action" href="rfq.html?project=${encodeURIComponent(project.id)}">Sorğu yarat</a>
          <button class="table-action is-danger" type="button" data-customer-project-delete="${escapeAttr(project.id)}">Sil</button>
        </div>
      </article>
    `).join("") : empty("Layihə yoxdur.", "İlk layihəni formadan yarat və satınalma axınını bir yerdə saxla.");
    orderList.innerHTML = state.orders.length ? state.orders.slice(0, 20).map((order) => `
      <article class="cabinet-item">
        <header><strong>Sifariş #${escapeHtml(order.orderNumber)}</strong><span class="mini-badge">${escapeHtml(orderStatusLabels[order.status] || order.status)}</span></header>
        <p>${(order.items || []).length} məhsul · ${order.totalAmount === null ? "Qiymət təsdiqi gözlənilir" : formatMoney(order.totalAmount, order.currency)}</p>
        <span>${new Date(order.createdAt).toLocaleString("az-AZ")}</span>
        <div class="cabinet-item-actions"><a class="table-action" href="order-detail.html?order=${encodeURIComponent(order.id)}">Tarixçə və sənəd</a></div>
      </article>
    `).join("") : empty("Sifariş yoxdur.", "Kataloqdan məhsulları səbətə əlavə et və ilk sifarişi göndər.");
    rfqList.innerHTML = state.rfqs.length ? state.rfqs.slice(0, 20).map((rfq) => {
      const offers = rfq.offers || [];
      const pricedOffers = offers.filter((offer) => offer.priceAmount !== null && Number.isFinite(Number(offer.priceAmount)));
      const lowest = pricedOffers.length ? Math.min(...pricedOffers.map((offer) => Number(offer.priceAmount))) : null;
      const convertedOrder = offers.find((offer) => offer.orderId);
      const quantity = rfq.quantity || rfq.items?.[0]?.quantity || "Miqdar yoxdur";
      return `
      <article class="cabinet-item">
        <header><strong>${escapeHtml(rfq.title || rfq.product || "Qiymət sorğusu")}</strong><span class="mini-badge">${escapeHtml(rfq.status || "Yeni")}</span></header>
        <p>${escapeHtml(quantity)} · ${escapeHtml(rfq.city || "Şəhər seçilməyib")} · ${offers.length} təklif</p>
        <span>${lowest === null ? escapeHtml(rfq.budget || "Büdcə açıq") : `Ən aşağı təklif: ${formatMoney(lowest)}`}</span>
        ${convertedOrder ? `<div class="cabinet-item-actions"><a class="table-action" href="order-detail.html?order=${encodeURIComponent(convertedOrder.orderId)}">Sifariş #${escapeHtml(convertedOrder.orderNumber || "")} və proforma</a></div>` : ""}
      </article>`;
    }).join("") : empty("Qiymət sorğusu yoxdur.", "Kataloqdan və ya ağıllı smetadan ilk qiymət sorğunu yarat.");
    estimateList.innerHTML = state.estimates.length ? state.estimates.slice(0, 20).map((entry) => {
      const estimate = entry.payload || entry;
      const workflowStatus = entry.workflowStatus || estimate.workflowStatus || (entry.rfqId || estimate.rfqId ? "converted" : "draft");
      const rfqId = entry.rfqId || estimate.rfqId || "";
      return `
      <article class="cabinet-item">
        <header><strong>${escapeHtml(entry.title || estimate.projectLabel || "Smeta")} · ${escapeHtml(estimate.area || 0)} m²</strong><span class="mini-badge">${escapeHtml(estimateWorkflowLabels[workflowStatus] || workflowStatus)}</span></header>
        <p>${escapeHtml(estimate.rows?.filter((row) => row.included !== false).length || 0)} seçilmiş mövqe · ${escapeHtml(entry.sourceFileName || estimate.sourceFileName || estimate.scopeLabel || "Parametrlərdən hesablanıb")}</p>
        <span>${entry.updatedAt || estimate.createdAt ? new Date(entry.updatedAt || estimate.createdAt).toLocaleString("az-AZ") : "Tarix yoxdur"}</span>
        <div class="cabinet-item-actions">
          ${rfqId ? `<a class="table-action" href="rfq-dashboard.html?rfq=${encodeURIComponent(rfqId)}">RFQ-ni aç</a>` : `<a class="table-action" href="ai-smeta.html">Smetanı aç</a>`}
        </div>
      </article>`;
    }).join("") : empty("Smeta yoxdur.", "Ağıllı smeta modulunda ilk hesablamanı hazırla.");
    procurementPlanList.innerHTML = (state.procurementPlans || []).length ? state.procurementPlans.slice(0, 20).map((plan) => {
      const waves = Array.isArray(plan.waves) ? plan.waves.filter((wave) => wave.included !== false) : [];
      const rfqCount = waves.filter((wave) => wave.rfqId).length;
      return `
        <article class="cabinet-item">
          <header><strong>${escapeHtml(plan.title || "Satınalma planı")}</strong><span class="mini-badge">${escapeHtml(procurementPlanStatusLabels[plan.status] || plan.status)}</span></header>
          <p>${escapeHtml(waves.length)} dalğa · ${escapeHtml(rfqCount)} RFQ · ${formatMoney(plan.totalBudget, plan.currency || "AZN")}</p>
          <span>${escapeHtml(plan.projectStartDate || "Tarix açıqdır")} – ${escapeHtml(plan.targetEndDate || "Tarix açıqdır")} · ${escapeHtml(plan.unpricedRows || 0)} qiymətsiz mövqe</span>
          <div class="cabinet-item-actions">
            <a class="table-action" href="ai-smeta.html?estimate=${encodeURIComponent(plan.estimateId)}">Planı aç</a>
            ${rfqCount ? '<a class="table-action" href="rfq-dashboard.html">RFQ paneli</a>' : ""}
          </div>
        </article>
      `;
    }).join("") : empty("Satınalma planı yoxdur.", "Təsdiqlənmiş smetadan ilk mərhələli planı yarat.");
    favoriteGrid.innerHTML = renderProductMiniCards(favorites, "Seçilmiş məhsul yoxdur.");
    compareGrid.innerHTML = renderProductMiniCards(compare, "Müqayisə siyahısı boşdur.");
    if (notificationList) notificationList.innerHTML = state.notifications.length ? state.notifications.map((notification) => `
      <article class="cabinet-item">
        <header><strong>${escapeHtml(notification.subject)}</strong><span class="mini-badge">${escapeHtml(notification.status)}</span></header>
        <p>${escapeHtml(notification.body)}</p>
        <span>${new Date(notification.createdAt).toLocaleString("az-AZ")}</span>
      </article>
    `).join("") : empty("Yeni bildiriş yoxdur.", "Sifariş və sorğu statusları dəyişdikdə burada görünəcək.");
  };

  exportRfqsButton?.addEventListener("click", () => {
    const rfqs = state.rfqs;
    const headers = ["id", "status", "sorğu", "miqdar", "şirkət", "əlaqə", "şəhər", "büdcə", "qeyd"];
    const csv = [headers.join(","), ...rfqs.map((rfq) => [
      rfq.id,
      rfq.status,
      rfq.title || rfq.product,
      rfq.quantity || rfq.items?.[0]?.quantity,
      rfq.companyName || rfq.company,
      rfq.contact,
      rfq.city,
      rfq.budget,
      rfq.note
    ].map(escapeCsvValue).join(","))].join("\n");
    downloadTextFile(`constera-kabinet-rfq-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
  });

  exportEstimatesButton?.addEventListener("click", () => {
    const headers = ["id", "layihə", "sahə", "mərtəbə", "otaq", "yaş zona", "iş həcmi", "səviyyə", "material qrupu", "seçilmiş mövqe", "vəziyyət", "mənbə", "rfq", "tarix"];
    const csv = [headers.join(","), ...state.estimates.map((entry) => {
      const estimate = entry.payload || entry;
      return [
      estimate.id,
      estimate.projectLabel,
      estimate.area,
      estimate.floors,
      estimate.rooms,
      estimate.wetZones,
      estimate.scopeLabel,
      estimate.finishLabel,
      estimate.rows?.length || 0,
      estimate.rows?.filter((row) => row.included !== false).length || 0,
      entry.workflowStatus || estimate.workflowStatus || "draft",
      entry.sourceFileName || estimate.sourceFileName || entry.sourceType || estimate.sourceType,
      entry.rfqId || estimate.rfqId,
      estimate.createdAt
      ].map(escapeCsvValue).join(",");
    })].join("\n");
    downloadTextFile(`constera-kabinet-smeta-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
  });

  projectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(projectForm).entries());
    if (!state.user || !window.ConstEraAPI?.saveProject) {
      const project = { id: `project-${Date.now()}`, ...fields, currency: "AZN", createdAt: new Date().toISOString() };
      storage.write("constera-customer-projects", [project, ...state.projects].slice(0, 100));
      state = localState();
      render();
      if (projectStatus) projectStatus.textContent = "Layihə lokal saxlandı. Bulud sinxronizasiyası üçün hesaba daxil ol.";
      projectForm.reset();
      return;
    }
    const button = projectForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await window.ConstEraAPI.saveProject({ ...fields, currency: "AZN" });
      applyCabinetData(result.data);
      projectForm.reset();
      if (projectStatus) projectStatus.textContent = "Layihə Neon bazasında saxlandı.";
    } catch (error) {
      if (projectStatus) projectStatus.textContent = error.message || "Layihə saxlanmadı.";
    } finally {
      button.disabled = false;
    }
  });
  projectList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-customer-project-delete]");
    if (!button) return;
    const id = button.dataset.customerProjectDelete;
    if (state.user && window.ConstEraAPI?.deleteProject) {
      button.disabled = true;
      try {
        const result = await window.ConstEraAPI.deleteProject(id);
        applyCabinetData(result.data);
        if (projectStatus) projectStatus.textContent = "Layihə silindi.";
      } catch (error) {
        button.disabled = false;
        if (projectStatus) projectStatus.textContent = error.message || "Layihə silinmədi.";
      }
      return;
    }
    storage.write("constera-customer-projects", state.projects.filter((project) => project.id !== id));
    state = localState();
    render();
  });
  printButton?.addEventListener("click", () => window.print());
  render();

  const connectCabinet = async () => {
    if (!window.ConstEraAPI?.cabinet) return;
    try {
      const session = await window.ConstEraAPI.session();
      if (!session.user) return;
      let result = await window.ConstEraAPI.cabinet();
      const cloud = result.data;
      const localFavorites = storage.read("constera-favorites");
      const localCompare = storage.read("constera-compare");
      const mergedFavorites = [...new Set([...(cloud.saved?.favorites || []).map((product) => product.id), ...localFavorites])].slice(0, 100);
      const mergedCompare = [...new Set([...(cloud.saved?.compare || []).map((product) => product.id), ...localCompare])].slice(0, 5);
      const cloudEstimateIds = new Set((cloud.estimates || []).map((estimate) => estimate.id));
      const missingEstimates = storage.read("constera-ai-estimates")
        .filter((estimate) => estimate.id && !cloudEstimateIds.has(estimate.id))
        .slice(0, 20)
        .map((estimate) => ({ id: estimate.id, title: estimate.projectLabel || "Smeta", payload: estimate }));
      const favoriteChanged = mergedFavorites.length !== (cloud.saved?.favorites || []).length;
      const compareChanged = mergedCompare.length !== (cloud.saved?.compare || []).length;
      if (favoriteChanged || compareChanged || missingEstimates.length) {
        await Promise.all([
          favoriteChanged ? window.ConstEraAPI.syncSavedProducts("favorite", mergedFavorites) : Promise.resolve(),
          compareChanged ? window.ConstEraAPI.syncSavedProducts("compare", mergedCompare) : Promise.resolve(),
          missingEstimates.length ? window.ConstEraAPI.syncEstimates(missingEstimates) : Promise.resolve()
        ]);
        result = await window.ConstEraAPI.cabinet();
      }
      applyCabinetData(result.data);
      if (projectStatus) projectStatus.textContent = "Layihələr Neon bazasında saxlanılır.";
    } catch (error) {
      if (sessionStatus) {
        sessionStatus.textContent = `Canlı kabinet yüklənmədi: ${error.message}`;
        sessionStatus.dataset.type = "error";
      }
    }
  };
  connectCabinet();
};

const formatMoney = (value, currency = "AZN") => Number(value || 0).toLocaleString("az-AZ", {
  style: "currency",
  currency,
  minimumFractionDigits: 2
});

const initCartDock = () => {
  const page = document.body.dataset.page;
  if (!["catalog", "category", "subcategory", "product-detail", "customer-cabinet"].includes(page)) return;
  const dock = document.createElement("a");
  dock.className = "cart-dock";
  dock.href = "checkout.html";
  dock.setAttribute("aria-label", "Səbəti aç");
  dock.innerHTML = '<span>Səbət</span><strong data-cart-count>0</strong>';
  document.body.appendChild(dock);
  updateCartIndicators();
};

const renderCheckout = () => {
  const itemsContainer = document.querySelector("[data-checkout-items]");
  const emptyState = document.querySelector("[data-checkout-empty]");
  const summary = document.querySelector("[data-checkout-summary]");
  const count = document.querySelector("[data-checkout-count]");
  const clearButton = document.querySelector("[data-checkout-clear]");
  const form = document.querySelector("[data-checkout-form]");
  const status = document.querySelector("[data-checkout-status]");
  const history = document.querySelector("[data-customer-orders]");
  const cardOption = form?.querySelector("[data-payment-card]");
  const bankOption = form?.querySelector("[data-payment-bank]");
  const approvalFields = form?.querySelector("[data-procurement-fields]");
  if (!itemsContainer || !summary || !form) return;
  if (getCart().length) {
    window.ConstEraTrack?.("checkout_start", {
      entityType: "cart",
      entityId: "current",
      eventId: `checkout.${sessionStorage.getItem("constera-session-id") || Date.now()}`,
      payload: { items: getCart().length }
    });
  }

  const productById = new Map((marketplace.products || []).map((product) => [product.id, product]));
  let latestDeliveryQuote = null;
  let deliveryQuoteTimer = 0;
  let bankTransferReady = false;
  const setStatus = (message, type = "info") => {
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
  };

  const currentItems = () => getCart()
    .map((entry) => {
      const product = productById.get(entry.id);
      const offers = Array.isArray(product?.offers) ? product.offers : [];
      const offer = offers.find((item) => item.id === entry.offerId)
        || product?.preferredOffer
        || offers[0]
        || null;
      return { ...entry, offerId: entry.offerId || offer?.id || "", product, offer };
    })
    .filter((entry) => entry.product);

  const selectedUnitPrice = ({ product, offer }) => {
    if (offer) {
      return offer.commercialReady === true
        && offer.priceStatus === "confirmed"
        && Number.isFinite(Number(offer.unitPrice))
        ? Number(offer.unitPrice)
        : null;
    }
    return product.commerceReady === true ? parseProductPriceAmount(product) : null;
  };

  const paint = () => {
    const entries = currentItems();
    if (count) count.textContent = entries.length.toLocaleString("az-AZ");
    if (emptyState) emptyState.hidden = entries.length > 0;
    itemsContainer.hidden = entries.length === 0;
    if (clearButton) clearButton.disabled = entries.length === 0;
    form.querySelector('button[type="submit"]').disabled = entries.length === 0;
    itemsContainer.innerHTML = entries.map(({ product, offer, quantity }) => {
      const amount = selectedUnitPrice({ product, offer });
      const lineTotal = amount === null ? null : amount * quantity;
      const media = createProductMedia(product, product.brand.slice(0, 2).toUpperCase());
      return `<article class="checkout-item" data-checkout-product="${escapeAttr(product.id)}">
        <div class="checkout-item-media">${media}</div>
        <div class="checkout-item-copy">
          <strong>${escapeHtml(product.name)}</strong>
          <span>${escapeHtml(product.sku)} · ${escapeHtml(product.package || "Sorğu ilə")}</span>
          <small>${escapeHtml(product.brand)} · ${escapeHtml(offer?.supplier || product.supplier || "Təchizatçı")}</small>
        </div>
        <label class="checkout-quantity"><span>Miqdar</span><input data-cart-quantity="${escapeAttr(product.id)}" type="number" min="0.001" max="1000000" step="0.001" value="${escapeAttr(quantity)}" /></label>
        <div class="checkout-item-price"><strong>${lineTotal === null ? "Sorğu əsasında" : formatMoney(lineTotal, offer?.currency || product.priceCurrency || "AZN")}</strong><small>${escapeHtml(offer?.price || product.price)}</small></div>
        <button class="table-action is-danger" type="button" data-checkout-remove="${escapeAttr(product.id)}">Sil</button>
      </article>`;
    }).join("");

    const knownLines = entries.map((entry) => {
      const amount = selectedUnitPrice(entry);
      return amount === null ? null : amount * entry.quantity;
    });
    const pendingCount = knownLines.filter((value) => value === null).length;
    const subtotal = knownLines.reduce((sum, value) => sum + (value || 0), 0);
    const deliveryAmount = Number(latestDeliveryQuote?.amount || 0);
    const total = pendingCount ? null : subtotal + deliveryAmount;
    summary.innerHTML = `
      <p class="eyebrow">Sifariş yekunu</p>
      <h2>${entries.length} məhsul mövqeyi</h2>
      <dl class="checkout-totals">
        <div><dt>Təsdiqli məbləğ</dt><dd>${formatMoney(subtotal)}</dd></div>
        <div><dt>Sorğu qiymətli mövqe</dt><dd>${pendingCount}</dd></div>
        <div><dt>Çatdırılma</dt><dd>${latestDeliveryQuote
          ? `${formatMoney(deliveryAmount, latestDeliveryQuote.currency || "AZN")} · ${latestDeliveryQuote.etaMinDays}-${latestDeliveryQuote.etaMaxDays} gün`
          : "Şəhər üzrə hesablanır"}</dd></div>
        <div><dt>Yekun</dt><dd>${total === null ? "Qiymət təsdiqi gözlənilir" : formatMoney(total)}</dd></div>
      </dl>
      <p class="checkout-summary-note">${pendingCount
        ? "Yekun hesab təchizatçı qiymətləri təsdiqləndikdən sonra hazırlanacaq."
        : "Məbləğ sifariş göndərilərkən serverdə yenidən yoxlanacaq."}</p>`;
    updateCartIndicators();
  };

  const refreshDeliveryQuote = async () => {
    const entries = currentItems();
    const city = String(form.elements.city.value || "").trim();
    if (!entries.length || !city || !window.ConstEraAPI?.deliveryQuote) {
      latestDeliveryQuote = null;
      paint();
      return;
    }
    const knownLines = entries.map((entry) => {
      const amount = selectedUnitPrice(entry);
      return amount === null ? null : amount * entry.quantity;
    });
    const pending = knownLines.some((value) => value === null);
    const supplierIds = entries
      .map((entry) => entry.offer?.supplierId || entry.product.supplierId)
      .filter(Boolean);
    try {
      const result = await window.ConstEraAPI.deliveryQuote({
        city,
        mode: form.elements.deliveryMode.value,
        subtotal: pending ? null : knownLines.reduce((sum, value) => sum + value, 0),
        itemQuantity: entries.reduce((sum, entry) => sum + entry.quantity, 0),
        supplierCount: new Set(supplierIds).size
      });
      latestDeliveryQuote = result.data;
    } catch {
      latestDeliveryQuote = null;
    }
    paint();
  };

  const scheduleDeliveryQuote = () => {
    window.clearTimeout(deliveryQuoteTimer);
    deliveryQuoteTimer = window.setTimeout(refreshDeliveryQuote, 350);
  };

  const orderStatusLabels = {
    submitted: "Göndərilib",
    confirmed: "Təsdiqlənib",
    processing: "Hazırlanır",
    shipped: "Çatdırılır",
    completed: "Tamamlanıb",
    cancelled: "Ləğv edilib"
  };

  const loadOrders = async () => {
    if (!history || !window.ConstEraAPI) return;
    try {
      const session = await window.ConstEraAPI.session();
      if (!session.user) {
        history.innerHTML = '<article class="cabinet-item"><strong>Hesaba daxil ol</strong><span>Sifariş tarixçəsi təhlükəsiz hesab sessiyasında göstərilir.</span></article>';
        return;
      }
      if (!form.elements.contactName.value) form.elements.contactName.value = session.user.name || "";
      if (!form.elements.email.value) form.elements.email.value = session.user.email || "";
      if (!form.elements.companyName.value) form.elements.companyName.value = session.user.companyName || "";
      if (approvalFields) approvalFields.hidden = session.user.role !== "customer";
      const result = await window.ConstEraAPI.orders();
      const orders = result.data || [];
      history.innerHTML = orders.length ? orders.slice(0, 20).map((order) => `
        <article class="cabinet-item">
          <header><strong>Sifariş #${escapeHtml(order.orderNumber)}</strong><span class="mini-badge">${escapeHtml(orderStatusLabels[order.status] || order.status)}</span></header>
          <p>${order.items.length} məhsul · ${order.totalAmount === null ? "Qiymət təsdiqi gözlənilir" : formatMoney(order.totalAmount, order.currency)}</p>
          <span>${new Intl.DateTimeFormat("az-AZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.createdAt))}</span>
          <div class="cabinet-item-actions"><a class="table-action" href="order-detail.html?order=${encodeURIComponent(order.id)}">Tarixçə və sənəd</a></div>
        </article>`).join("") : '<article class="cabinet-item"><strong>Sifariş yoxdur.</strong><span>İlk sifarişin burada görünəcək.</span></article>';
    } catch (error) {
      history.innerHTML = `<article class="cabinet-item"><strong>Tarixçə yüklənmədi.</strong><span>${escapeHtml(error.message || "Server xətası")}</span></article>`;
    }
  };

  const loadPaymentReadiness = async () => {
    if ((!cardOption && !bankOption) || !window.ConstEraAPI?.integrationReadiness) return;
    try {
      const result = await window.ConstEraAPI.integrationReadiness();
      const cardReady = Boolean(result.data?.readiness?.payment);
      bankTransferReady = Boolean(result.data?.readiness?.bankTransfer);
      if (cardOption) {
        cardOption.disabled = !cardReady;
        cardOption.textContent = cardReady
          ? "Kartla təhlükəsiz onlayn ödəniş"
          : "Kartla ödəniş (provayder qoşulmayıb)";
      }
      if (bankOption) {
        bankOption.disabled = !bankTransferReady;
        bankOption.textContent = bankTransferReady
          ? "Bank köçürməsi"
          : "Bank köçürməsi (rekvizitlər qurulmayıb)";
      }
      if (form.elements.paymentMethod.selectedOptions[0]?.disabled) form.elements.paymentMethod.value = "invoice";
    } catch {
      if (cardOption) cardOption.disabled = true;
      if (bankOption) bankOption.disabled = true;
      bankTransferReady = false;
    }
  };

  const hydrateCartProducts = async () => {
    if (!window.ConstEraAPI?.products) return;
    const ids = [...new Set(getCart().map((item) => item.id))];
    if (!ids.length) return;
    const result = await window.ConstEraAPI.products(ids);
    (result.data || []).forEach((product) => productById.set(product.id, product));
    paint();
    scheduleDeliveryQuote();
  };

  itemsContainer.addEventListener("change", (event) => {
    const input = event.target.closest("[data-cart-quantity]");
    if (!input) return;
    const quantity = Math.max(0.001, Math.min(Number(input.value) || 1, 1_000_000));
    saveCart(getCart().map((item) => item.id === input.dataset.cartQuantity ? { ...item, quantity } : item));
    paint();
    scheduleDeliveryQuote();
  });
  itemsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-checkout-remove]");
    if (!button) return;
    saveCart(getCart().filter((item) => item.id !== button.dataset.checkoutRemove));
    paint();
    scheduleDeliveryQuote();
  });
  clearButton?.addEventListener("click", () => {
    saveCart([]);
    latestDeliveryQuote = null;
    paint();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const entries = currentItems();
    if (!entries.length || !window.ConstEraAPI) {
      setStatus("Sifariş göndərmək üçün səbət boş olmamalıdır.", "error");
      return;
    }
    const requestedPayment = form.elements.paymentMethod.value;
    if (requestedPayment === "card" && form.elements.requiresApproval?.checked) {
      setStatus("Korporativ təsdiq axını üçün elektron hesab və ya bank köçürməsi seç.", "warning");
      return;
    }
    if (requestedPayment === "card") {
      const session = await window.ConstEraAPI.session().catch(() => ({ user: null }));
      if (!session.user) {
        setStatus("Kartla ödəniş üçün əvvəl müştəri hesabına daxil ol.", "warning");
        return;
      }
    }
    if (requestedPayment === "bank_transfer") {
      if (!bankTransferReady) {
        setStatus("Bank köçürməsi rekvizitləri hələ qurulmayıb.", "warning");
        return;
      }
      const session = await window.ConstEraAPI.session().catch(() => ({ user: null }));
      if (!session.user) {
        setStatus("Bank köçürməsi təsdiqini izləmək üçün əvvəl müştəri hesabına daxil ol.", "warning");
        return;
      }
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "Göndərilir...";
    let createdOrder = null;
    try {
      const fields = Object.fromEntries(new FormData(form).entries());
      const result = await window.ConstEraAPI.createOrder({
        ...fields,
        legalAccepted: fields.legalAccepted === "true",
        sourcePath: `${window.location.pathname}${window.location.search}`,
        requiresApproval: Boolean(form.elements.requiresApproval?.checked),
        items: entries.map((entry) => ({
          productId: entry.product.id,
          offerId: entry.offerId,
          quantity: entry.quantity,
          unit: entry.product.package || "ədəd"
        }))
      });
      createdOrder = result.data;
      window.ConstEraTrack?.("order_created", { entityType: "order", entityId: result.data.id, payload: { items: entries.length } });
      saveCart([]);
      paint();
      setStatus(`Sifariş #${result.data.orderNumber} qəbul edildi.`, "success");
      if (requestedPayment === "card") {
        setStatus(`Sifariş #${result.data.orderNumber} yaradıldı. Təhlükəsiz ödəniş səhifəsi açılır...`, "success");
        const payment = await window.ConstEraAPI.createPayment(result.data.id, `order-${result.data.id}`);
        window.location.assign(payment.data.checkoutUrl);
        return;
      }
      await loadOrders();
    } catch (error) {
      setStatus(
        createdOrder
          ? `Sifariş #${createdOrder.orderNumber} yaradıldı, lakin kart ödənişi açılmadı: ${error.message}`
          : error.message || "Sifariş göndərilmədi.",
        "error"
      );
    } finally {
      button.textContent = originalLabel;
      button.disabled = currentItems().length === 0;
    }
  });

  paint();
  form.elements.city.addEventListener("input", scheduleDeliveryQuote);
  form.elements.deliveryMode.addEventListener("change", scheduleDeliveryQuote);
  form.elements.requiresApproval?.addEventListener("change", () => {
    const details = form.querySelector("[data-procurement-details]");
    if (details) details.hidden = !form.elements.requiresApproval.checked;
  });
  hydrateCartProducts();
  loadPaymentReadiness();
  loadOrders();
};

const initProjectPlanner = () => {
  const form = document.querySelector("[data-project-planner-form]");
  const list = document.querySelector("[data-project-planner-items]");
  const empty = document.querySelector("[data-project-planner-empty]");
  const stats = document.querySelector("[data-project-planner-stats]");
  const clearButton = document.querySelector("[data-project-planner-clear]");
  const rfqLink = document.querySelector("[data-project-planner-rfq]");
  const aiLink = document.querySelector("[data-project-planner-ai]");
  const aiRfqLink = document.querySelector("[data-project-planner-ai-rfq]");
  const status = document.querySelector("[data-project-planner-status]");
  const cloudBadge = document.querySelector("[data-project-cloud-badge]");
  const cloudSave = document.querySelector("[data-project-cloud-save]");
  const loginLink = document.querySelector("[data-project-login]");
  const supplierMatches = document.querySelector("[data-project-supplier-matches]");
  const matchSuppliersButton = document.querySelector("[data-project-match-suppliers]");
  const milestoneForm = document.querySelector("[data-project-milestone-form]");
  const milestoneList = document.querySelector("[data-project-milestones]");
  const milestoneCount = document.querySelector("[data-project-milestone-count]");
  const documentForm = document.querySelector("[data-project-document-form]");
  const documentList = document.querySelector("[data-project-documents]");
  const documentCount = document.querySelector("[data-project-document-count]");
  const commerceList = document.querySelector("[data-project-commerce]");
  const commerceBadge = document.querySelector("[data-project-commerce-badge]");
  if (!form || !list || !stats) return;

  let cloudUser = null;
  let workspace = null;
  let cloudSyncTimer = 0;
  let cloudSyncActive = false;

  const setPlannerStatus = (message, type = "") => {
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
  };

  const applyProfile = () => {
    const profile = getProjectProfile();
    Object.entries(profile).forEach(([name, value]) => {
      if (form.elements[name] && value !== undefined && value !== null) form.elements[name].value = value;
    });
  };
  const saveProfile = () => {
    const profile = { ...getProjectProfile(), ...Object.fromEntries(new FormData(form).entries()) };
    storage.write(projectProfileStorageKey, profile);
    return profile;
  };
  const projectPayload = () => {
    const profile = saveProfile();
    const entries = getResolvedProjectBasket();
    const projectType = ["apartment", "villa", "office"].includes(profile.projectType) ? profile.projectType : "other";
    return {
      ...profile,
      id: profile.id || "",
      title: profile.title || `${projectType === "villa" ? "Villa" : projectType === "apartment" ? "Mənzil" : projectType === "office" ? "Ofis" : "Tikinti"} layihəsi`,
      projectType,
      status: workspace?.project?.status || "planning",
      currency: "AZN",
      items: entries.map((entry) => {
        const entity = entry.entity || {};
        const priceAmount = getProjectEntityPriceAmount(entry);
        return {
          type: entry.type,
          id: entry.id,
          title: getProjectEntityTitle(entry),
          quantity: entry.quantity,
          unit: entity.unit || entity.package || "mövqe",
          priceAmount,
          priceStatus: priceAmount === null ? "request" : "confirmed",
          currency: entity.priceCurrency || "AZN",
          sourceUrl: getSafeHttpsUrl(entity.sourceUrl),
          snapshot: {
            title: getProjectEntityTitle(entry),
            category: entity.category || "",
            subcategory: entity.subcategory || "",
            brand: entity.brand || "",
            supplier: entity.supplier || entity.providerName || "",
            supplierId: entity.supplierId || "",
            image: entity.image || entity.imageUrl || "",
            priceText: entity.price || entity.priceText || "Sorğu əsasında"
          }
        };
      })
    };
  };

  const renderWorkspace = () => {
    const projectId = workspace?.project?.id || getProjectProfile().id || "";
    const matches = workspace?.supplierMatches || [];
    if (supplierMatches) supplierMatches.innerHTML = matches.length ? matches.map((match, index) => `
      <article class="cabinet-item">
        <header><strong>${escapeHtml(`${index + 1}. ${match.supplier}`)}</strong><span class="mini-badge is-verified">${escapeHtml(Math.round(match.score))}% uyğunluq</span></header>
        <p>${escapeHtml(match.region || "Azərbaycan")} · ${escapeHtml(match.coverageCount)} uyğun əhatə · ${match.verifiedReviews ? `${escapeHtml(match.verifiedReviews)} təsdiqlənmiş rəy` : "Yeni təchizatçı"}</p>
        <span>${escapeHtml((match.reasons || []).join(" · ") || "Kataloq uyğunluğu əsasında seçilib")}${match.reviewAverage ? ` · ${escapeHtml(match.reviewAverage.toFixed(1))}/5` : ""}</span>
        <div class="cabinet-item-actions">
          <a class="table-action" href="suppliers.html?supplier=${encodeURIComponent(match.supplierId)}">Profili aç</a>
          <a class="table-action" href="rfq.html?project=${encodeURIComponent(projectId)}&supplier=${encodeURIComponent(match.supplierId)}">Bu təchizatçıdan soruş</a>
        </div>
      </article>
    `).join("") : '<article class="cabinet-item"><strong>Uyğunlaşdırma hazır deyil.</strong><span>Layihəni saxla və real kataloq əhatəsinə görə təchizatçıları seç.</span></article>';

    const milestones = workspace?.milestones || [];
    if (milestoneCount) milestoneCount.textContent = `${milestones.length} mərhələ`;
    if (milestoneList) milestoneList.innerHTML = milestones.length ? milestones.map((milestone) => `
      <article class="cabinet-item">
        <header><strong>${escapeHtml(milestone.title)}</strong><span class="mini-badge">${escapeHtml(milestone.status === "completed" ? "Tamamlanıb" : milestone.status === "in_progress" ? "İcradadır" : "Planlanıb")}</span></header>
        <p>${escapeHtml(milestone.dueDate)} · ${escapeHtml(milestone.type)}${milestone.reminderScheduled ? " · Xatırlatma aktivdir" : ""}</p>
        <span>${escapeHtml(milestone.note || "Əlavə qeyd yoxdur.")}</span>
        <div class="cabinet-item-actions"><button class="table-action is-danger" type="button" data-project-milestone-delete="${escapeAttr(milestone.id)}">Sil</button></div>
      </article>
    `).join("") : '<article class="cabinet-item"><strong>Təqvim boşdur.</strong><span>Satınalma, xidmət, icarə, çatdırılma və ödəniş tarixlərini əlavə et.</span></article>';

    const documents = workspace?.documents || [];
    if (documentCount) documentCount.textContent = `${documents.length} sənəd`;
    if (documentList) documentList.innerHTML = documents.length ? documents.map((document) => `
      <article class="cabinet-item">
        <header><strong>${escapeHtml(document.filename)}</strong><span class="mini-badge">${escapeHtml(Math.max(1, Math.round(document.sizeBytes / 1024)))} KB</span></header>
        <p>${escapeHtml(document.contentType)} · ${new Date(document.createdAt).toLocaleString("az-AZ")}</p>
        <div class="cabinet-item-actions"><a class="table-action" href="${escapeAttr(document.url)}" target="_blank" rel="noopener">Sənədi aç</a><button class="table-action is-danger" type="button" data-project-document-delete="${escapeAttr(document.id)}">Sil</button></div>
      </article>
    `).join("") : '<article class="cabinet-item"><strong>Sənəd yoxdur.</strong><span>Plan, texniki tapşırıq, müqavilə, sertifikat və aktları layihəyə bağla.</span></article>';

    const commerce = workspace?.commerce || {};
    if (commerceBadge) commerceBadge.textContent = commerce.paymentStatus
      ? `Ödəniş: ${commerce.paymentStatus}`
      : commerce.proposalStatus ? `Təklif: ${commerce.proposalStatus}` : commerce.rfqStatus || "Başlanmayıb";
    if (commerceList) commerceList.innerHTML = commerce.rfqId ? `
      <article class="cabinet-item">
        <header><strong>Qiymət sorğusu</strong><span class="mini-badge">${escapeHtml(commerce.rfqStatus || "Yeni")}</span></header>
        <p>${commerce.proposalId ? `Kommersiya təklifi ${escapeHtml(commerce.proposalNumber)}` : "Təchizatçı təklifləri gözlənilir"}</p>
        <span>${commerce.proposalTotal === null || commerce.proposalTotal === undefined ? "Məbləğ hələ təsdiqlənməyib" : formatMoney(commerce.proposalTotal, commerce.proposalCurrency || "AZN")}</span>
        <div class="cabinet-item-actions">
          <a class="table-action" href="rfq-dashboard.html?rfq=${encodeURIComponent(commerce.rfqId)}">RFQ-ni aç</a>
          ${commerce.proposalId ? `<a class="table-action" href="proposal-detail.html?proposal=${encodeURIComponent(commerce.proposalId)}">Təklif və PDF</a>` : ""}
          ${commerce.orderId ? `<a class="table-action" href="order-detail.html?order=${encodeURIComponent(commerce.orderId)}">Sifariş #${escapeHtml(commerce.orderNumber)}</a>` : ""}
        </div>
      </article>
    ` : `<article class="cabinet-item"><strong>Qiymət sorğusu yaradılmayıb.</strong><span>${getProjectBasketCount()} mövqeni vahid RFQ-yə çevir, sonra çoxmövqeli kommersiya təklifi, ƏDV, logistika və ödəniş vəziyyətini buradan izlə.</span><div class="cabinet-item-actions"><a class="table-action" href="rfq.html?project=${encodeURIComponent(projectId || "1")}">RFQ yarat</a></div></article>`;
  };

  const applyWorkspace = (data) => {
    workspace = data || null;
    if (!workspace?.project) return;
    const currentProfile = getProjectProfile();
    const profile = { ...currentProfile, ...workspace.project, id: workspace.project.id };
    storage.write(projectProfileStorageKey, profile);
    const localItems = getProjectBasket();
    const localKeys = new Set(localItems.map((item) => `${item.type}:${item.id}`));
    const cloudItems = (workspace.items || []).filter((item) => !localKeys.has(`${item.type}:${item.id}`)).map((item) => ({
      type: item.type,
      id: item.id,
      quantity: item.quantity,
      addedAt: item.createdAt || new Date().toISOString()
    }));
    if (cloudItems.length) saveProjectBasket([...localItems, ...cloudItems]);
    applyProfile();
    if (cloudBadge) cloudBadge.textContent = "Neon sinxronizasiyası aktivdir";
    if (loginLink) loginLink.hidden = true;
    const url = new URL(window.location.href);
    url.searchParams.set("project", workspace.project.id);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    if (rfqLink) rfqLink.href = `rfq.html?project=${encodeURIComponent(workspace.project.id)}`;
    if (aiRfqLink) aiRfqLink.href = `rfq.html?project=${encodeURIComponent(workspace.project.id)}#ai-rfq`;
    renderWorkspace();
  };

  const syncCloud = async ({ quiet = false } = {}) => {
    if (!cloudUser || !window.ConstEraAPI?.syncProjectWorkspace || cloudSyncActive) return null;
    cloudSyncActive = true;
    if (cloudSave) cloudSave.disabled = true;
    if (!quiet) setPlannerStatus("Layihə Neon bazasına yazılır...");
    try {
      const response = await window.ConstEraAPI.syncProjectWorkspace(projectPayload());
      applyWorkspace(response.data);
      if (!quiet) setPlannerStatus("Layihə və bütün mövqelər Neon bazasında saxlandı.", "success");
      return response.data;
    } catch (error) {
      setPlannerStatus(error.message || "Layihə buludda saxlanmadı.", "error");
      return null;
    } finally {
      cloudSyncActive = false;
      if (cloudSave) cloudSave.disabled = false;
    }
  };

  const scheduleCloudSync = () => {
    if (!cloudUser || !getProjectProfile().id) return;
    window.clearTimeout(cloudSyncTimer);
    cloudSyncTimer = window.setTimeout(() => syncCloud({ quiet: true }), 700);
  };
  const render = () => {
    const entries = getResolvedProjectBasket();
    const counts = entries.reduce((result, entry) => {
      result[entry.type] = (result[entry.type] || 0) + 1;
      return result;
    }, {});
    const priced = entries.filter((entry) => getProjectEntityPriceAmount(entry) !== null);
    const knownSubtotal = priced.reduce((sum, entry) =>
      sum + getProjectEntityPriceAmount(entry) * entry.quantity, 0);
    const pendingCount = entries.length - priced.length;
    stats.innerHTML = `
      <article class="stat-card"><span class="stat-value">${entries.length}</span><p>ümumi mövqe</p></article>
      <article class="stat-card"><span class="stat-value">${counts.product || 0}</span><p>material</p></article>
      <article class="stat-card"><span class="stat-value">${(counts.service || 0) + (counts.package || 0)}</span><p>xidmət və paket</p></article>
      <article class="stat-card"><span class="stat-value">${counts.rental || 0}</span><p>icarə</p></article>
      <article class="stat-card"><span class="stat-value">${formatMoney(knownSubtotal)}</span><p>məlum ilkin məbləğ</p></article>
      <article class="stat-card"><span class="stat-value">${pendingCount}</span><p>qiymət təsdiqi gözləyir</p></article>
    `;
    list.innerHTML = entries.map((entry) => {
      const entity = entry.entity;
      const sourceUrl = getSafeHttpsUrl(entity.sourceUrl);
      const amount = getProjectEntityPriceAmount(entry);
      const meta = [entity.subcategory, entity.brand, entity.providerName, entity.city].filter(Boolean).slice(0, 2).join(" · ");
      const detailUrl = `${entry.config.detail}?${entry.config.param}=${encodeURIComponent(entry.id)}`;
      return `
        <article class="cabinet-item" data-project-basket-item="${escapeAttr(`${entry.type}:${entry.id}`)}">
          <header><strong>${escapeHtml(getProjectEntityTitle(entry))}</strong><span class="mini-badge${sourceUrl ? " is-verified" : ""}">${escapeHtml(sourceUrl ? "Mənbəli" : "Təsdiq tələb edir")}</span></header>
          <p>${escapeHtml(`${compactSymbol(entry.config.label, "CE")} · ${entry.config.label} · ${meta || entity.category || "ConstEra kataloqu"}`)}</p>
          <span>${amount === null ? "Sorğu əsasında" : formatMoney(amount * entry.quantity)} · ${escapeHtml(entity.unit || entity.package || "mövqe")}</span>
          <div class="cabinet-item-actions">
            <a class="table-action" href="${escapeAttr(detailUrl)}">Detallı bax</a>
            <label class="admin-field"><span>Miqdar</span><input type="number" min="1" max="1000000" step="1" value="${escapeAttr(entry.quantity)}" data-project-quantity="${escapeAttr(`${entry.type}:${entry.id}`)}" /></label>
            <button class="table-action is-danger" type="button" data-project-remove="${escapeAttr(`${entry.type}:${entry.id}`)}">Layihədən çıxar</button>
          </div>
        </article>
      `;
    }).join("");
    if (empty) empty.hidden = entries.length > 0;
    list.hidden = entries.length === 0;
    if (clearButton) clearButton.disabled = entries.length === 0;
    if (rfqLink) {
      rfqLink.classList.toggle("is-disabled", entries.length === 0);
      rfqLink.setAttribute("aria-disabled", String(entries.length === 0));
    }
    updateProjectBasketIndicators();
    scheduleCloudSync();
  };

  applyProfile();
  form.addEventListener("input", () => {
    const profile = saveProfile();
    if (aiLink) {
      const params = new URLSearchParams({
        projectType: profile.projectType || "villa",
        area: profile.area || "120",
        city: profile.city || ""
      });
      aiLink.href = `ai-smeta.html?${params}`;
    }
    setPlannerStatus(cloudUser && profile.id ? "Dəyişikliklər avtomatik sinxronlaşdırılacaq." : "Layihə parametrləri bu cihazda saxlandı.");
    scheduleCloudSync();
  });
  form.dispatchEvent(new Event("input"));
  list.addEventListener("change", (event) => {
    const input = event.target.closest("[data-project-quantity]");
    if (!input) return;
    const [type, id] = input.dataset.projectQuantity.split(":");
    const quantity = Math.max(1, Math.min(1_000_000, Number(input.value) || 1));
    saveProjectBasket(getProjectBasket().map((entry) => entry.type === type && entry.id === id ? { ...entry, quantity } : entry));
    render();
  });
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project-remove]");
    if (!button) return;
    const [type, id] = button.dataset.projectRemove.split(":");
    saveProjectBasket(getProjectBasket().filter((entry) => entry.type !== type || entry.id !== id));
    render();
  });
  clearButton?.addEventListener("click", () => {
    saveProjectBasket([]);
    render();
    if (status) status.textContent = "Layihə səbəti təmizləndi.";
  });
  cloudSave?.addEventListener("click", () => {
    if (!cloudUser) {
      window.location.assign("login.html?next=project-planner.html");
      return;
    }
    syncCloud();
  });
  matchSuppliersButton?.addEventListener("click", async () => {
    if (!cloudUser || !window.ConstEraAPI?.matchProjectSuppliers) {
      setPlannerStatus("Təchizatçı uyğunlaşdırması üçün hesabına daxil ol.", "warning");
      return;
    }
    let projectId = getProjectProfile().id || "";
    if (!projectId) projectId = (await syncCloud())?.project?.id || "";
    if (!projectId) return;
    matchSuppliersButton.disabled = true;
    try {
      const response = await window.ConstEraAPI.matchProjectSuppliers(projectId);
      applyWorkspace(response.data);
      setPlannerStatus(`${response.data?.supplierMatches?.length || 0} uyğun təchizatçı tapıldı.`, "success");
    } catch (error) {
      setPlannerStatus(error.message || "Təchizatçılar uyğunlaşdırılmadı.", "error");
    } finally {
      matchSuppliersButton.disabled = false;
    }
  });
  milestoneForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!cloudUser || !window.ConstEraAPI?.saveProjectMilestone) {
      setPlannerStatus("Təqvim və xatırlatma üçün hesabına daxil ol.", "warning");
      return;
    }
    let projectId = getProjectProfile().id || "";
    if (!projectId) projectId = (await syncCloud())?.project?.id || "";
    if (!projectId) return;
    const fields = Object.fromEntries(new FormData(milestoneForm).entries());
    const button = milestoneForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const response = await window.ConstEraAPI.saveProjectMilestone({ ...fields, projectId, reminder: fields.reminder === "true" });
      applyWorkspace(response.data);
      milestoneForm.reset();
      milestoneForm.elements.reminder.checked = true;
      setPlannerStatus("Mərhələ və xatırlatma saxlandı.", "success");
    } catch (error) {
      setPlannerStatus(error.message || "Mərhələ saxlanmadı.", "error");
    } finally {
      button.disabled = false;
    }
  });
  milestoneList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-project-milestone-delete]");
    if (!button || !window.ConstEraAPI?.deleteProjectMilestone) return;
    button.disabled = true;
    try {
      const response = await window.ConstEraAPI.deleteProjectMilestone(button.dataset.projectMilestoneDelete);
      applyWorkspace(response.data);
      setPlannerStatus("Mərhələ silindi.", "success");
    } catch (error) {
      button.disabled = false;
      setPlannerStatus(error.message || "Mərhələ silinmədi.", "error");
    }
  });
  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Fayl oxunmadı."));
    reader.readAsDataURL(file);
  });
  documentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = documentForm.elements.document.files?.[0];
    if (!file || !cloudUser || !window.ConstEraAPI?.uploadMedia) {
      setPlannerStatus("Sənəd yükləmək üçün hesabına daxil ol və fayl seç.", "warning");
      return;
    }
    if (file.size > 3_000_000) {
      setPlannerStatus("Sənəd maksimum 3 MB ola bilər.", "error");
      return;
    }
    let projectId = getProjectProfile().id || "";
    if (!projectId) projectId = (await syncCloud())?.project?.id || "";
    if (!projectId) return;
    const button = documentForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await window.ConstEraAPI.uploadMedia({
        filename: file.name,
        contentType: file.type,
        fileBase64: await fileToDataUrl(file),
        entityType: "project",
        entityId: projectId,
        altText: `${projectPayload().title} layihə sənədi`,
        licenseType: "own",
        licenseNote: "Müştəri tərəfindən layihə sənədi kimi yüklənib."
      });
      const response = await window.ConstEraAPI.projectWorkspace(projectId);
      applyWorkspace(response.data);
      documentForm.reset();
      setPlannerStatus("Sənəd layihəyə əlavə edildi.", "success");
    } catch (error) {
      setPlannerStatus(error.message || "Sənəd yüklənmədi.", "error");
    } finally {
      button.disabled = false;
    }
  });
  documentList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-project-document-delete]");
    const projectId = getProjectProfile().id || "";
    if (!button || !projectId || !window.ConstEraAPI?.deleteMedia) return;
    button.disabled = true;
    try {
      await window.ConstEraAPI.deleteMedia(button.dataset.projectDocumentDelete);
      const response = await window.ConstEraAPI.projectWorkspace(projectId);
      applyWorkspace(response.data);
      setPlannerStatus("Sənəd silindi.", "success");
    } catch (error) {
      button.disabled = false;
      setPlannerStatus(error.message || "Sənəd silinmədi.", "error");
    }
  });
  rfqLink?.addEventListener("click", (event) => {
    if (!getProjectBasketCount()) event.preventDefault();
  });
  render();
  renderWorkspace();
  window.ConstEraAPI?.session?.().then(async (session) => {
    cloudUser = session.user || null;
    if (!cloudUser) return;
    if (loginLink) loginLink.hidden = true;
    if (cloudBadge) cloudBadge.textContent = "Hesab qoşulub";
    const requestedId = new URLSearchParams(window.location.search).get("project") || getProjectProfile().id || "";
    if (requestedId && requestedId !== "1" && window.ConstEraAPI?.projectWorkspace) {
      try {
        const response = await window.ConstEraAPI.projectWorkspace(requestedId);
        applyWorkspace(response.data);
        render();
        setPlannerStatus("Layihə Neon bazasından yükləndi.", "success");
        return;
      } catch (error) {
        setPlannerStatus(error.message || "Bulud layihəsi yüklənmədi.", "error");
      }
    }
    setPlannerStatus("Hesab qoşulub. Layihəni buludda saxlaya bilərsən.", "success");
  }).catch(() => null);
};

const initActions = () => {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    if (button.dataset.action === "project") {
      const type = button.dataset.entityType;
      const id = button.dataset.id;
      if (!projectEntityTypes.has(type) || !getProjectEntity(type, id)) return;
      const basket = getProjectBasket();
      const exists = basket.some((item) => item.type === type && item.id === id);
      const next = exists
        ? basket.filter((item) => item.type !== type || item.id !== id)
        : [...basket, { type, id, quantity: 1, addedAt: new Date().toISOString() }];
      saveProjectBasket(next);
      button.classList.toggle("is-active", !exists);
      button.setAttribute("aria-pressed", String(!exists));
      button.textContent = exists ? "Layihəyə əlavə et" : "Layihədədir";
      updateProjectBasketIndicators();
      window.ConstEraTrack?.(exists ? "project_item_removed" : "project_item_added", { entityType: type, entityId: id });
      return;
    }

    if (button.dataset.action === "cart") {
      const id = button.dataset.id;
      const offerId = button.dataset.offerId || "";
      const cart = getCart();
      if (!cart.some((item) => item.id === id)) {
        saveCart([...cart, { id, quantity: 1, offerId }]);
      } else if (offerId) {
        saveCart(cart.map((item) => item.id === id ? { ...item, offerId } : item));
      }
      button.classList.add("is-active");
      button.textContent = "Səbətdədir";
      updateCartIndicators();
      window.ConstEraTrack?.("add_to_cart", { entityType: "product", entityId: id });
      return;
    }

    const key = button.dataset.action === "favorite" ? "constera-favorites" : "constera-compare";
    const values = storage.read(key);
    const id = button.dataset.id;
    const exists = values.includes(id);
    if (!exists && button.dataset.action === "compare" && values.length >= 5) {
      button.setAttribute("title", "Müqayisədə maksimum 5 məhsul ola bilər.");
      return;
    }
    const next = exists ? values.filter((value) => value !== id) : [...values, id];
    const isActive = !exists;

    storage.write(key, next);
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.setAttribute("aria-label", button.dataset.action === "favorite"
      ? (isActive ? "Seçilmişlərdən çıxar" : "Seçilmişlərə əlavə et")
      : (isActive ? "Müqayisədən çıxar" : "Müqayisəyə əlavə et"));
    if (window.ConstEraAPI?.syncSavedProducts) {
      const listType = button.dataset.action === "favorite" ? "favorite" : "compare";
      window.ConstEraAPI.session()
        .then((session) => session.user ? window.ConstEraAPI.syncSavedProducts(listType, next) : null)
        .catch(() => null);
    }
  });
};

const applyUrlFilters = () => {
  const brand = new URLSearchParams(window.location.search).get("brand");
  const brandSelect = document.querySelector("[data-brand-filter]");
  if (brand && brandSelect) {
    brandSelect.value = brand;
    brandSelect.dispatchEvent(new Event("change"));
  }
};

renderHomeSourcedShowcase();
renderCatalog();
renderBrands();
renderSuppliers();
initSupplierApplication();
renderServices();
renderPackages();
renderRentals();
renderProductDetail();
renderServiceDetail();
renderPackageDetail();
renderRentalDetail();
renderTaxonomyDetail();
renderAdmin();
initRfq();
renderRfqDashboard();
initTender();
initServiceCalculator();
initPackageCalculator();
initRentalCalculator();
initAiSmeta();
initSupplierPortal();
initPriceImportCenter();
initCustomerCabinet();
renderCheckout();
initProjectPlanner();
initActions();
initCartDock();
updateProjectBasketIndicators();
applyUrlFilters();
})();
