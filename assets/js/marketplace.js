const marketplace = window.CONSTERA_MARKETPLACE || {
  categories: [],
  serviceCategories: [],
  rentalCategories: [],
  brands: [],
  suppliers: [],
  products: [],
  services: [],
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
    localStorage.setItem(key, JSON.stringify(value));
  }
};

const getCategory = (id) => marketplace.categories.find((category) => category.id === id);
const getBrand = (name) => marketplace.brands.find((brand) => brand.name === name);
const getServiceCategory = (id) =>
  (marketplace.serviceCategories || []).find((category) => category.id === id);
const getRentalCategory = (id) =>
  (marketplace.rentalCategories || []).find((category) => category.id === id);

const normalize = (value) => String(value || "").trim().toLowerCase();
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
const escapeAttr = escapeHtml;

const countProductsBy = (field, value) =>
  marketplace.products.filter((product) => product[field] === value).length;
const countItemsBy = (items, field, value) =>
  (items || []).filter((item) => item[field] === value).length;
const getSubcategories = (categories, categoryId) => {
  const selectedCategories = categoryId === "all"
    ? categories
    : categories.filter((category) => category.id === categoryId);
  return [...new Set(selectedCategories.flatMap((category) => category.subcategories || []))];
};

const getFilteredSubcategoryCount = (items, categoryId, subcategory) =>
  (items || []).filter((item) => {
    const matchesCategory = categoryId === "all" || item.category === categoryId;
    return matchesCategory && item.subcategory === subcategory;
  }).length;
const getQueryParam = (name) => new URLSearchParams(window.location.search).get(name);

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

const createProductCard = (product) => {
  const category = getCategory(product.category);
  const brand = getBrand(product.brand);
  const favoriteIds = storage.read("constera-favorites");
  const compareIds = storage.read("constera-compare");
  const isFavorite = favoriteIds.includes(product.id);
  const isCompared = compareIds.includes(product.id);
  const brandMark = product.brand.split(" ").map((word) => word[0]).join("").slice(0, 3);
  const categoryTitle = category?.title || product.category;
  const media = product.imageUrl
    ? `<img src="${escapeAttr(product.imageUrl)}" alt="${escapeAttr(product.name)}" loading="lazy" referrerpolicy="no-referrer">`
    : `<span>${escapeHtml(brandMark)}</span>`;
  const source = product.sourceUrl
    ? `<a class="source-link" href="${escapeAttr(product.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(product.sourceLabel || "Mənbə")}</a>`
    : "";
  const detailLink = `<a class="source-link" href="product-detail.html?product=${encodeURIComponent(product.id)}">Detallı bax</a>`;

  return `
    <article class="market-card product-card" data-product-id="${escapeAttr(product.id)}">
      <div class="product-media">
        ${media}
      </div>
      <div class="product-card-body">
        <div class="product-meta">
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
          ${source}
          ${detailLink}
        </div>
        <div class="product-actions">
          <button class="icon-action ${isFavorite ? "is-active" : ""}" type="button" data-action="favorite" data-id="${escapeAttr(product.id)}" aria-label="Seçilmişlərə əlavə et">♡</button>
          <button class="icon-action ${isCompared ? "is-active" : ""}" type="button" data-action="compare" data-id="${escapeAttr(product.id)}" aria-label="Müqayisəyə əlavə et">⇄</button>
        </div>
      </div>
      <a class="button button-secondary product-rfq" href="rfq.html?product=${encodeURIComponent(product.id)}">Sorğu göndər</a>
    </article>
  `;
};

