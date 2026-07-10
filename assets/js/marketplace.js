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
    localStorage.setItem(key, JSON.stringify(value));
  }
};

const getCategory = (id) => marketplace.categories.find((category) => category.id === id);
const getBrand = (name) => marketplace.brands.find((brand) => brand.name === name);
const getServiceCategory = (id) =>
  (marketplace.serviceCategories || []).find((category) => category.id === id);
const getPackageCategory = (id) =>
  (marketplace.packageCategories || []).find((category) => category.id === id);
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
  const groupSelect = document.querySelector("[data-group-filter]");
  const subcategorySelect = document.querySelector("[data-subcategory-filter]");
  const availabilitySelect = document.querySelector("[data-availability-filter]");
  const priceSelect = document.querySelector("[data-price-filter]");
  const originSelect = document.querySelector("[data-origin-filter]");
  const searchInput = document.querySelector("[data-search]");
  const resultCount = document.querySelector("[data-result-count]");
  const emptyState = document.querySelector("[data-empty-state]");
  const activeFilterList = document.querySelector("[data-active-filter-list]");

  if (!productGrid || !categoryList || !brandSelect || !searchInput) return;

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
    const options = marketplace.brands
      .filter((brand) => marketplace.products.some((product) => product.brand === brand.name))
      .map((brand) => `<option value="${escapeAttr(brand.name)}">${escapeHtml(brand.name)}</option>`)
      .join("");

    brandSelect.innerHTML = `<option value="all">Bütün brendlər</option>${options}`;
    const brandParam = params.get("brand");
    if (brandParam && [...brandSelect.options].some((option) => option.value === brandParam)) {
      brandSelect.value = brandParam;
    }
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
    if (originSelect && params.get("origin")) originSelect.value = params.get("origin");
  };

  const applyFilters = () => {
    const query = normalize(searchInput.value);
    const brand = brandSelect.value;
    const group = groupSelect?.value || "all";
    const subcategory = subcategorySelect?.value || "all";
    const availability = availabilitySelect?.value || "all";
    const priceStatus = priceSelect?.value || "all";
    const origin = originSelect?.value || "all";

    const filtered = marketplace.products.filter((product) => {
      const category = getCategory(product.category);
      const priceIsRequest = normalize(product.price) === normalize("Sorğu əsasında");
      const matchesCategory = activeCategory === "all" || product.category === activeCategory;
      const matchesGroup = group === "all" || category?.group === group;
      const matchesSubcategory = subcategory === "all" || product.subcategory === subcategory;
      const matchesBrand = brand === "all" || product.brand === brand;
      const matchesAvailability = availability === "all" || product.availability === availability;
      const matchesPrice = priceStatus === "all" ||
        (priceStatus === "request" && priceIsRequest) ||
        (priceStatus === "confirmed" && !priceIsRequest);
      const originValue = normalize(product.origin);
      const matchesOrigin = origin === "all" ||
        (origin === "local" && originValue.includes("azərbaycan") && !originValue.includes("import")) ||
        (origin === "import" && originValue.includes("import")) ||
        (origin === "mixed" && originValue.includes("/") && originValue.includes("azərbaycan"));
      const searchable = normalize([
        product.name,
        product.brand,
        product.category,
        product.subcategory,
        product.sku,
        product.package,
        product.origin,
        ...(product.specs || [])
      ].join(" "));
      const matchesQuery = !query || searchable.includes(query);
      return matchesCategory &&
        matchesGroup &&
        matchesSubcategory &&
        matchesBrand &&
        matchesAvailability &&
        matchesPrice &&
        matchesOrigin &&
        matchesQuery;
    });

    productGrid.innerHTML = filtered.map(createProductCard).join("");
    if (resultCount) resultCount.textContent = `${filtered.length} məhsul`;
    if (emptyState) emptyState.hidden = filtered.length > 0;
    if (activeFilterList) {
      const chips = [
        activeCategory !== "all" ? getCategory(activeCategory)?.title : "",
        group !== "all" ? group : "",
        subcategory !== "all" ? subcategory : "",
        brand !== "all" ? brand : "",
        availability !== "all" ? availability : "",
        priceStatus === "request" ? "Sorğu qiyməti" : priceStatus === "confirmed" ? "Təsdiqli qiymət" : "",
        origin === "local" ? "Azərbaycan" : origin === "import" ? "Import" : origin === "mixed" ? "Qarışıq mənşə" : ""
      ].filter(Boolean);
      activeFilterList.innerHTML = chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("");
      activeFilterList.hidden = chips.length === 0;
    }
  };

  renderCategoryButtons();
  renderGroupOptions();
  renderBrandOptions();
  applyParamDefaults();
  renderSubcategoryOptions();
  applyFilters();

  categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    activeCategory = button.dataset.category;
    if (groupSelect) groupSelect.value = "all";
    categoryList.querySelectorAll(".category-filter").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    renderSubcategoryOptions();
    applyFilters();
  });

  searchInput.addEventListener("input", applyFilters);
  brandSelect.addEventListener("change", applyFilters);
  groupSelect?.addEventListener("change", () => {
    if (groupSelect.value !== "all") {
      activeCategory = "all";
      categoryList.querySelectorAll(".category-filter").forEach((item) => {
        item.classList.toggle("is-active", item.dataset.category === "all");
      });
    }
    renderSubcategoryOptions();
    applyFilters();
  });
  subcategorySelect?.addEventListener("change", applyFilters);
  availabilitySelect?.addEventListener("change", applyFilters);
  priceSelect?.addEventListener("change", applyFilters);
  originSelect?.addEventListener("change", applyFilters);
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

