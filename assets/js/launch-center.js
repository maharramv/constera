(function initConsteraLaunchCenter() {
  if (document.body.dataset.page !== "admin" || !window.ConstEraAPI) return;

  const api = window.ConstEraAPI;
  const qs = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const formatMoney = (value, currency = "AZN") => value === null || value === undefined
    ? "Sorğu əsasında"
    : Number(value).toLocaleString("az-AZ", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    });
  const formatDate = (value) => {
    const date = new Date(value || "");
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("az-AZ", { dateStyle: "medium", timeStyle: "short" }).format(date)
      : "Yoxlanmayıb";
  };
  const safeHttpsUrl = (value) => {
    try {
      const url = new URL(String(value || "").trim());
      return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "";
    } catch {
      return "";
    }
  };
  const setStatus = (selector, message, type = "info") => {
    const element = qs(selector);
    if (!element) return;
    element.textContent = message;
    element.dataset.type = type;
  };
  const setBusy = (button, busy, label = "Gözlə...") => {
    if (!button) return;
    if (busy) {
      button.dataset.previousLabel = button.textContent;
      button.textContent = label;
    } else if (button.dataset.previousLabel) {
      button.textContent = button.dataset.previousLabel;
    }
    button.disabled = busy;
  };
  const openTab = (name) => {
    const button = qs(`[data-admin-tab="${CSS.escape(name)}"]`);
    button?.click();
    button?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  };

  const state = {
    launch: null,
    pilotResult: null,
    products: [],
    mediaRows: [],
    selectedSupplierId: ""
  };

  const readinessLabels = {
    ready: "İstehsala hazır",
    attention: "Tövsiyələr var",
    blocked: "Bloklayıcılar var"
  };
  const providerLabels = {
    payment: "Kart ödənişi",
    bankTransfer: "Bank köçürməsi",
    electronicInvoice: "Elektron qaimə",
    logistics: "Logistika provayderi",
    aiEstimate: "AI smeta",
    email: "E-poçt",
    whatsapp: "WhatsApp"
  };
  const supplierStepTargets = {
    company: "users",
    profile: "suppliers",
    account: "users",
    contract: "operations",
    offer: "b2b",
    media: "media",
    feed: "system"
  };
  const pilotCheckTargets = {
    offer: "b2b",
    price: "b2b",
    freshness: "b2b",
    stock: "b2b",
    minimum_order: "b2b",
    source: "products",
    media: "media",
    contract: "operations",
    logistics: "b2b",
    logistics_tariff: "b2b",
    payment: "overview",
    invoice: "operations"
  };
  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
  const downloadCsv = (filename, rows) => {
    const source = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    const url = URL.createObjectURL(new Blob([source], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const datedFilename = (prefix) => `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;

  const renderSupplierWizard = () => {
    const suppliers = state.launch?.suppliers || [];
    const select = qs("[data-launch-supplier-select]");
    const steps = qs("[data-launch-supplier-steps]");
    if (!select || !steps) return;
    if (!suppliers.some((item) => item.id === state.selectedSupplierId)) {
      state.selectedSupplierId = suppliers[0]?.id || "";
    }
    select.innerHTML = suppliers.map((supplier) => `
      <option value="${escapeHtml(supplier.id)}"${supplier.id === state.selectedSupplierId ? " selected" : ""}>${escapeHtml(supplier.name)} · ${Number(supplier.onboarding?.score || 0)}%</option>
    `).join("") || '<option value="">Təchizatçı yoxdur</option>';
    select.disabled = suppliers.length === 0;
    const supplier = suppliers.find((item) => item.id === state.selectedSupplierId);
    const website = safeHttpsUrl(supplier?.website);
    const contact = supplier?.contact || "Rəsmi əlaqə məlumatı tamamlanmayıb";
    steps.innerHTML = supplier ? `
      <div class="admin-v2-section-heading">
        <div><strong>${escapeHtml(supplier.name)}</strong><small>${escapeHtml(contact)}</small></div>
        ${website ? `<a class="table-action" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">Rəsmi saytı aç</a>` : ""}
      </div>
      ${(supplier.onboarding?.checks || []).map((item, index) => `
      <article class="${item.ready ? "is-ready" : ""}">
        <div><strong>${index + 1}. ${escapeHtml(item.label)}</strong><small>${item.ready ? "Tamamlanıb" : item.required ? "Pilot üçün tələb olunur" : "Tövsiyə olunur"}</small></div>
        <button class="table-action" type="button" data-launch-target="${escapeHtml(supplierStepTargets[item.key] || "launch")}">${item.ready ? "Bax" : "Tamamla"}</button>
      </article>
      `).join("") || "<p>Qoşulma mərhələsi tapılmadı.</p>"}
    ` : "<p>Qoşulma mərhələsi tapılmadı.</p>";
  };

  const renderLaunch = () => {
    const data = state.launch;
    if (!data) return;
    const readiness = data.readiness || {};
    const metrics = data.metrics || {};
    const score = qs("[data-launch-score]");
    if (score) {
      score.textContent = `${Number(readiness.score || 0)}%`;
      score.dataset.tone = readiness.status === "ready"
        ? "good"
        : readiness.status === "attention" ? "warning" : "critical";
    }
    setStatus(
      "[data-launch-status]",
      `${readinessLabels[readiness.status] || "Hazırlıq hesablandı"} · ${Number(readiness.blockerCount || 0)} bloklayıcı · ${Number(readiness.warningCount || 0)} tövsiyə`,
      readiness.status === "ready" ? "success" : readiness.status === "attention" ? "warning" : "error"
    );

    const kpis = qs("[data-launch-kpis]");
    if (kpis) kpis.innerHTML = [
      [metrics.eligibleProducts, "tam hazır məhsul"],
      [metrics.eligibleOffers, "aktual real təklif"],
      [metrics.onboardedSuppliers, "tam qoşulmuş təchizatçı"],
      [metrics.logisticsZones, "logistika zonası"],
      [metrics.orders, "real sifariş"],
      [metrics.paidOrders, "ödənilmiş sifariş"],
      [metrics.issuedInvoices, "verilmiş qaimə"],
      [metrics.shippedFulfillments, "göndərilmiş icra"]
    ].map(([value, label]) => `
      <article><strong>${Number(value || 0).toLocaleString("az-AZ")}</strong><span>${escapeHtml(label)}</span></article>
    `).join("");

    const sections = qs("[data-launch-sections]");
    if (sections) sections.innerHTML = (readiness.sections || []).map((section) => `
      <section class="launch-readiness-section">
        <header>
          <strong>${escapeHtml(section.label)}</strong>
          <span>${Number(section.ready || 0)} / ${Number(section.total || 0)}</span>
        </header>
        <div>
          ${(section.items || []).map((item) => `
            <button type="button" data-launch-target="${escapeHtml(item.target || "launch")}" class="${item.ready ? "is-ready" : item.required ? "is-blocked" : "is-warning"}">
              <span>
                <strong>${escapeHtml(item.label)}</strong>
                <small>${escapeHtml(item.detail)}</small>
              </span>
              <em>${item.ready ? "Hazır" : item.required ? "Bloklayır" : "Tövsiyə"}</em>
            </button>
          `).join("")}
        </div>
      </section>
    `).join("");

    const priorities = readiness.priorities || [];
    const priorityList = qs("[data-launch-priorities]");
    if (priorityList) priorityList.innerHTML = priorities.map((item, index) => `
      <article>
        <span>${index + 1}</span>
        <div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></div>
        <button class="table-action" type="button" data-launch-target="${escapeHtml(item.target || "launch")}">${escapeHtml(item.action || "Aç")}</button>
      </article>
    `).join("") || "<p>Bloklayıcı və açıq tövsiyə yoxdur.</p>";
    const priorityCount = qs("[data-launch-priority-count]");
    if (priorityCount) priorityCount.textContent = `${priorities.length} addım`;

    const releaseQueue = data.releaseQueue || { items: [], summary: {} };
    const dailyPlan = releaseQueue.dailyPlan || {};
    const dailyItems = [...(dailyPlan.today || []), ...(dailyPlan.thisWeek || []).slice(0, 4)];
    const daily = qs("[data-launch-daily-plan]");
    if (daily) daily.innerHTML = dailyItems.map((item) => `
      <article data-severity="${escapeHtml(item.severity || "medium")}">
        <span>${Number(item.value || 0).toLocaleString("az-AZ")}</span>
        <div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.owner || "Administrator")} · ${item.due === "today" ? "bu gün" : "bu həftə"} · ${escapeHtml(item.detail)}</small></div>
        <button class="table-action" type="button" data-launch-target="${escapeHtml(item.target || "launch")}">${escapeHtml(item.action || "Aç")}</button>
      </article>
    `).join("") || "<p>Bu gün üçün daxili əməliyyat qalmayıb. Xarici sübut növbəsini izləyin.</p>";
    const dailyCount = qs("[data-launch-daily-count]");
    if (dailyCount) dailyCount.textContent = `${Number(releaseQueue.summary?.today || 0)} bu gün · ${Number(releaseQueue.summary?.external || 0)} sübut gözləyir`;
    const queue = qs("[data-launch-queue]");
    if (queue) queue.innerHTML = (releaseQueue.items || []).map((item) => `
      <article data-severity="${escapeHtml(item.severity || "medium")}">
        <span>${Number(item.value || 0).toLocaleString("az-AZ")}</span>
        <div>
          <strong>${escapeHtml(item.label)}</strong>
          <small>${escapeHtml(item.detail)}${item.external ? " · Xarici məlumat tələb olunur." : ""}</small>
        </div>
        <button class="table-action" type="button" data-launch-target="${escapeHtml(item.target || "launch")}">${escapeHtml(item.action || "Aç")}</button>
      </article>
    `).join("") || "<p>Açıq buraxılış addımı yoxdur.</p>";
    const queueCount = qs("[data-launch-queue-count]");
    if (queueCount) {
      const summary = releaseQueue.summary || {};
      queueCount.textContent = `${Number(summary.total || 0)} addım · ${Number(summary.critical || 0)} kritik · ${Number(summary.external || 0)} xarici`;
    }

    const operationCards = qs("[data-launch-operations]");
    if (operationCards) operationCards.innerHTML = [
      [metrics.pendingPriceReviews, "qiymət yoxlaması"],
      [metrics.pendingBankTransfers, "bank köçürməsi"],
      [metrics.readyFulfillments, "göndərişə hazır"],
      [metrics.issuedInvoices, "verilmiş qaimə"]
    ].map(([value, label]) => `
      <article><strong>${Number(value || 0).toLocaleString("az-AZ")}</strong><span>${escapeHtml(label)}</span></article>
    `).join("");

    const providers = qs("[data-launch-providers]");
    if (providers) providers.innerHTML = Object.entries(data.providers || {}).map(([key, ready]) => `
      <div><span>${escapeHtml(providerLabels[key] || key)}</span><strong class="${ready ? "is-ready" : "is-pending"}">${ready ? "Hazır" : "Qurulmayıb"}</strong></div>
    `).join("");

    const marketing = qs("[data-launch-marketing]");
    if (marketing) marketing.innerHTML = `
      <div><span>Google Analytics 4</span><strong class="${data.marketing?.analytics ? "is-ready" : "is-pending"}">${data.marketing?.analytics ? "Server inteqrasiyası hazırdır" : "Vercel açarları tələb olunur"}</strong></div>
      <div><span>Google Search Console</span><strong class="${data.marketing?.searchConsole ? "is-ready" : "is-pending"}">${data.marketing?.searchConsole ? "Təsdiq meta-teqi hazırdır" : "Təsdiq tokeni tələb olunur"}</strong></div>
      <div><span>Google Merchant feed</span><a class="source-link" href="${escapeHtml(data.marketing?.merchantFeedUrl || "/api/merchant-feed")}" target="_blank" rel="noopener noreferrer">Feed-i aç</a></div>
      <div><span>Sitemap</span><a class="source-link" href="${escapeHtml(data.marketing?.sitemapUrl || "/sitemap.xml")}" target="_blank" rel="noopener noreferrer">Sitemap-i aç</a></div>
    `;

    const sales = data.sales || {};
    const dailySales = sales.daily || [];
    const orderCount = dailySales.reduce((sum, item) => sum + Number(item.orders || 0), 0);
    const gross = dailySales.reduce((sum, item) => sum + Number(item.gross || 0), 0);
    const paid = dailySales.reduce((sum, item) => sum + Number(item.paid || 0), 0);
    const salesKpis = qs("[data-launch-sales-kpis]");
    if (salesKpis) salesKpis.innerHTML = [
      [orderCount.toLocaleString("az-AZ"), "sifariş"],
      [formatMoney(gross), "dövriyyə"],
      [formatMoney(paid), "ödənilib"],
      [formatMoney(orderCount ? gross / orderCount : 0), "orta sifariş"]
    ].map(([value, label]) => `<article><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`).join("");
    const chart = qs("[data-launch-sales-chart]");
    if (chart) {
      const recent = dailySales.slice(-14);
      const maximum = Math.max(1, ...recent.map((item) => Number(item.gross || 0)));
      chart.innerHTML = recent.map((item) => {
        const date = new Date(item.day);
        const label = Number.isFinite(date.getTime())
          ? new Intl.DateTimeFormat("az-AZ", { day: "2-digit", month: "short" }).format(date)
          : String(item.day || "");
        const height = Number(item.gross || 0) ? Math.max(8, Math.round(Number(item.gross) / maximum * 100)) : 3;
        return `<div title="${escapeHtml(`${label}: ${formatMoney(item.gross)}`)}"><span style="height:${height}%"></span><small>${escapeHtml(label)}</small></div>`;
      }).join("");
    }
    const topProducts = qs("[data-launch-top-products]");
    if (topProducts) topProducts.innerHTML = (sales.topProducts || []).slice(0, 5).map((item) => `
      <article><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.sku)} · ${Number(item.quantity || 0).toLocaleString("az-AZ")} vahid</small></div><span>${escapeHtml(formatMoney(item.revenue))}</span></article>
    `).join("") || "<p>Satış məlumatı hələ yoxdur.</p>";
    const topSuppliers = qs("[data-launch-top-suppliers]");
    if (topSuppliers) topSuppliers.innerHTML = (sales.topSuppliers || []).slice(0, 5).map((item) => `
      <article><div><strong>${escapeHtml(item.name)}</strong><small>${Number(item.orderCount || 0)} sifariş · ${Number(item.quantity || 0).toLocaleString("az-AZ")} vahid</small></div><span>${escapeHtml(formatMoney(item.revenue))}</span></article>
    `).join("") || "<p>Satış məlumatı hələ yoxdur.</p>";

    const searches = data.catalogControl?.searches || [];
    const totalSearches = searches.reduce((sum, item) => sum + Number(item.searches || 0), 0);
    const zeroSearches = searches.reduce((sum, item) => sum + Number(item.zeroResults || 0), 0);
    const convertedSearches = searches.reduce((sum, item) => sum + Number(item.convertedSearches || 0), 0);
    const searchKpis = qs("[data-launch-search-kpis]");
    if (searchKpis) searchKpis.innerHTML = [
      [totalSearches, "axtarış"],
      [searches.length, "fərqli sorğu"],
      [zeroSearches, "nəticəsiz"],
      [totalSearches ? `${Math.round(convertedSearches / totalSearches * 100)}%` : "0%", "məhsula keçid"]
    ].map(([value, label]) => `<article><strong>${escapeHtml(typeof value === "number" ? value.toLocaleString("az-AZ") : value)}</strong><span>${escapeHtml(label)}</span></article>`).join("");
    const topSearches = qs("[data-launch-top-searches]");
    if (topSearches) topSearches.innerHTML = [...searches]
      .sort((left, right) => Number(right.searches || 0) - Number(left.searches || 0))
      .slice(0, 6)
      .map((item) => `
        <article><div><strong>${escapeHtml(item.query)}</strong><small>${Number(item.convertedSearches || 0)} məhsula keçid · orta ${item.averageResults ?? "—"} nəticə</small></div><span>${Number(item.searches || 0)}</span></article>
      `).join("") || "<p>Axtarış məlumatı hələ toplanmayıb.</p>";
    const zeroResultList = qs("[data-launch-zero-searches]");
    if (zeroResultList) zeroResultList.innerHTML = searches
      .filter((item) => Number(item.zeroResults || 0) > 0)
      .sort((left, right) => Number(right.zeroResults || 0) - Number(left.zeroResults || 0))
      .slice(0, 6)
      .map((item) => `
        <article><div><strong>${escapeHtml(item.query)}</strong><small>Son axtarış: ${escapeHtml(formatDate(item.lastSearchedAt))}</small></div><span>${Number(item.zeroResults || 0)}</span></article>
      `).join("") || "<p>Nəticəsiz axtarış qeydə alınmayıb.</p>";

    const dataKpis = qs("[data-launch-data-kpis]");
    if (dataKpis) dataKpis.innerHTML = [
      [metrics.structuredAttributeProducts, "standart atributlu"],
      [metrics.sourcedProducts, "mənbəli məhsul"],
      [metrics.licensedMediaProducts, "lisenziyalı media"],
      [metrics.publishedReviews, "yayımlanmış rəy"]
    ].map(([value, label]) => `
      <article><strong>${Number(value || 0).toLocaleString("az-AZ")}</strong><span>${escapeHtml(label)}</span></article>
    `).join("");
    const backupState = qs("[data-launch-backup-state]");
    if (backupState) {
      const verification = data.backup?.verification || {};
      const latest = data.backup?.latest || {};
      backupState.innerHTML = `
        <div><span>Backup kanalı</span><strong class="${data.backup?.ready ? "is-ready" : "is-pending"}">${escapeHtml(data.backup?.label || "Qurulmayıb")}</strong></div>
        <div><span>Son bütövlük yoxlaması</span><strong class="${verification.ready ? "is-ready" : "is-pending"}">${escapeHtml(formatDate(verification.createdAt))}</strong></div>
        <div><span>Yoxlanmış həcm</span><strong>${Number(latest.tableCount || 0)} cədvəl · ${Number(latest.recordCount || 0).toLocaleString("az-AZ")} qeyd</strong></div>
        <div><span>Kritik 2FA siyasəti</span><strong class="${metrics.criticalTwoFactorEnforced ? "is-ready" : "is-pending"}">${metrics.criticalTwoFactorEnforced ? "Aktiv" : "Aktiv deyil"}</strong></div>
        <div><span>Monitor nasazlıq xəbərdarlığı</span><strong class="${data.monitoring?.externalAlert ? "is-ready" : "is-pending"}">${data.monitoring?.externalAlert ? "Xarici kanal hazırdır" : "Yalnız Vercel loqu"}</strong></div>
      `;
    }

    const supplierRows = qs("[data-launch-suppliers]");
    const suppliers = data.suppliers || [];
    renderSupplierWizard();
    if (supplierRows) supplierRows.innerHTML = suppliers.map((supplier) => {
      const missing = (supplier.onboarding?.checks || []).filter((item) => !item.ready);
      const website = safeHttpsUrl(supplier.website);
      return `<tr>
        <td data-label="Təchizatçı"><strong>${website ? `<a class="source-link" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(supplier.name)}</a>` : escapeHtml(supplier.name)}</strong><small>${escapeHtml([supplier.region, supplier.contact].filter(Boolean).join(" · ") || "Əlaqə tamamlanmayıb")}</small></td>
        <td data-label="Hazırlıq"><strong>${Number(supplier.onboarding?.score || 0)}%</strong><small>${supplier.onboarding?.readyForPilot ? "Pilot üçün hazırdır" : "Tamamlanmalıdır"}</small></td>
        <td data-label="Məhsul / təklif">${Number(supplier.productCount || 0)} / ${Number(supplier.offerCount || 0)}<small>${Number(supplier.eligibleOfferCount || 0)} aktual təklif · ${Number(supplier.licensedMediaCount || 0)} media</small></td>
        <td data-label="Çatışmayan mərhələlər"><div class="admin-v2-quality-issues">${missing.map((item) => `<span>${escapeHtml(item.label)}</span>`).join("") || "<span>Tamdır</span>"}</div></td>
        <td data-label="Əməliyyat"><button class="table-action" type="button" data-launch-target="${missing.some((item) => item.key === "contract") ? "operations" : missing.some((item) => item.key === "media") ? "media" : missing.some((item) => item.key === "feed") ? "system" : "b2b"}">Düzəlt</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="5">Təchizatçı tapılmadı.</td></tr>';
    const supplierCount = qs("[data-launch-supplier-count]");
    if (supplierCount) supplierCount.textContent = `${suppliers.length} təchizatçı`;

    const candidateSelect = qs("[data-launch-pilot-candidate]");
    const candidates = data.pilotSelections || data.pilotCandidates || [];
    if (candidateSelect) {
      const current = candidateSelect.value;
      candidateSelect.innerHTML = candidates.map((item, index) => `
        <option value="${index}">${item.ready ? "Hazır" : `${Number(item.missing?.length || 0)} blok`} · ${escapeHtml(item.name)} · ${escapeHtml(item.supplierName)} · ${escapeHtml(formatMoney(item.unitPrice, item.currency))}</option>
      `).join("") || '<option value="">Yoxlanacaq aktual təklif yoxdur</option>';
      candidateSelect.disabled = candidates.length === 0;
      if (candidates[Number(current)]) candidateSelect.value = current;
      const submit = qs("[data-launch-pilot-form] button[type='submit']");
      if (submit) submit.disabled = candidates.length === 0;
    }
    const selectionStatus = qs("[data-launch-pilot-selection-status]");
    if (selectionStatus) {
      const readyCount = candidates.filter((item) => item.ready).length;
      selectionStatus.textContent = candidates.length
        ? `${candidates.length} stoklu və aktual real təklif yoxlanıla bilər · ${readyCount} təklif bütün blokları keçib.`
        : "Stoklu və son 30 gündə təsdiqlənmiş real təklif tapılmadı.";
      selectionStatus.dataset.type = readyCount ? "success" : candidates.length ? "warning" : "error";
    }

    const fulfillments = data.readyFulfillments || [];
    const fulfillmentList = qs("[data-launch-fulfillments]");
    if (fulfillmentList) fulfillmentList.innerHTML = fulfillments.map((item) => `
      <article>
        <div>
          <strong>Sifariş #${Number(item.orderNumber)} · ${escapeHtml(item.supplierName)}</strong>
          <small>${escapeHtml(item.city)} · ${escapeHtml(formatMoney(item.totalAmount, item.currency))} · ödəniş: ${escapeHtml(item.paymentStatus)}</small>
        </div>
        ${data.providers?.logistics
          ? `<button class="table-action" type="button" data-launch-create-shipment="${escapeHtml(item.id)}">Provayderə göndər</button>`
          : '<button class="table-action" type="button" data-launch-target="operations">Çatdırılmanı aç</button>'}
      </article>
    `).join("") || "<p>Provayderə göndərilməyə hazır sifariş icrası yoxdur.</p>";
    const fulfillmentCount = qs("[data-launch-fulfillment-count]");
    if (fulfillmentCount) fulfillmentCount.textContent = `${fulfillments.length} göndəriş`;

    const pilotHistory = qs("[data-launch-pilot-history]");
    if (pilotHistory) pilotHistory.innerHTML = (data.pilotHistory || []).slice(0, 6).map((item) => `
      <article><div><strong>${escapeHtml(item.productName || item.sku || "Pilot yoxlaması")}</strong><small>${escapeHtml(item.actor)} · ${escapeHtml(formatDate(item.createdAt))} · ${Number(item.blockerCount || 0)} blok</small></div><span class="status-pill ${item.ready ? "is-success" : "is-danger"}">${item.ready ? "Keçib" : "Bloklanıb"}</span></article>
    `).join("") || "<p>Pilot yoxlaması tarixçəsi hələ yoxdur.</p>";
  };

  const renderPilotResult = () => {
    const result = state.pilotResult;
    const container = qs("[data-launch-pilot-result]");
    if (!container) return;
    if (!result) {
      container.innerHTML = "";
      return;
    }
    const blockers = (result.checks || []).filter((item) => item.required && !item.ready);
    container.innerHTML = `
      <header>
        <div>
          <strong>${result.ready ? "Pilot axını hazırdır" : "Pilot axınında bloklayıcı var"}</strong>
          <small>${escapeHtml(result.product.name)} · ${Number(result.product.quantity).toLocaleString("az-AZ")} vahid</small>
        </div>
        <span class="status-pill ${result.ready ? "is-success" : "is-danger"}">${result.writePerformed ? "Bazaya yazılıb" : "Bazaya yazılmayıb"}</span>
      </header>
      <div class="launch-pilot-money">
        <span><small>Aralıq məbləğ</small><strong>${escapeHtml(formatMoney(result.subtotal, result.product.currency))}</strong></span>
        <span><small>Çatdırılma</small><strong>${escapeHtml(formatMoney(result.delivery.amount, result.delivery.currency))}</strong></span>
        <span><small>Yekun</small><strong>${escapeHtml(formatMoney(result.total, result.product.currency))}</strong></span>
      </div>
      <div class="launch-pilot-checks">
        ${(result.checks || []).map((item) => `<span class="${item.ready ? "is-ready" : item.required ? "is-blocked" : "is-warning"}">${escapeHtml(item.label)}</span>`).join("")}
      </div>
      ${blockers.length ? `<div class="launch-pilot-actions">
        ${blockers.map((item) => `<button class="table-action" type="button" data-launch-target="${escapeHtml(pilotCheckTargets[item.key] || "launch")}">${escapeHtml(item.label)} düzəlt</button>`).join("")}
      </div>` : ""}
      ${result.nextUrl ? `<a class="button button-secondary" href="${escapeHtml(result.nextUrl)}">Məhsul axınını aç</a>` : ""}
    `;
  };

  const loadLaunch = async () => {
    const result = await api.launchCenter();
    state.launch = result.data;
    renderLaunch();
    renderPilotResult();
  };

  const exportLaunchReport = () => {
    const data = state.launch;
    if (!data) {
      setStatus("[data-launch-status]", "Əvvəlcə buraxılış məlumatlarını yüklə.", "warning");
      return;
    }
    const rows = [[
      "supplier_id", "supplier_name", "website", "contact", "company_id", "tax_id", "onboarding_score",
      "company_ready", "profile_ready", "account_ready", "contract_ready", "offer_ready",
      "media_ready", "feed_ready", "next_required_step"
    ]];
    for (const supplier of data.suppliers || []) {
      const checks = new Map((supplier.onboarding?.checks || []).map((item) => [item.key, item]));
      const next = (supplier.onboarding?.checks || []).find((item) => item.required && !item.ready);
      rows.push([
        supplier.id,
        supplier.name,
        supplier.website,
        supplier.contact,
        supplier.companyId,
        supplier.taxId,
        Number(supplier.onboarding?.score || 0),
        checks.get("company")?.ready ? "ready" : "missing",
        checks.get("profile")?.ready ? "ready" : "missing",
        checks.get("account")?.ready ? "ready" : "missing",
        checks.get("contract")?.ready ? "ready" : "missing",
        checks.get("offer")?.ready ? "ready" : "missing",
        checks.get("media")?.ready ? "ready" : "missing",
        checks.get("feed")?.ready ? "ready" : "optional",
        next?.label || "Pilot üçün hazır"
      ]);
    }
    downloadCsv(datedFilename("constera-supplier-launch-report"), rows);
    setStatus("[data-launch-status]", "Təchizatçı buraxılış hesabatı endirildi.", "success");
  };

  const exportPilotMediaTemplate = () => {
    const candidates = state.launch?.pilotSelections || state.launch?.pilotCandidates || [];
    const rows = [[
      "sku", "image_url", "source_url", "alt_text", "license_type", "license_note", "is_primary"
    ]];
    for (const item of candidates) {
      if (!item.sourceImageUrl || item.hasLicensedMedia) continue;
      rows.push([
        item.sku,
        item.sourceImageUrl,
        item.sourceUrl,
        item.name,
        "",
        "",
        "true"
      ]);
    }
    if (rows.length === 1) {
      setStatus("[data-launch-status]", "Pilot təkliflərində media təsdiqi gözləyən şəkil tapılmadı.", "warning");
      return;
    }
    downloadCsv(datedFilename("constera-pilot-media-rights"), rows);
    setStatus(
      "[data-launch-status]",
      `${rows.length - 1} media sətri endirildi. İstifadə hüququ və icazə qeydi təsdiqdən sonra doldurulmalıdır.`,
      "success"
    );
  };

  const exportDailyPlan = () => {
    const queue = state.launch?.releaseQueue;
    if (!queue) return;
    const rows = [["deadline", "workstream", "owner", "severity", "count", "task", "detail", "external_evidence"]];
    for (const item of queue.items || []) rows.push([
      item.due,
      item.workstream,
      item.owner,
      item.severity,
      item.value,
      item.label,
      item.detail,
      item.external ? "yes" : "no"
    ]);
    downloadCsv(datedFilename("constera-daily-launch-plan"), rows);
    setStatus("[data-launch-status]", "Gündəlik əməliyyat planı endirildi.", "success");
  };

  qs("[data-launch-refresh]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, "Yenilənir...");
    try {
      await loadLaunch();
    } catch (error) {
      setStatus("[data-launch-status]", error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });
  qs("[data-launch-export-report]")?.addEventListener("click", exportLaunchReport);
  qs("[data-launch-export-media]")?.addEventListener("click", exportPilotMediaTemplate);
  qs("[data-launch-export-daily]")?.addEventListener("click", exportDailyPlan);
  qs("[data-launch-run-daily]")?.addEventListener("click", async (event) => {
    if (!window.confirm("Qiymət köhnəlməsi, təchizatçı xatırlatmaları və kataloq keyfiyyəti indi yoxlanılsın? Əməliyyat audit jurnalına yazılacaq.")) return;
    const button = event.currentTarget;
    setBusy(button, true, "Yoxlanılır...");
    try {
      const result = await api.runLaunchDailyChecks();
      state.launch = result.data.launch;
      renderLaunch();
      setStatus(
        "[data-launch-status]",
        `${result.data.run.prices.createdRequests} yeni qiymət yoxlaması · ${result.data.run.reminders.remindedRequests} xatırlatma · ${result.data.run.quality.openIssues} açıq keyfiyyət qeydi.`,
        "success"
      );
      window.dispatchEvent(new CustomEvent("constera:admin-refresh"));
    } catch (error) {
      setStatus("[data-launch-status]", error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });
  qs("[data-launch-supplier-select]")?.addEventListener("change", (event) => {
    state.selectedSupplierId = event.target.value;
    renderSupplierWizard();
  });

  qs("[data-admin-panel='launch']")?.addEventListener("click", async (event) => {
    const shipmentButton = event.target.closest("[data-launch-create-shipment]");
    if (shipmentButton) {
      const fulfillment = state.launch?.readyFulfillments?.find((item) => item.id === shipmentButton.dataset.launchCreateShipment);
      if (!fulfillment) return;
      if (!window.confirm(`Sifariş #${fulfillment.orderNumber} üzrə ${fulfillment.supplierName} göndərişi real logistika provayderinə ötürülsün?`)) return;
      setBusy(shipmentButton, true, "Göndərilir...");
      try {
        const result = await api.createProviderShipment(fulfillment.id);
        setStatus(
          "[data-launch-status]",
          `Göndəriş yaradıldı: ${result.data.provider} · ${result.data.trackingCode}.`,
          "success"
        );
        await loadLaunch();
        window.dispatchEvent(new CustomEvent("constera:admin-refresh"));
      } catch (error) {
        setStatus("[data-launch-status]", error.message, "error");
      } finally {
        setBusy(shipmentButton, false);
      }
      return;
    }
    const button = event.target.closest("[data-launch-target]");
    if (button) openTab(button.dataset.launchTarget);
  });

  qs("[data-launch-pilot-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const candidates = state.launch?.pilotSelections || state.launch?.pilotCandidates || [];
    const candidate = candidates[Number(form.elements.candidate.value)];
    if (!candidate) {
      setStatus("[data-launch-status]", "Pilot üçün yoxlanacaq aktual real təklif tapılmadı.", "warning");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, "Yoxlanılır...");
    try {
      const result = await api.validatePilotOrder({
        productId: candidate.productId,
        offerId: candidate.offerId,
        quantity: form.elements.quantity.value,
        city: form.elements.city.value,
        deliveryMode: form.elements.deliveryMode.value,
        paymentMethod: form.elements.paymentMethod.value
      });
      state.pilotResult = result.data;
      renderPilotResult();
      setStatus(
        "[data-launch-status]",
        result.data.ready
          ? "Pilot axını bütün məcburi yoxlamalardan keçdi. İstehsal bazasında heç bir qeyd yaradılmadı."
          : "Pilot axınında bloklayıcılar tapıldı. Nəticə aşağıda göstərilir.",
        result.data.ready ? "success" : "warning"
      );
    } catch (error) {
      setStatus("[data-launch-status]", error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });

  const fold = (value) => String(value || "")
    .trim()
    .toLocaleLowerCase("az-AZ")
    .replace(/ə/g, "e")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "");

  const parseCsvMatrix = (source) => {
    const text = String(source || "").replace(/^\uFEFF/, "").trim();
    if (!text) return [];
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const delimiter = firstLine.includes("\t")
      ? "\t"
      : (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
    const matrix = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const next = text[index + 1];
      if (character === "\"" && quoted && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (character === "\"") {
        quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        row.push(cell.trim());
        cell = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && next === "\n") index += 1;
        row.push(cell.trim());
        if (row.some(Boolean)) matrix.push(row);
        row = [];
        cell = "";
      } else {
        cell += character;
      }
    }
    row.push(cell.trim());
    if (row.some(Boolean)) matrix.push(row);
    return matrix;
  };

  const normalizeObject = (item) => Object.entries(item || {}).reduce((result, [key, value]) => {
    result[fold(key)] = value;
    return result;
  }, {});

  const parseMediaSource = (source) => {
    const text = String(source || "").replace(/^\uFEFF/, "").trim();
    if (!text) return [];
    if (/^[\[{]/.test(text)) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("JSON strukturu düzgün deyil.");
      }
      const rows = Array.isArray(parsed)
        ? parsed
        : ["media", "items", "rows", "data"].map((key) => parsed?.[key]).find(Array.isArray) || [];
      return rows.filter((item) => item && typeof item === "object" && !Array.isArray(item)).map(normalizeObject);
    }
    const matrix = parseCsvMatrix(text);
    if (matrix.length < 2) return [];
    const headers = matrix[0].map(fold);
    return matrix.slice(1).map((cells) => headers.reduce((item, header, index) => {
      item[header] = cells[index] || "";
      return item;
    }, {}));
  };

  const aliases = {
    sku: ["sku", "mehsulkodu", "kod"],
    url: ["imageurl", "sekilurl", "fotourl", "url"],
    sourceUrl: ["sourceurl", "menbeurl", "mehsulurl", "source"],
    altText: ["alttext", "tesvir", "alternativmetn", "ad"],
    licenseType: ["licensetype", "huquq", "license", "istifadehuququ"],
    licenseNote: ["licensenote", "huquqqeydi", "icaze", "qeyd"],
    isPrimary: ["isprimary", "esas", "primary", "esassekil"]
  };
  const readAlias = (row, key) => {
    const alias = aliases[key].find((candidate) => Object.prototype.hasOwnProperty.call(row, candidate));
    return alias ? row[alias] : "";
  };
  const parseBoolean = (value) => ["1", "true", "yes", "beli", "hə", "he", "esas"].includes(fold(value));
  const normalizeLicense = (value) => {
    const key = fold(value || "reference");
    if (["reference", "referans", "menbe"].includes(key)) return "reference";
    if (["official", "resmi", "istehsalci"].includes(key)) return "official";
    if (["supplier", "techizatci"].includes(key)) return "supplier";
    if (["licensed", "lisenziyali", "lisenziya"].includes(key)) return "licensed";
    if (["own", "constera", "oz"].includes(key)) return "own";
    return "";
  };
  const safeHttps = safeHttpsUrl;

  const validateMediaRows = async (source) => {
    if (!state.products.length) {
      state.products = ((await api.myProducts()).data || []).filter((item) => item.status !== "archived");
    }
    const rows = parseMediaSource(source);
    if (!rows.length) throw new Error("CSV və ya JSON daxilində məlumat sətri tapılmadı.");
    if (rows.length > 200) throw new Error("Bir dəfəyə maksimum 200 media sətri yoxlanıla bilər.");
    const productsBySku = new Map(state.products.map((product) => [fold(product.sku), product]));
    const seen = new Set();
    const primaryBySku = new Set();
    return rows.map((row, index) => {
      const sku = String(readAlias(row, "sku") || "").trim();
      const product = productsBySku.get(fold(sku));
      const url = safeHttps(readAlias(row, "url"));
      const sourceUrl = safeHttps(readAlias(row, "sourceUrl"));
      const licenseType = normalizeLicense(readAlias(row, "licenseType"));
      const licenseNote = String(readAlias(row, "licenseNote") || "").trim();
      const isPrimary = parseBoolean(readAlias(row, "isPrimary"));
      const errors = [];
      const duplicateKey = `${fold(sku)}:${url}`;
      if (!sku) errors.push("SKU boşdur");
      else if (!product) errors.push("SKU kataloqda tapılmadı");
      if (!url) errors.push("Şəkil URL-i təhlükəsiz HTTPS deyil");
      if (!sourceUrl) errors.push("Mənbə URL-i təhlükəsiz HTTPS deyil");
      if (!licenseType) errors.push("İstifadə hüququ tanınmadı");
      if (["supplier", "licensed"].includes(licenseType) && !licenseNote) errors.push("Hüquq qeydi tələb olunur");
      if (seen.has(duplicateKey)) errors.push("Sətir təkrarlanır");
      if (isPrimary && primaryBySku.has(fold(sku))) errors.push("Eyni SKU üçün yalnız bir əsas şəkil seçilə bilər");
      seen.add(duplicateKey);
      if (isPrimary) primaryBySku.add(fold(sku));
      return {
        rowNumber: index + 2,
        sku,
        product,
        url,
        sourceUrl,
        altText: String(readAlias(row, "altText") || product?.name || "").trim().slice(0, 240),
        licenseType,
        licenseNote,
        isPrimary,
        errors,
        status: errors.length ? "invalid" : "ready",
        message: errors.join("; ")
      };
    });
  };

  const renderMediaPreview = () => {
    const body = qs("[data-media-bulk-preview-rows]");
    const wrap = qs("[data-media-bulk-preview-wrap]");
    const commit = qs("[data-media-bulk-commit]");
    if (!body || !wrap || !commit) return;
    wrap.hidden = state.mediaRows.length === 0;
    body.innerHTML = state.mediaRows.map((item) => `
      <tr>
        <td data-label="Sətir">${Number(item.rowNumber)}</td>
        <td data-label="Məhsul"><strong>${escapeHtml(item.product?.name || item.sku || "Naməlum")}</strong><small>${escapeHtml(item.sku)}</small></td>
        <td data-label="Şəkil">${item.url ? `<a class="source-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">URL-i aç</a>` : "Yanlışdır"}</td>
        <td data-label="Hüquq">${escapeHtml(item.licenseType || "Dəqiqləşməyib")}<small>${escapeHtml(item.licenseNote || "")}</small></td>
        <td data-label="Nəticə"><span class="status-pill ${item.status === "success" ? "is-success" : item.status === "failed" || item.status === "invalid" ? "is-danger" : ""}">${item.status === "success" ? "Qeyd edildi" : item.status === "failed" ? "Uğursuz" : item.status === "invalid" ? "Səhv" : "Hazır"}</span><small>${escapeHtml(item.message || "")}</small></td>
      </tr>
    `).join("");
    commit.disabled = !state.mediaRows.some((item) => item.status === "ready");
  };

  const readMediaInput = async () => {
    const form = qs("[data-media-bulk-form]");
    if (!form) return "";
    const file = form.elements.file.files?.[0];
    if (file) {
      const source = await file.text();
      form.elements.source.value = source;
      return source;
    }
    return form.elements.source.value;
  };

  const previewMedia = async (button) => {
    setBusy(button, true, "Yoxlanılır...");
    try {
      state.mediaRows = await validateMediaRows(await readMediaInput());
      renderMediaPreview();
      const valid = state.mediaRows.filter((item) => item.status === "ready").length;
      const invalid = state.mediaRows.length - valid;
      setStatus(
        "[data-media-bulk-status]",
        `${valid} sətir qeydiyyata hazırdır, ${invalid} sətirdə düzəliş tələb olunur.`,
        invalid ? "warning" : "success"
      );
    } catch (error) {
      state.mediaRows = [];
      renderMediaPreview();
      setStatus("[data-media-bulk-status]", error.message, "error");
    } finally {
      setBusy(button, false);
    }
  };

  qs("[data-media-bulk-preview]")?.addEventListener("click", (event) => previewMedia(event.currentTarget));
  qs("[data-media-bulk-form] input[type='file']")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    const form = event.currentTarget.form;
    if (!file || !form) return;
    form.elements.source.value = await file.text();
    setStatus("[data-media-bulk-status]", `${file.name} oxundu. Ön baxışla məlumatları yoxla.`, "info");
  });
  qs("[data-media-bulk-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = qs("[data-media-bulk-commit]");
    const queue = state.mediaRows.filter((item) => item.status === "ready");
    if (!queue.length) {
      setStatus("[data-media-bulk-status]", "Əvvəlcə uyğun sətirləri ön baxışda yoxla.", "warning");
      return;
    }
    if (!window.confirm(`${queue.length} media referansı təhlükəsizlik yoxlamasından keçirilərək hüquq baxışına göndərilsin?`)) return;
    setBusy(button, true, "Qeyd edilir...");
    let cursor = 0;
    let succeeded = 0;
    let failed = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const item = queue[cursor];
        cursor += 1;
        try {
          await api.registerExternalMedia({
            entityType: "product",
            entityId: item.product.id,
            url: item.url,
            sourceUrl: item.sourceUrl,
            altText: item.altText,
            licenseType: item.licenseType,
            licenseNote: item.licenseNote,
            isPrimary: item.isPrimary
          });
          item.status = "success";
          item.message = "Şəkil yoxlanıldı, istifadə hüququ baxışı gözləyir";
          succeeded += 1;
        } catch (error) {
          item.status = "failed";
          item.message = error.message;
          failed += 1;
        }
        renderMediaPreview();
        setStatus("[data-media-bulk-status]", `${succeeded + failed}/${queue.length} sətir emal edildi.`, failed ? "warning" : "info");
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
      setStatus(
        "[data-media-bulk-status]",
        `${succeeded} media hüquq baxışına göndərildi, ${failed} sətir uğursuz oldu.`,
        failed ? "warning" : "success"
      );
      window.dispatchEvent(new CustomEvent("constera:media-updated"));
      await loadLaunch().catch(() => null);
    } finally {
      setBusy(button, false);
      renderMediaPreview();
    }
  });

  const init = async () => {
    try {
      const session = await api.session();
      if (!session.user || !["super_admin", "admin"].includes(session.user.role)) return;
      await loadLaunch();
    } catch (error) {
      setStatus("[data-launch-status]", error.message || "Buraxılış Mərkəzi yüklənmədi.", "error");
    }
  };

  window.addEventListener("constera:admin-refresh", () => loadLaunch().catch(() => null));
  init();
})();