const renderCatalog = () => {
  const productGrid = document.querySelector("[data-product-grid]");
  const categoryList = document.querySelector("[data-category-list]");
  const brandSelect = document.querySelector("[data-brand-filter]");
  const searchInput = document.querySelector("[data-search]");
  const resultCount = document.querySelector("[data-result-count]");
  const emptyState = document.querySelector("[data-empty-state]");

  if (!productGrid || !categoryList || !brandSelect || !searchInput) return;

  let activeCategory = "all";

  const renderCategoryButtons = () => {
    const allCount = marketplace.products.length;
    categoryList.innerHTML = `
      <button class="category-filter is-active" type="button" data-category="all">
        <span>Bütün kataloq</span>
        <strong>${allCount}</strong>
      </button>
      ${marketplace.categories.map((category) => `
        <button class="category-filter" type="button" data-category="${category.id}">
          <span>${escapeHtml(category.title)}</span>
          <strong>${countProductsBy("category", category.id)}</strong>
        </button>
      `).join("")}
    `;
  };

  const renderBrandOptions = () => {
    const options = marketplace.brands
      .filter((brand) => marketplace.products.some((product) => product.brand === brand.name))
      .map((brand) => `<option value="${escapeAttr(brand.name)}">${escapeHtml(brand.name)}</option>`)
      .join("");

    brandSelect.innerHTML = `<option value="all">Bütün brendlər</option>${options}`;
  };

  const applyFilters = () => {
    const query = normalize(searchInput.value);
    const brand = brandSelect.value;

    const filtered = marketplace.products.filter((product) => {
      const matchesCategory = activeCategory === "all" || product.category === activeCategory;
      const matchesBrand = brand === "all" || product.brand === brand;
      const searchable = normalize([
        product.name,
        product.brand,
        product.category,
        product.subcategory,
        product.sku,
        product.package,
        product.origin
      ].join(" "));
      const matchesQuery = !query || searchable.includes(query);
      return matchesCategory && matchesBrand && matchesQuery;
    });

    productGrid.innerHTML = filtered.map(createProductCard).join("");
    if (resultCount) resultCount.textContent = `${filtered.length} məhsul`;
    if (emptyState) emptyState.hidden = filtered.length > 0;
  };

  renderCategoryButtons();
  renderBrandOptions();
  applyFilters();

  categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    activeCategory = button.dataset.category;
    categoryList.querySelectorAll(".category-filter").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    applyFilters();
  });

  searchInput.addEventListener("input", applyFilters);
  brandSelect.addEventListener("change", applyFilters);
};