const createPackageCard = (pack) => {
  const category = getPackageCategory(pack.category);

  return `
    <article class="market-card service-card">
      <div class="product-card-body">
        <div class="product-meta">
          <span>${escapeHtml(category?.title || pack.category)}</span>
          <span>${escapeHtml(pack.subcategory || "Ümumi")}</span>
          <span>${escapeHtml(pack.type)}</span>
        </div>
        <h3>${escapeHtml(pack.title)}</h3>
        <p class="product-sku">${escapeHtml(pack.idealFor)}</p>
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
          <small>${escapeHtml(pack.timeline)}</small>
          <a class="source-link" href="package-detail.html?package=${encodeURIComponent(pack.id)}">Detallı bax</a>
        </div>
      </div>
      <a class="button button-secondary product-rfq" href="rfq.html?package=${encodeURIComponent(pack.id)}">Paket RFQ</a>
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

const renderPackages = () => {
  const grid = document.querySelector("[data-package-grid]");
  const categoryFilter = document.querySelector("[data-package-category-filter]");
  const subcategoryFilter = document.querySelector("[data-package-subcategory-filter]");
  const count = document.querySelector("[data-package-count]");
  if (!grid || !categoryFilter) return;

  const packages = marketplace.packages || [];
  const categories = marketplace.packageCategories || [];

  categoryFilter.innerHTML = renderGroupedCategoryOptions(categories, packages, "Bütün paketlər");

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
    const filtered = packages.filter((pack) => {
      const matchesCategory = categoryValue === "all" || pack.category === categoryValue;
      const matchesSubcategory = subcategoryValue === "all" || pack.subcategory === subcategoryValue;
      return matchesCategory && matchesSubcategory;
    });
    grid.innerHTML = filtered.map(createPackageCard).join("");
    if (count) count.textContent = `${filtered.length} paket`;
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

  categoryFilter.innerHTML = renderGroupedCategoryOptions(categories, rentals, "Bütün kateqoriyalar");

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
  document.title = `${pack.title} | ConstEra Paketlər`;
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
          <span>${escapeHtml(pack.type)}</span>
        </div>
        <p class="hero-text">${escapeHtml(pack.idealFor)}</p>
        <div class="detail-actions">
          <a class="button button-primary" href="rfq.html?package=${encodeURIComponent(pack.id)}">Paket RFQ yarat</a>
          <a class="button button-outline" href="packages.html">Paketlərə qayıt</a>
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <article class="detail-panel glass">
        <span class="price-label">Paket qiyməti</span>
        <strong>${escapeHtml(pack.price)}</strong>
        <p>Obyekt ölçüsü, material səviyyəsi və icra şərtləri RFQ-dən sonra dəqiqləşir.</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Müddət</span>
        <strong>${escapeHtml(pack.timeline)}</strong>
        <p>${escapeHtml(pack.unit)}</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Komanda</span>
        <strong>${escapeHtml(pack.team)}</strong>
        <p>İş həcminə görə briqada və nəzarət tərkibi dəyişir.</p>
      </article>
      <article class="detail-panel glass">
        <span class="price-label">Təhvil</span>
        <strong>${(pack.deliverables || []).length} nəticə</strong>
        <p>RFQ və müqavilə üçün strukturlaşdırılmış çıxışlar.</p>
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
  });
  const pageTitle = visibleSubcategory || category.title;
  const baseUrl = `category.html?type=${encodeURIComponent(type)}&category=${encodeURIComponent(category.id)}`;

  document.title = `${pageTitle} | ConstEra ${config.label}`;
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
        <p class="hero-text">${escapeHtml(category.subtitle || "ConstEra RFQ axını üçün qruplaşdırılmış kateqoriya səhifəsi.")}</p>
        <div class="detail-actions">
          <a class="button button-primary" href="rfq.html">RFQ yarat</a>
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
        <p>${visibleSubcategory ? escapeHtml(visibleSubcategory) : "Alt bölmələr RFQ və SEO üçün ayrıca açılır."}</p>
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
          <span>Admin və import axını ilə yeni məlumat əlavə oluna bilər.</span>
        </div>
      `}
    </section>
  `;
};

const renderAdmin = () => {
  const stats = document.querySelector("[data-admin-stats]");
  const productRows = document.querySelector("[data-admin-products]");
  const categoryRows = document.querySelector("[data-admin-categories]");
  const serviceRows = document.querySelector("[data-admin-services]");
  const packageRows = document.querySelector("[data-admin-packages]");
  const rentalRows = document.querySelector("[data-admin-rentals]");

  if (stats) {
    stats.innerHTML = `
      <article class="stat-card"><span class="stat-value">${marketplace.categories.length}</span><p>kateqoriya</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.brands.length}</span><p>brend</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.suppliers.length}</span><p>təchizatçı</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.products.length}</span><p>məhsul</p></article>
      <article class="stat-card"><span class="stat-value">${(marketplace.services || []).length}</span><p>xidmət</p></article>
      <article class="stat-card"><span class="stat-value">${(marketplace.packages || []).length}</span><p>hazır paket</p></article>
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
        <td>${escapeHtml(category.group || "Ümumi")}</td>
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

  if (packageRows) {
    packageRows.innerHTML = (marketplace.packages || []).map((pack) => `
      <tr>
        <td>${escapeHtml(pack.title)}</td>
        <td>${escapeHtml(getPackageCategory(pack.category)?.title || pack.category)}</td>
        <td>${escapeHtml(pack.subcategory || "Ümumi")}</td>
        <td>${escapeHtml(pack.unit)}</td>
        <td>${escapeHtml(pack.price)}</td>
        <td>${escapeHtml(pack.timeline)}</td>
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

  const params = new URLSearchParams(window.location.search);
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const selectedValue = String(data.get("product") || "");
    const [selectedType, selectedId] = selectedValue.split(":");
    const selectedProduct = marketplace.products.find((product) => selectedType === "product" && product.id === selectedId);
    const selectedService = (marketplace.services || []).find((service) => selectedType === "service" && service.id === selectedId);
    const selectedPackage = (marketplace.packages || []).find((pack) => selectedType === "package" && pack.id === selectedId);
    const selectedRental = (marketplace.rentals || []).find((rental) => selectedType === "rental" && rental.id === selectedId);
    const rfq = {
      id: `rfq-${Date.now()}`,
      type: selectedType || "custom",
      sourceId: selectedId || "",
      status: "Yeni",
      product: selectedProduct?.name || selectedService?.title || selectedPackage?.title || selectedRental?.name || data.get("customProduct"),
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
      <a class="button button-secondary" href="rfq-dashboard.html">RFQ paneldə aç</a>
      <small>Bu demo versiyada sorğu brauzerdə saxlanır. Server hissəsi qoşulanda avtomatik təchizatçılara göndəriləcək.</small>
    `;
  });
};

