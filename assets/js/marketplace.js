const marketplace = window.CONSTERA_MARKETPLACE || {
  categories: [],
  brands: [],
  suppliers: [],
  products: []
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

const renderAdmin = () => {
  const stats = document.querySelector("[data-admin-stats]");
  const productRows = document.querySelector("[data-admin-products]");
  const categoryRows = document.querySelector("[data-admin-categories]");

  if (stats) {
    stats.innerHTML = `
      <article class="stat-card"><span class="stat-value">${marketplace.categories.length}</span><p>kateqoriya</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.brands.length}</span><p>brend</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.suppliers.length}</span><p>təchizatçı</p></article>
      <article class="stat-card"><span class="stat-value">${marketplace.products.length}</span><p>məhsul</p></article>
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
};

const initRfq = () => {
  const form = document.querySelector("[data-rfq-form]");
  const output = document.querySelector("[data-rfq-output]");
  const productSelect = document.querySelector("[data-product-select]");
  if (!form || !output || !productSelect) return;

  productSelect.innerHTML = `
    <option value="">Məhsul seçin</option>
    ${marketplace.products.map((product) => `<option value="${escapeAttr(product.id)}">${escapeHtml(product.name)}</option>`).join("")}
  `;

  const params = new URLSearchParams(window.location.search);
  const productId = params.get("product");
  if (productId && marketplace.products.some((product) => product.id === productId)) {
    productSelect.value = productId;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const selectedProduct = marketplace.products.find((product) => product.id === data.get("product"));
    const rfq = {
      product: selectedProduct?.name || data.get("customProduct"),
      quantity: data.get("quantity"),
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
      <small>Bu demo versiyada sorğu brauzerdə saxlanır. Server hissəsi qoşulanda avtomatik təchizatçılara göndəriləcək.</small>
    `;
  });
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
renderAdmin();
initRfq();
initActions();
applyUrlFilters();