const renderBrands = () => {
  const grid = document.querySelector("[data-brand-grid]");
  if (!grid) return;

  grid.innerHTML = marketplace.brands.map((brand) => {
    const productCount = marketplace.products.filter((product) => product.brand === brand.name).length;
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

  grid.innerHTML = marketplace.suppliers.map((supplier) => `
    <article class="market-card supplier-card">
      <span class="card-topline">${escapeHtml(supplier.type)}</span>
      <h3>${escapeHtml(supplier.name)}</h3>
      <p>${escapeHtml(supplier.focus)}</p>
      <dl class="supplier-list">
        <div><dt>Region</dt><dd>${escapeHtml(supplier.region)}</dd></div>
        <div><dt>Vəziyyət</dt><dd>${escapeHtml(supplier.status)}</dd></div>
        <div><dt>Sayt</dt><dd>${escapeHtml(supplier.website)}</dd></div>
      </dl>
      <a class="button button-secondary" href="rfq.html?supplier=${encodeURIComponent(supplier.id)}">Təklif sorğusu</a>
    </article>
  `).join("");
};

const createServiceCard = (service) => {
  const category = getServiceCategory(service.category);

  return `
    <article class="market-card service-card">
      <div class="product-card-body">
        <div class="product-meta">
          <span>${escapeHtml(category?.title || service.category)}</span>
          <span>${escapeHtml(service.subcategory || "Ümumi")}</span>
          <span>${escapeHtml(service.type)}</span>
        </div>
        <h3>${escapeHtml(service.title)}</h3>
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
          <small>${escapeHtml(service.team)}</small>
          <a class="source-link" href="service-detail.html?service=${encodeURIComponent(service.id)}">Detallı bax</a>
        </div>
      </div>
      <a class="button button-secondary product-rfq" href="rfq.html?service=${encodeURIComponent(service.id)}">Xidmət sorğusu</a>
    </article>
  `;
};

const createRentalCard = (rental) => {
  const category = getRentalCategory(rental.category);

  return `
    <article class="market-card rental-card">
      <div class="product-card-body">
        <div class="product-meta">
          <span>${escapeHtml(category?.title || rental.category)}</span>
          <span>${escapeHtml(rental.subcategory || "Ümumi")}</span>
          <span>${escapeHtml(rental.operator)}</span>
        </div>
        <h3>${escapeHtml(rental.name)}</h3>
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
          <small>${escapeHtml(rental.deposit)}</small>
          <a class="source-link" href="rental-detail.html?rental=${encodeURIComponent(rental.id)}">Detallı bax</a>
        </div>
      </div>
      <a class="button button-secondary product-rfq" href="rfq.html?rental=${encodeURIComponent(rental.id)}">İcarə sorğusu</a>
    </article>
  `;
};

const renderServices = () => {
  const grid = document.querySelector("[data-service-grid]");
  const categoryFilter = document.querySelector("[data-service-category-filter]") || document.querySelector("[data-service-filter]");
  const subcategoryFilter = document.querySelector("[data-service-subcategory-filter]");
  const count = document.querySelector("[data-service-count]");
  if (!grid || !categoryFilter) return;

  const services = marketplace.services || [];
  const categories = marketplace.serviceCategories || [];

  categoryFilter.innerHTML = `
    <option value="all">Bütün kateqoriyalar (${services.length})</option>
    ${(marketplace.serviceCategories || []).map((category) => `
      <option value="${escapeAttr(category.id)}">${escapeHtml(category.title)} (${countItemsBy(services, "category", category.id)})</option>
    `).join("")}
  `;

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
    const filtered = services.filter((service) => {
      const matchesCategory = categoryValue === "all" || service.category === categoryValue;
      const matchesSubcategory = subcategoryValue === "all" || service.subcategory === subcategoryValue;
      return matchesCategory && matchesSubcategory;
    });
    grid.innerHTML = filtered.map(createServiceCard).join("");
    if (count) count.textContent = `${filtered.length} xidmət`;
  };

  categoryFilter.addEventListener("change", () => {
    renderSubcategoryOptions();
    render();
  });
  subcategoryFilter?.addEventListener("change", render);
  renderSubcategoryOptions();
  render();
};

const renderRentals = () => {
  const grid = document.querySelector("[data-rental-grid]");
  const categoryFilter = document.querySelector("[data-rental-category-filter]") || document.querySelector("[data-rental-filter]");
  const subcategoryFilter = document.querySelector("[data-rental-subcategory-filter]");
  const count = document.querySelector("[data-rental-count]");
  if (!grid || !categoryFilter) return;

  const rentals = marketplace.rentals || [];
  const categories = marketplace.rentalCategories || [];

  categoryFilter.innerHTML = `
    <option value="all">Bütün kateqoriyalar (${rentals.length})</option>
    ${(marketplace.rentalCategories || []).map((category) => `
      <option value="${escapeAttr(category.id)}">${escapeHtml(category.title)} (${countItemsBy(rentals, "category", category.id)})</option>
    `).join("")}
  `;

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
    const filtered = rentals.filter((rental) => {
      const matchesCategory = categoryValue === "all" || rental.category === categoryValue;
      const matchesSubcategory = subcategoryValue === "all" || rental.subcategory === subcategoryValue;
      return matchesCategory && matchesSubcategory;
    });
    grid.innerHTML = filtered.map(createRentalCard).join("");
    if (count) count.textContent = `${filtered.length} avadanlıq`;
  };

  categoryFilter.addEventListener("change", () => {
    renderSubcategoryOptions();
    render();
  });
  subcategoryFilter?.addEventListener("change", render);
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
  if (!product) {
    renderDetailFallback(container, "Məhsul tapılmadı", "catalog.html");
    return;
  }

  const category = getCategory(product.category);
  const brand = getBrand(product.brand);
  const brandMark = product.brand.split(" ").map((word) => word[0]).join("").slice(0, 3);
  const media = product.imageUrl
    ? `<img src="${escapeAttr(product.imageUrl)}" alt="${escapeAttr(product.name)}" loading="lazy" referrerpolicy="no-referrer">`
    : `<span>${escapeHtml(brandMark)}</span>`;
  const source = product.sourceUrl
    ? `<a class="button button-secondary" href="${escapeAttr(product.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(product.sourceLabel || "Mənbəni aç")}</a>`
    : "";

  document.title = `${product.name} | ConstEra Kataloq`;
  container.innerHTML = `
    <div class="detail-hero glass">
      <div class="detail-media">${media}</div>
      <div class="detail-copy">
        <p class="eyebrow">Məhsul detalı</p>
        <h1>${escapeHtml(product.name)}</h1>
        <div class="product-meta detail-tags">
          <span>${escapeHtml(category?.title || product.category)}</span>
          <span>${escapeHtml(product.subcategory)}</span>
          <span>${escapeHtml(product.brand)}</span>
        </div>
        <p class="hero-text">Bu səhifə RFQ, təchizatçı qiyməti və gələcək admin redaktəsi üçün məhsulun vahid məlumat kartıdır.</p>
        <div class="detail-actions">
          <a class="button button-primary" href="rfq.html?product=${encodeURIComponent(product.id)}">RFQ göndər</a>
          <a class="button button-outline" href="catalog.html">Kataloqa qayıt</a>
          ${source}
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <article class="detail-panel glass">
        <span class="price-label">Qiymət</span>
        <strong>${escapeHtml(product.price)}</strong>
        <p>${escapeHtml(product.priceNote || "Qiymət təchizatçı tərəfindən təsdiqlənməlidir.")}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">SKU</span>
        <strong>${escapeHtml(product.sku)}</strong>
        <p>${escapeHtml(product.package)} · ${escapeHtml(product.origin)}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Təchizatçı</span>
        <strong>${escapeHtml(product.supplier)}</strong>
        <p>${escapeHtml(product.availability)}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Brend statusu</span>
        <strong>${escapeHtml(brand?.country || product.origin)}</strong>
        <p>${escapeHtml(brand?.certification || "Təchizatçı təsdiqi lazımdır")}</p>
      </article>
    </div>

    <div class="detail-two-column">
      <article class="detail-panel glass">
        <p class="eyebrow">Texniki xüsusiyyətlər</p>
        <ul class="spec-list detail-list">
          ${(product.specs || []).map((spec) => `<li>${escapeHtml(spec)}</li>`).join("")}
        </ul>
      </article>
      <article class="detail-panel glass">
        <p class="eyebrow">RFQ üçün qeydlər</p>
        <ul class="spec-list detail-list">
          <li>Qiymət real təchizatçı siyahısı ilə təsdiqlənməlidir.</li>
          <li>Çatdırılma şəhər/rayon və miqdardan asılıdır.</li>
          <li>Alternativ marka və paket ölçüsü RFQ qeydində yazıla bilər.</li>
        </ul>
      </article>
    </div>
  `;
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
  document.title = `${service.title} | ConstEra Xidmətlər`;
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
          <a class="button button-primary" href="rfq.html?service=${encodeURIComponent(service.id)}">Xidmət RFQ yarat</a>
          <a class="button button-outline" href="services.html">Xidmətlərə qayıt</a>
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <article class="detail-panel glass">
        <span class="price-label">Qiymət</span>
        <strong>${escapeHtml(service.price)}</strong>
        <p>Obyektə baxış və iş həcmi təsdiqindən sonra dəqiqləşir.</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Müddət</span>
        <strong>${escapeHtml(service.leadTime)}</strong>
        <p>${escapeHtml(service.unit)}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Komanda</span>
        <strong>${escapeHtml(service.team)}</strong>
        <p>İş həcminə görə briqada tərkibi dəyişir.</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Təhvil</span>
        <strong>${(service.deliverables || []).length} nəticə</strong>
        <p>RFQ və smeta üçün strukturlaşdırılmış çıxışlar.</p>
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
  `;
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
  document.title = `${rental.name} | ConstEra İcarə`;
  container.innerHTML = `
    <div class="detail-hero glass">
      <div class="detail-symbol">
        <span>İC</span>
      </div>
      <div class="detail-copy">
        <p class="eyebrow">İcarə detalı</p>
        <h1>${escapeHtml(rental.name)}</h1>
        <div class="product-meta detail-tags">
          <span>${escapeHtml(category?.title || rental.category)}</span>
          <span>${escapeHtml(rental.subcategory || "Ümumi")}</span>
          <span>${escapeHtml(rental.operator)}</span>
        </div>
        <p class="hero-text">Avadanlıq gücü, operator şərti, depozit, çatdırılma və rezervasiya RFQ-si üçün əsas kart.</p>
        <div class="detail-actions">
          <a class="button button-primary" href="rfq.html?rental=${encodeURIComponent(rental.id)}">İcarə RFQ yarat</a>
          <a class="button button-outline" href="rental.html">İcarəyə qayıt</a>
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <article class="detail-panel glass">
        <span class="price-label">İcarə qiyməti</span>
        <strong>${escapeHtml(rental.price)}</strong>
        <p>Gün, həftə, ay və obyekt şərtinə görə dəqiqləşir.</p>
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
          <li>Tarix, müddət və obyekt ünvanı RFQ-də yazılmalıdır.</li>
          <li>Operator, yanacaq və daşınma şərtləri ayrıca təsdiqlənir.</li>
          <li>Depozit və təhvil-qəbul aktı müqavilə əsasında bağlanır.</li>
        </ul>
      </article>
    </div>
  `;
};

const renderAdmin = () => {
  const stats = document.querySelector("[data-admin-stats]");
  const productRows = document.querySelector("[data-admin-products]");
  const categoryRows = document.querySelector("[data-admin-categories]");
  const serviceRows = document.querySelector("[data-admin-services]");
  const rentalRows = document.querySelector("[data-admin-rentals]");

  if (stats) {
    stats.innerHTML = `
      <article class="stat-card"><span class="stat-value">${marketplace.categories.length}</span><p>kateqoriya</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.brands.length}</span><p>brend</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.suppliers.length}</span><p>təchizatçı</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.products.length}</span><p>məhsul</p></article>
      <article class="stat-card"><span class="stat-value">${(marketplace.services || []).length}</span><p>xidmət</p></article>
      <article class="stat-card"><span class="stat-value">${(marketplace.rentals || []).length}</span><p>icarə avadanlığı</p></article>
    `;
  }

  if (productRows) {
    productRows.innerHTML = marketplace.products.slice(0, 12).map((product) => `
      <tr>
        <td>${escapeHtml(product.sku)}</td>
        <td>${escapeHtml(product.name)}</td>
        <td>${escapeHtml(product.brand)}</td>
        <td>${escapeHtml(product.price)}</td>
        <td>${escapeHtml(product.availability)}</td>
      </tr>
    `).join("");
  }

  if (categoryRows) {
    categoryRows.innerHTML = marketplace.categories.map((category) => `
      <tr>
        <td>${escapeHtml(category.title)}</td>
        <td>${category.subcategories.length}</td>
        <td>${countProductsBy("category", category.id)}</td>
      </tr>
    `).join("");
  }

  if (serviceRows) {
    serviceRows.innerHTML = (marketplace.services || []).map((service) => `
      <tr>
        <td>${escapeHtml(service.title)}</td>
        <td>${escapeHtml(getServiceCategory(service.category)?.title || service.category)}</td>
        <td>${escapeHtml(service.subcategory || "Ümumi")}</td>
        <td>${escapeHtml(service.unit)}</td>
        <td>${escapeHtml(service.price)}</td>
        <td>${escapeHtml(service.leadTime)}</td>
      </tr>
    `).join("");
  }

  if (rentalRows) {
    rentalRows.innerHTML = (marketplace.rentals || []).map((rental) => `
      <tr>
        <td>${escapeHtml(rental.name)}</td>
        <td>${escapeHtml(getRentalCategory(rental.category)?.title || rental.category)}</td>
        <td>${escapeHtml(rental.subcategory || "Ümumi")}</td>
        <td>${escapeHtml(rental.unit)}</td>
        <td>${escapeHtml(rental.operator)}</td>
        <td>${escapeHtml(rental.price)}</td>
      </tr>
    `).join("");
  }
};

const initRfq = () => {
  const form = document.querySelector("[data-rfq-form]");
  const output = document.querySelector("[data-rfq-output]");
  const productSelect = document.querySelector("[data-product-select]");
  if (!form || !output || !productSelect) return;

  const serviceOptions = (marketplace.serviceCategories || [])
    .map((category) => {
      const options = (marketplace.services || [])
        .filter((service) => service.category === category.id)
        .map((service) => `<option value="service:${escapeAttr(service.id)}">${escapeHtml(service.title)} — ${escapeHtml(service.subcategory || "Ümumi")}</option>`)
        .join("");
      return options ? `<optgroup label="Xidmətlər - ${escapeAttr(category.title)}">${options}</optgroup>` : "";
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
    <option value="">Məhsul, xidmət və ya avadanlıq seçin</option>
    <optgroup label="Məhsullar">${productOptions}</optgroup>
    ${serviceOptions}
    ${rentalOptions}
  `;

  const params = new URLSearchParams(window.location.search);
  const productId = params.get("product");
  const serviceId = params.get("service");
  const rentalId = params.get("rental");
  if (productId && marketplace.products.some((product) => product.id === productId)) {
    productSelect.value = `product:${productId}`;
  }
  if (serviceId && (marketplace.services || []).some((service) => service.id === serviceId)) {
    productSelect.value = `service:${serviceId}`;
  }
  if (rentalId && (marketplace.rentals || []).some((rental) => rental.id === rentalId)) {
    productSelect.value = `rental:${rentalId}`;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const selectedValue = String(data.get("product") || "");
    const [selectedType, selectedId] = selectedValue.split(":");
    const selectedProduct = marketplace.products.find((product) => selectedType === "product" && product.id === selectedId);
    const selectedService = (marketplace.services || []).find((service) => selectedType === "service" && service.id === selectedId);
    const selectedRental = (marketplace.rentals || []).find((rental) => selectedType === "rental" && rental.id === selectedId);
    const rfq = {
      product: selectedProduct?.name || selectedService?.title || selectedRental?.name || data.get("customProduct"),
      quantity: data.get("quantity"),
      needDate: data.get("needDate"),
      budget: data.get("budget"),
      deliveryMode: data.get("deliveryMode"),
      usage: data.get("usage"),
      company: data.get("company"),
      contact: data.get("contact"),
      city: data.get("city"),
      note: data.get("note"),
      createdAt: new Date().toISOString()
    };

    const existing = storage.read("constera-rfq-drafts");
    existing.unshift(rfq);
    storage.write("constera-rfq-drafts", existing.slice(0, 20));

    output.hidden = false;
    output.innerHTML = `
      <strong>RFQ draftı hazırdır.</strong>
      <span>${escapeHtml(rfq.product || "Məhsul")} · ${escapeHtml(rfq.quantity || "miqdar yazılmayıb")} · ${escapeHtml(rfq.company || "şirkət")}</span>
      <span>${escapeHtml(rfq.needDate || "tarix açıqdır")} · ${escapeHtml(rfq.deliveryMode || "çatdırılma/operator seçilməyib")} · ${escapeHtml(rfq.budget || "büdcə yazılmayıb")}</span>
      <small>Bu demo versiyada sorğu brauzerdə saxlanır. Server hissəsi qoşulanda avtomatik təchizatçılara göndəriləcək.</small>
    `;
  });
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
      <a class="button button-secondary" href="rfq.html?service=menzil-temiri-paketi">RFQ-yə göndər</a>
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
      <span>${days} gün · ${shift} saatlıq növbə · ${escapeHtml(operator)} · ${escapeHtml(zone)} zonası · ${reservationType} RFQ</span>
      <a class="button button-secondary" href="rfq.html?rental=ekskavator-20t">İcarə RFQ yarat</a>
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

const initActions = () => {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const key = button.dataset.action === "favorite" ? "constera-favorites" : "constera-compare";
    const values = storage.read(key);
    const id = button.dataset.id;
    const exists = values.includes(id);
    const next = exists ? values.filter((value) => value !== id) : [...values, id];

    storage.write(key, next);
    button.classList.toggle("is-active", !exists);
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

renderCatalog();
renderBrands();
renderSuppliers();
renderServices();
renderRentals();
renderProductDetail();
renderServiceDetail();
renderRentalDetail();
renderAdmin();
initRfq();
initServiceCalculator();
initRentalCalculator();
initActions();
applyUrlFilters();