const renderRfqDashboard = () => {
  const stats = document.querySelector("[data-rfq-dashboard-stats]");
  const rows = document.querySelector("[data-rfq-dashboard-rows]");
  const empty = document.querySelector("[data-rfq-dashboard-empty]");
  const statusFilter = document.querySelector("[data-rfq-status-filter]");
  const typeFilter = document.querySelector("[data-rfq-type-filter]");
  if (!stats || !rows) return;

  const typeLabels = {
    product: "Məhsul",
    service: "Xidmət",
    package: "Paket",
    rental: "İcarə",
    custom: "Sərbəst"
  };
  const statusList = ["Yeni", "Cavab gözləyir", "Təklif gəldi", "Bağlandı"];

  const getDrafts = () => {
    let changed = false;
    const drafts = storage.read("constera-rfq-drafts").map((draft, index) => {
      const next = {
        id: draft.id || `rfq-migrated-${index}-${Date.parse(draft.createdAt || "") || index}`,
        type: draft.type || "custom",
        status: draft.status || "Yeni",
        ...draft
      };
      if (!draft.id || !draft.type || !draft.status) changed = true;
      return next;
    });
    if (changed) storage.write("constera-rfq-drafts", drafts);
    return drafts;
  };

  const render = () => {
    const drafts = getDrafts();
    const activeStatus = statusFilter?.value || "all";
    const activeType = typeFilter?.value || "all";
    const filtered = drafts.filter((draft) => {
      const matchesStatus = activeStatus === "all" || draft.status === activeStatus;
      const matchesType = activeType === "all" || draft.type === activeType;
      return matchesStatus && matchesType;
    });
    const counts = statusList.reduce((acc, status) => {
      acc[status] = drafts.filter((draft) => draft.status === status).length;
      return acc;
    }, {});

    stats.innerHTML = `
      <article class="stat-card"><span class="stat-value">${drafts.length}</span><p>ümumi RFQ</p></article>
      <article class="stat-card"><span class="stat-value">${counts["Yeni"] || 0}</span><p>yeni sorğu</p></article>
      <article class="stat-card"><span class="stat-value">${counts["Cavab gözləyir"] || 0}</span><p>cavab gözləyir</p></article>
      <article class="stat-card"><span class="stat-value">${counts["Təklif gəldi"] || 0}</span><p>təklif gəldi</p></article>
      <article class="stat-card"><span class="stat-value">${counts["Bağlandı"] || 0}</span><p>bağlandı</p></article>
    `;

    rows.innerHTML = filtered.map((draft) => `
      <tr>
        <td>
          <strong>${escapeHtml(draft.product || "Sərbəst sorğu")}</strong>
          <small>${escapeHtml(draft.note || draft.usage || "Qeyd yoxdur")}</small>
        </td>
        <td>${escapeHtml(typeLabels[draft.type] || "Sərbəst")}</td>
        <td>${escapeHtml(draft.quantity || "Yazılmayıb")}</td>
        <td>${escapeHtml(draft.company || "Şirkət yoxdur")}</td>
        <td>${escapeHtml(draft.contact || "Əlaqə yoxdur")}</td>
        <td>${escapeHtml(draft.needDate || "Açıq")}</td>
        <td><span class="status-pill">${escapeHtml(draft.status)}</span></td>
        <td>
          <div class="status-actions">
            ${statusList.map((status) => `
              <button type="button" data-rfq-status="${escapeAttr(status)}" data-rfq-id="${escapeAttr(draft.id)}">${escapeHtml(status)}</button>
            `).join("")}
          </div>
        </td>
      </tr>
    `).join("");
    if (empty) empty.hidden = filtered.length > 0;
  };

  if (statusFilter) {
    statusFilter.innerHTML = `<option value="all">Bütün statuslar</option>${statusList.map((status) => `<option value="${escapeAttr(status)}">${escapeHtml(status)}</option>`).join("")}`;
    statusFilter.addEventListener("change", render);
  }
  if (typeFilter) {
    typeFilter.innerHTML = `
      <option value="all">Bütün tiplər</option>
      ${Object.entries(typeLabels).map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join("")}
    `;
    typeFilter.addEventListener("change", render);
  }

  rows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rfq-status]");
    if (!button) return;
    const drafts = getDrafts().map((draft) => draft.id === button.dataset.rfqId
      ? { ...draft, status: button.dataset.rfqStatus }
      : draft);
    storage.write("constera-rfq-drafts", drafts);
    render();
  });

  render();
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
      <span>${escapeHtml(level)} səviyyə · ${area} m² baza · ${riskReserve} ehtiyat indeksi · qiymət RFQ ilə təsdiqlənir</span>
      <a class="button button-secondary" href="rfq.html?package=${encodeURIComponent(packageId)}">Paket RFQ-yə göndər</a>
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
initServiceCalculator();
initPackageCalculator();
initRentalCalculator();
initActions();
applyUrlFilters();
