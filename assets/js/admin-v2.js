(function initConsteraAdminV2() {
  if (document.body.dataset.page !== "admin" || !window.ConstEraAPI) return;

  const api = window.ConstEraAPI;
  const state = {
    session: null,
    analytics: null,
    categories: [],
    users: [],
    rfqs: [],
    tenders: [],
    tenderBids: [],
    orders: [],
    crm: null,
    rentalBookings: [],
    media: [],
    notifications: [],
    imports: [],
    staging: [],
    audit: [],
    supplierApplications: [],
    priceMonitor: null,
    account: null,
    qualityProduct: null,
    managedProducts: [],
    managedSuppliers: [],
    productOffers: [],
    logisticsZones: [],
    procurementRequests: [],
    twoFactorSetupToken: "",
    recoveryCodes: []
  };

  const qs = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const formatDate = (value, withTime = false) => {
    if (!value) return "-";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("az-AZ", withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" }).format(date);
  };
  const setText = (selector, value) => {
    const element = qs(selector);
    if (element) element.textContent = value;
  };
  const setStatus = (selector, message, type = "info") => {
    const element = qs(selector);
    if (!element) return;
    element.textContent = message;
    element.dataset.type = type;
  };
  const roleLabels = {
    super_admin: "Super administrator",
    admin: "Administrator",
    sales: "Satış",
    supplier: "Təchizatçı",
    customer: "Müştəri"
  };
  const tenderStatusLabels = {
    draft: "Qaralama",
    published: "Dərc olunub",
    evaluation: "Qiymətləndirmə",
    awarded: "Qalib seçilib",
    closed: "Bağlanıb",
    cancelled: "Ləğv edilib"
  };
  const orderStatusLabels = {
    submitted: "Göndərilib",
    confirmed: "Təsdiqlənib",
    processing: "Hazırlanır",
    shipped: "Çatdırılır",
    completed: "Tamamlanıb",
    cancelled: "Ləğv edilib"
  };
  const paymentStatusLabels = {
    pending: "Gözləyir",
    awaiting: "Ödəniş gözləyir",
    paid: "Ödənilib",
    failed: "Uğursuz",
    refunded: "Geri qaytarılıb"
  };
  const crmStageLabels = {
    new: "Yeni",
    qualified: "Dəqiqləşdirilib",
    proposal: "Təklif",
    won: "Qazanılıb",
    lost: "İtirilib"
  };
  const rentalStatusLabels = {
    requested: "Müraciət",
    quoted: "Qiymət verilib",
    confirmed: "Təsdiqlənib",
    active: "İcarədədir",
    completed: "Tamamlanıb",
    cancelled: "Ləğv edilib"
  };
  const rentalTransitions = {
    requested: ["quoted", "cancelled"],
    quoted: ["confirmed", "cancelled"],
    confirmed: ["active", "cancelled"],
    active: ["completed", "cancelled"],
    completed: [],
    cancelled: []
  };
  const allowedOrderTransitions = {
    submitted: ["confirmed", "cancelled"],
    confirmed: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["completed"],
    completed: [],
    cancelled: []
  };
  const kindLabels = { material: "Material", service: "Xidmət", package: "Paket", rental: "İcarə" };
  const actionLabels = {
    create: "Yaratdı",
    update: "Yenilədi",
    archive: "Arxivlədi",
    import: "İdxal etdi",
    upload: "Yüklədi",
    login: "Daxil oldu",
    logout: "Çıxış etdi",
    setup: "Quraşdırdı",
    export: "İxrac etdi",
    queue: "Növbəyə əlavə etdi",
    process: "Emal etdi",
    change_password: "Şifrəni dəyişdi",
    reset_password: "Şifrəni sıfırladı",
    status_update: "Statusu dəyişdi",
    bulk_sync: "Sinxronlaşdırdı",
    catalog_review: "Kataloq qeydini yoxladı",
    approve: "Təsdiqlədi",
    reject: "Rədd etdi",
    remind: "Xatırlatdı",
    scan: "Yoxladı",
    cancel: "Ləğv etdi"
  };

  const setButtonBusy = (button, busy, label = "Gözlə...") => {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = label;
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
    }
    button.disabled = busy;
  };

  const activateAdminTab = (name) => {
    const target = [...document.querySelectorAll("[data-admin-panel]")]
      .some((panel) => panel.dataset.adminPanel === name) ? name : "overview";
    document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== target;
    });
    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
      const active = button.dataset.adminTab === target;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    try {
      localStorage.setItem("constera-admin-active-tab", target);
    } catch {
      // Tab seçiminin yadda saxlanması könüllüdür.
    }
  };
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => activateAdminTab(button.dataset.adminTab));
  });
  try {
    activateAdminTab(localStorage.getItem("constera-admin-active-tab") || "overview");
  } catch {
    activateAdminTab("overview");
  }

  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Fayl oxuna bilmədi."));
    reader.readAsDataURL(file);
  });

  const optimizeMediaFile = async (file) => {
    if (!["image/jpeg", "image/png"].includes(file.type) || !window.createImageBitmap) {
      return { file, filename: file.name, contentType: file.type };
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
      if (!blob || (blob.size >= file.size && file.size <= 3_000_000)) {
        return { file, filename: file.name, contentType: file.type };
      }
      return {
        file: blob,
        filename: file.name.replace(/\.[^.]+$/, "") + ".webp",
        contentType: "image/webp"
      };
    } catch {
      return { file, filename: file.name, contentType: file.type };
    }
  };

  const downloadJson = (filename, value) => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderAnalytics = () => {
    const data = state.analytics;
    const kpis = qs("[data-admin-v2-kpis]");
    if (!data || !kpis) return;
    const counts = data.counts || {};
    const cards = [
      [counts.products, "aktiv məhsul"],
      [counts.categories, "əsas kateqoriya"],
      [counts.subcategories, "subkateqoriya"],
      [counts.suppliers, "təchizatçı"],
      [counts.product_offers, "məhsul təklifi"],
      [counts.rfqs, "qiymət sorğusu"],
      [counts.orders, "sifariş"],
      [counts.tenders, "tender"],
      [counts.crm_leads, "CRM lead"],
      [counts.active_rental_bookings, "aktiv icarə"],
      [counts.pending_payments, "gözləyən ödəniş"],
      [counts.pending_procurement, "satınalma təsdiqi"],
      [counts.logistics_zones, "logistika zonası"],
      [counts.users, "aktiv istifadəçi"],
      [counts.pending_supplier_applications, "gözləyən tərəfdaş"],
      [counts.pending_price_reviews, "qiymət yoxlaması"],
      [counts.pending_notifications, "gözləyən bildiriş"]
    ];
    kpis.innerHTML = cards.map(([value, label]) => `
      <article><strong>${Number(value || 0).toLocaleString("az-AZ")}</strong><span>${escapeHtml(label)}</span></article>
    `).join("");

    const totalPrices = (data.prices || []).reduce((sum, item) => sum + Number(item.count || 0), 0) || 1;
    const priceLabels = { confirmed: "Təsdiqli", request: "Sorğu əsasında", expired: "Vaxtı keçib" };
    const prices = qs("[data-admin-v2-prices]");
    if (prices) prices.innerHTML = (data.prices || []).map((item) => {
      const percent = Math.round((Number(item.count || 0) / totalPrices) * 100);
      const label = priceLabels[item.status] || item.status;
      return `<div><span><strong>${escapeHtml(label)}</strong><small>${item.count} · ${percent}%</small></span><progress max="100" value="${percent}" aria-label="${escapeHtml(label)}: ${percent}%"></progress></div>`;
    }).join("") || "<p>Məlumat yoxdur.</p>";

    const quality = data.quality || {};
    const qualitySummary = quality.summary || {};
    const qualityTotal = Number(qualitySummary.total || 0);
    const qualityScore = Math.max(0, Math.min(100, Number(quality.score || 0)));
    const qualityScoreNode = qs("[data-admin-v2-quality-score]");
    if (qualityScoreNode) {
      qualityScoreNode.textContent = `${qualityScore}%`;
      qualityScoreNode.dataset.tone = qualityScore >= 85 ? "good" : qualityScore >= 65 ? "warning" : "critical";
    }
    setText(
      "[data-admin-v2-quality-summary]",
      `${qualityTotal.toLocaleString("az-AZ")} real satış qeydi · ${Number(qualitySummary.offerTotal || 0).toLocaleString("az-AZ")} təchizatçı təklifi · ${Number(qualitySummary.productsWithoutOffers || 0).toLocaleString("az-AZ")} təklifsiz məhsul`
    );
    const qualityMetrics = [
      ["Real foto", "missingImage", qualityTotal],
      ["Media istifadə hüququ", "missingLicensedMedia", qualityTotal],
      ["Məhsul mənbəyi", "missingSource", qualityTotal],
      ["Texniki məlumat", "missingSpecs", qualityTotal],
      ["Dəqiq brend", "missingBrand", qualityTotal],
      ["Düzgün kateqoriya", "missingCategory", qualityTotal],
      ["Təklif mənbəyi", "offerMissingSource", Number(qualitySummary.offerTotal || 0)],
      ["Aktual təklif qiyməti", "offerStalePrice", Number(qualitySummary.offerTotal || 0)],
      ["Təklif stoku", "offerUnknownStock", Number(qualitySummary.offerTotal || 0)]
    ];
    const qualityBars = qs("[data-admin-v2-quality-bars]");
    if (qualityBars) qualityBars.innerHTML = qualityMetrics.map(([label, key, metricTotal]) => {
      const missing = Number(qualitySummary[key] || 0);
      const complete = Math.max(0, metricTotal - missing);
      const percent = metricTotal ? Math.round((complete / metricTotal) * 100) : 100;
      return `<div><span><strong>${escapeHtml(label)}</strong><small>${complete.toLocaleString("az-AZ")} / ${metricTotal.toLocaleString("az-AZ")} · ${percent}%</small></span><progress max="100" value="${percent}" aria-label="${escapeHtml(label)}: ${percent}%"></progress></div>`;
    }).join("");

    const qualityItems = quality.items || [];
    setText("[data-admin-v2-quality-count]", `${qualityItems.length.toLocaleString("az-AZ")} prioritet qeyd`);
    const qualityBody = qs("[data-admin-v2-quality-items]");
    if (qualityBody) qualityBody.innerHTML = qualityItems.map((item) => `
      <tr>
        <td data-label="Məhsul"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.sku)}</small></td>
        <td data-label="Brend">${escapeHtml(item.brand || "Brendsiz")}</td>
        <td data-label="Problemlər"><div class="admin-v2-quality-issues">${(item.issues || []).map((issue) => `<span>${escapeHtml(issue)}</span>`).join("")}</div></td>
        <td data-label="Son yenilənmə">${formatDate(item.updatedAt, true)}</td>
        <td data-label="Əməliyyat"><button class="table-action" type="button" data-quality-edit="${escapeHtml(item.id)}">Düzəlt</button></td>
      </tr>
    `).join("") || '<tr><td colspan="5">Diqqət tələb edən real məhsul tapılmadı.</td></tr>';

    const integrationLabels = {
      database: "Neon PostgreSQL",
      blob: "Vercel Blob",
      emailWebhook: "E-poçt webhook-u",
      whatsappWebhook: "WhatsApp webhook-u",
      payment: "Kart ödənişi",
      bankTransfer: "Bank köçürməsi",
      electronicInvoice: "Elektron qaimə",
      logistics: "Logistika provayderi",
      aiEstimate: "Xarici AI smeta",
      scheduledBackup: "Gündəlik bulud backup-ı"
    };
    const integrations = qs("[data-admin-v2-integrations]");
    if (integrations) integrations.innerHTML = Object.entries(data.integrations || {}).map(([key, active]) => `
      <div><span>${escapeHtml(integrationLabels[key] || key)}</span><strong class="${active ? "is-ready" : "is-pending"}">${active ? "Hazır" : "Qurulmayıb"}</strong></div>
    `).join("");

    const money = (value) => Number(value || 0).toLocaleString("az-AZ", {
      style: "currency",
      currency: "AZN",
      maximumFractionDigits: 2
    });
    const commercial = data.commercial || {};
    const commercialNode = qs("[data-admin-v2-commercial]");
    if (commercialNode) commercialNode.innerHTML = [
      [money(commercial.orderGross), "sifariş dövriyyəsi"],
      [money(commercial.paidGross), "ödənilmiş dövriyyə"],
      [money(commercial.averageOrder), "orta sifariş"],
      [money(commercial.commissionRevenue), "hesablanmış komissiya"],
      [money(commercial.supplierNet), "təchizatçıya xalis"],
      [money(commercial.refundAmount), "geri ödəniş"],
      [commercial.paidOrders, "ödənilmiş sifariş"],
      [commercial.completedOrders, "tamamlanmış sifariş"]
    ].map(([value, label]) => `<article><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`).join("");

    const conversion = data.funnel?.conversion || {};
    const conversionNode = qs("[data-admin-v2-conversion]");
    if (conversionNode) conversionNode.innerHTML = [
      ["Məhsul baxışı → səbət", conversion.viewToCart, conversion.productViewSessions, conversion.cartSessions],
      ["Səbət → checkout", conversion.cartToCheckout, conversion.cartSessions, conversion.checkoutSessions],
      ["Checkout → sifariş", conversion.checkoutToOrder, conversion.checkoutSessions, conversion.orderSessions]
    ].map(([label, percent, start, finish]) =>
      `<div><span><strong>${escapeHtml(label)}</strong><small>${Number(finish || 0)} / ${Number(start || 0)} sessiya · ${Number(percent || 0)}%</small></span><progress max="100" value="${Math.min(100, Number(percent || 0))}" aria-label="${escapeHtml(label)}: ${Number(percent || 0)}%"></progress></div>`
    ).join("");

    const merchant = data.merchant || {};
    const merchantTotal = Number(merchant.total || 0);
    setText(
      "[data-admin-v2-merchant-summary]",
      `${Number(merchant.eligible || 0).toLocaleString("az-AZ")} / ${merchantTotal.toLocaleString("az-AZ")} məhsul feed üçün tam uyğundur.`
    );
    const merchantNode = qs("[data-admin-v2-merchant]");
    if (merchantNode) merchantNode.innerHTML = [
      ["Təsdiqli qiymət", merchant.confirmedPrice],
      ["30 günlük qiymət", merchant.freshPrice],
      ["Məlum stok", merchant.knownStock],
      ["HTTPS mənbə", merchant.httpsSource],
      ["Hüququ təsdiqli media", merchant.licensedMedia],
      ["Tam uyğun", merchant.eligible]
    ].map(([label, complete]) => {
      const percent = merchantTotal ? Math.round(Number(complete || 0) / merchantTotal * 100) : 100;
      return `<div><span><strong>${escapeHtml(label)}</strong><small>${Number(complete || 0).toLocaleString("az-AZ")} / ${merchantTotal.toLocaleString("az-AZ")} · ${percent}%</small></span><progress max="100" value="${percent}" aria-label="${escapeHtml(label)}: ${percent}%"></progress></div>`;
    }).join("");

    const feedHealth = data.feedHealth || {};
    const feedHealthNode = qs("[data-admin-v2-feed-health]");
    if (feedHealthNode) feedHealthNode.innerHTML = [
      [feedHealth.total, "aktiv feed"],
      [feedHealth.healthy, "sağlam"],
      [feedHealth.due, "iş vaxtı çatıb"],
      [feedHealth.failed, "xəta"]
    ].map(([value, label]) => `<article><strong>${Number(value || 0).toLocaleString("az-AZ")}</strong><span>${escapeHtml(label)}</span></article>`).join("");

    const activity = qs("[data-admin-v2-activity]");
    if (activity) activity.innerHTML = (data.recentActivity || []).map((item) => `
      <article><span>${escapeHtml(item.actor_name || "Sistem")}</span><strong>${escapeHtml(actionLabels[item.action] || item.action)}</strong><small>${escapeHtml(item.entity_type)} · ${formatDate(item.created_at, true)}</small></article>
    `).join("") || "<p>Son fəaliyyət yoxdur.</p>";
  };

  const renderB2b = () => {
    const b2bKpis = qs("[data-admin-b2b-kpis]");
    if (b2bKpis) {
      const confirmedOffers = state.productOffers.filter((offer) => offer.status === "active" && offer.priceStatus === "confirmed").length;
      const incompleteOffers = state.productOffers.filter((offer) => offer.status === "active" && (!offer.sourceUrl || offer.stockQuantity === null)).length;
      const pendingApprovals = state.procurementRequests.filter((request) => request.status === "pending").length;
      b2bKpis.innerHTML = [
        [state.productOffers.length, "məhsul təklifi"],
        [confirmedOffers, "təsdiqli qiymət"],
        [incompleteOffers, "yoxlama tələb edir"],
        [state.logisticsZones.filter((zone) => zone.active).length, "aktiv logistika zonası"],
        [pendingApprovals, "gözləyən təsdiq"]
      ].map(([value, label]) => `<article><strong>${Number(value).toLocaleString("az-AZ")}</strong><span>${escapeHtml(label)}</span></article>`).join("");
    }
    const offerForm = qs("[data-admin-product-offer-form]");
    const productSelect = qs("[data-admin-offer-product]");
    const supplierSelect = qs("[data-admin-offer-supplier]");
    if (productSelect) {
      const selected = productSelect.value;
      productSelect.innerHTML = state.managedProducts.map((product) => (
        `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} · ${escapeHtml(product.sku)}</option>`
      )).join("");
      if (state.managedProducts.some((product) => product.id === selected)) productSelect.value = selected;
    }
    if (supplierSelect) {
      const selected = supplierSelect.value;
      supplierSelect.innerHTML = state.managedSuppliers.map((supplier) => (
        `<option value="${escapeHtml(supplier.id)}">${escapeHtml(supplier.name)}</option>`
      )).join("");
      if (state.managedSuppliers.some((supplier) => supplier.id === selected)) supplierSelect.value = selected;
    }
    setText("[data-admin-offer-count]", `${state.productOffers.length.toLocaleString("az-AZ")} təklif`);
    const offerBody = qs("[data-admin-product-offers]");
    if (offerBody) offerBody.innerHTML = state.productOffers.slice(0, 250).map((offer) => {
      const issues = [
        !offer.sourceUrl ? "mənbəsiz" : "",
        offer.priceStatus === "confirmed" && (!offer.priceVerifiedAt || Date.now() - Date.parse(offer.priceVerifiedAt) > 30 * 86_400_000) ? "köhnə qiymət" : "",
        offer.stockQuantity === null ? "stok açıqdır" : ""
      ].filter(Boolean);
      return `<tr>
        <td data-label="Məhsul"><strong>${escapeHtml(offer.productName)}</strong><small>${escapeHtml(offer.productSku)}</small></td>
        <td data-label="Təchizatçı">${escapeHtml(offer.supplier)}</td>
        <td data-label="Qiymət"><strong>${offer.unitPrice === null ? "Sorğu əsasında" : Number(offer.unitPrice).toLocaleString("az-AZ", { style: "currency", currency: offer.currency || "AZN" })}</strong><small>${issues.join(" · ") || "məlumat tamdır"}</small></td>
        <td data-label="Stok">${offer.stockQuantity === null ? "Sorğu ilə" : Number(offer.stockQuantity).toLocaleString("az-AZ")}</td>
        <td data-label="Müddət">${offer.leadTimeDays === null ? "Sorğu ilə" : `${offer.leadTimeDays} gün`}</td>
        <td data-label="Əməliyyat"><div class="admin-actions"><button class="table-action" type="button" data-admin-offer-edit="${escapeHtml(offer.id)}">Düzəlt</button><button class="table-action is-danger" type="button" data-admin-offer-delete="${escapeHtml(offer.id)}">Arxivlə</button></div></td>
      </tr>`;
    }).join("") || '<tr><td colspan="6">Məhsul təklifi yoxdur.</td></tr>';

    setText("[data-admin-logistics-count]", `${state.logisticsZones.filter((zone) => zone.active).length} zona`);
    const zoneList = qs("[data-admin-logistics-zones]");
    if (zoneList) zoneList.innerHTML = state.logisticsZones.map((zone) => `<article class="cabinet-item">
      <header><strong>${escapeHtml(zone.name)}</strong><span class="mini-badge">${zone.active ? "Aktiv" : "Arxiv"}</span></header>
      <span>${escapeHtml(zone.cities.join(", ") || "Bütün Azərbaycan")} · ${zone.etaMinDays}-${zone.etaMaxDays} gün</span>
      <p>${Number(zone.baseFee).toLocaleString("az-AZ", { style: "currency", currency: "AZN" })} baza · ${zone.freeAbove === null ? "pulsuz hədd yoxdur" : `${Number(zone.freeAbove).toLocaleString("az-AZ")} AZN-dən pulsuz`}</p>
      <div class="cabinet-item-actions"><button class="table-action" type="button" data-admin-logistics-edit="${escapeHtml(zone.id)}">Düzəlt</button></div>
    </article>`).join("") || "<p>Logistika zonası yoxdur.</p>";

    setText("[data-admin-procurement-count]", `${state.procurementRequests.filter((request) => request.status === "pending").length} gözləyir`);
    const requestList = qs("[data-admin-procurement-list]");
    if (requestList) requestList.innerHTML = state.procurementRequests.map((request) => `<article class="cabinet-item">
      <header><strong>Sifariş #${escapeHtml(request.orderNumber)} · ${escapeHtml(request.companyName || "Şirkət")}</strong><span class="mini-badge">${escapeHtml(request.status)}</span></header>
      <span>${request.approvedCount}/${request.requiredApprovals} təsdiq · ${escapeHtml(request.costCenter || "Xərc mərkəzi yoxdur")}</span>
      <p>${request.budgetAmount === null ? "Büdcə limiti yoxdur" : Number(request.budgetAmount).toLocaleString("az-AZ", { style: "currency", currency: "AZN" })}</p>
      ${request.status === "pending" ? `<div class="cabinet-item-actions"><button class="table-action" type="button" data-admin-procurement-decision="${escapeHtml(request.id)}" data-decision="approved">Təsdiqlə</button><button class="table-action is-danger" type="button" data-admin-procurement-decision="${escapeHtml(request.id)}" data-decision="rejected">Rədd et</button></div>` : ""}
    </article>`).join("") || "<p>Satınalma təsdiqi yoxdur.</p>";

    if (offerForm && !offerForm.elements.productId.value && state.managedProducts[0]) {
      offerForm.elements.productId.value = state.managedProducts[0].id;
    }
  };

  const renderPriceMonitor = () => {
    const monitor = state.priceMonitor;
    if (!monitor) return;
    const summary = monitor.summary || {};
    setText(
      "[data-admin-price-monitor-summary]",
      `${Number(summary.pending || 0)} açıq yoxlama · ${Number(summary.overdue || 0)} gecikib · ${Number(summary.completed30Days || 0)} son 30 gündə tamamlanıb`
    );
    const kpis = qs("[data-admin-price-monitor-kpis]");
    if (kpis) {
      kpis.innerHTML = [
        [summary.pending, "açıq"],
        [summary.overdue, "gecikmiş"],
        [summary.dueSoon, "7 günə bitir"],
        [summary.completed30Days, "tamamlanıb"]
      ].map(([value, label]) => `<article><strong>${Number(value || 0).toLocaleString("az-AZ")}</strong><span>${escapeHtml(label)}</span></article>`).join("");
    }
    const body = qs("[data-admin-price-monitor-items]");
    if (!body) return;
    body.innerHTML = (monitor.items || []).map((item) => {
      const overdue = Number.isFinite(Date.parse(item.dueAt)) && new Date(item.dueAt).getTime() <= Date.now();
      return `<tr>
        <td data-label="Məhsul"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.sku)} · ${escapeHtml(item.price)}</small></td>
        <td data-label="Təchizatçı"><strong>${escapeHtml(item.supplier)}</strong><small>${escapeHtml(item.supplierContact || "Əlaqə yoxdur")}</small></td>
        <td data-label="Son təsdiq">${formatDate(item.priceVerifiedAt, true)}</td>
        <td data-label="Son tarix"><span class="status-pill${overdue ? " is-danger" : ""}">${formatDate(item.dueAt)}</span></td>
        <td data-label="Xatırlatma">${Number(item.reminderCount || 0)}<small>${formatDate(item.lastRemindedAt, true)}</small></td>
        <td data-label="Əməliyyat"><div class="admin-v2-row-actions"><button class="table-action" type="button" data-price-review-remind="${escapeHtml(item.id)}">Xatırlat</button><button class="table-action is-danger" type="button" data-price-review-cancel="${escapeHtml(item.id)}">Bağla</button></div></td>
      </tr>`;
    }).join("") || '<tr><td colspan="6">Açıq qiymət yoxlaması yoxdur.</td></tr>';
  };

  const renderSupplierApplications = () => {
    const applications = state.supplierApplications || [];
    setText("[data-admin-supplier-application-count]", `${applications.length.toLocaleString("az-AZ")} gözləyən`);
    const body = qs("[data-admin-supplier-applications]");
    if (!body) return;
    body.innerHTML = applications.map((item) => `<tr>
      <td data-label="Şirkət"><strong>${escapeHtml(item.companyName)}</strong><small>${escapeHtml(item.type)} · ${escapeHtml(item.region)}</small></td>
      <td data-label="Əlaqə"><strong>${escapeHtml(item.contactName)}</strong><small>${escapeHtml(item.email)} · ${escapeHtml(item.phone)}</small></td>
      <td data-label="VÖEN">${escapeHtml(item.taxId)}</td>
      <td data-label="İxtisaslaşma">${escapeHtml(item.focus)}</td>
      <td data-label="Sənəd">${item.documentUrl ? `<a class="source-link" href="${escapeHtml(item.documentUrl)}" target="_blank" rel="noopener noreferrer">Sənədi aç</a>` : "Təqdim edilməyib"}</td>
      <td data-label="Əməliyyat"><div class="admin-v2-row-actions"><button class="table-action" type="button" data-supplier-application-approve="${escapeHtml(item.id)}">Təsdiqlə</button><button class="table-action is-danger" type="button" data-supplier-application-reject="${escapeHtml(item.id)}">Rədd et</button></div></td>
    </tr>`).join("") || '<tr><td colspan="6">Gözləyən təchizatçı müraciəti yoxdur.</td></tr>';
  };

  const parentCategoryOptions = () => {
    const form = qs("[data-admin-v2-category-form]");
    const select = qs("[data-admin-v2-parent-category]");
    if (!form || !select) return;
    const kind = form.elements.kind.value;
    const current = select.value;
    select.innerHTML = `<option value="">Əsas kateqoriya</option>${state.categories
      .filter((item) => item.kind === kind && !item.parentId && item.active)
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join("")}`;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  };

  const renderCategories = () => {
    const tbody = qs("[data-admin-v2-categories]");
    if (!tbody) return;
    const filter = qs("[data-admin-v2-category-filter]")?.value || "all";
    const byId = new Map(state.categories.map((item) => [`${item.kind}:${item.id}`, item]));
    const rows = state.categories.filter((item) => filter === "all" || item.kind === filter);
    setText("[data-admin-v2-category-count]", `${rows.length.toLocaleString("az-AZ")} qeyd`);
    tbody.innerHTML = rows.map((item) => {
      const parent = item.parentId ? byId.get(`${item.kind}:${item.parentId}`) : null;
      return `<tr>
        <td data-label="Bölmə">${escapeHtml(kindLabels[item.kind] || item.kind)}</td>
        <td data-label="Kateqoriya"><strong>${item.parentId ? "↳ " : ""}${escapeHtml(item.title)}</strong><small>${escapeHtml(item.slug)}</small></td>
        <td data-label="Valideyn">${escapeHtml(parent?.title || "Əsas")}</td>
        <td data-label="Qrup">${escapeHtml(item.group)}</td>
        <td data-label="Qeyd">${Number(item.itemCount || 0).toLocaleString("az-AZ")}</td>
        <td data-label="Vəziyyət"><span class="status-pill">${item.active ? "Aktiv" : "Arxiv"}</span></td>
        <td data-label="Əməliyyat"><div class="admin-v2-row-actions"><button class="table-action" type="button" data-category-edit="${escapeHtml(item.kind)}:${escapeHtml(item.id)}">Redaktə</button>${item.active ? `<button class="table-action is-danger" type="button" data-category-archive="${escapeHtml(item.kind)}:${escapeHtml(item.id)}">Arxivlə</button>` : ""}</div></td>
      </tr>`;
    }).join("") || '<tr><td colspan="7">Kateqoriya tapılmadı.</td></tr>';
    parentCategoryOptions();
  };

  const clearCategoryForm = () => {
    const form = qs("[data-admin-v2-category-form]");
    if (!form) return;
    form.reset();
    form.elements.id.value = "";
    form.elements.kind.disabled = false;
    parentCategoryOptions();
  };

  const renderUsers = () => {
    const tbody = qs("[data-admin-v2-users]");
    if (!tbody) return;
    setText("[data-admin-v2-user-count]", `${state.users.length} istifadəçi`);
    tbody.innerHTML = state.users.map((user) => `<tr>
      <td data-label="İstifadəçi"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></td>
      <td data-label="Şirkət">${escapeHtml(user.companyName || "-")}</td>
      <td data-label="Rol">${escapeHtml(roleLabels[user.role] || user.role)}</td>
      <td data-label="Status"><span class="status-pill">${escapeHtml(user.status)}</span>${user.mustChangePassword ? "<small>Şifrə dəyişməlidir</small>" : ""}</td>
      <td data-label="Son giriş">${formatDate(user.lastLoginAt, true)}</td>
      <td data-label="Əməliyyat"><div class="admin-v2-row-actions"><button class="table-action" type="button" data-user-edit="${escapeHtml(user.id)}">Redaktə</button><button class="table-action" type="button" data-user-reset="${escapeHtml(user.id)}">Şifrəni sıfırla</button></div></td>
    </tr>`).join("") || '<tr><td colspan="6">İstifadəçi tapılmadı.</td></tr>';
  };

  const clearUserForm = () => {
    const form = qs("[data-admin-v2-user-form]");
    if (!form) return;
    form.reset();
    form.elements.id.value = "";
    form.elements.email.disabled = false;
  };

  const renderRequests = () => {
    const rfqBody = qs("[data-admin-v2-rfqs]");
    if (rfqBody) rfqBody.innerHTML = state.rfqs.map((item) => `<tr>
      <td data-label="Sorğu"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.rfq_type)} · ${formatDate(item.created_at, true)}</small></td>
      <td data-label="Şirkət">${escapeHtml(item.company_name)}</td>
      <td data-label="Əlaqə">${escapeHtml(item.contact)}</td>
      <td data-label="Status"><select class="table-select" data-rfq-status="${escapeHtml(item.id)}">${["Yeni", "Baxılır", "Təklif gözləyir", "Təklif alındı", "Bağlandı", "Ləğv edildi"].map((status) => `<option ${status === item.status ? "selected" : ""}>${status}</option>`).join("")}</select></td>
      <td data-label="Əməliyyat"><a class="table-action" href="rfq-dashboard.html">Aç</a></td>
    </tr>`).join("") || '<tr><td colspan="5">Qiymət sorğusu yoxdur.</td></tr>';

    const tenderBody = qs("[data-admin-v2-tenders]");
    if (tenderBody) tenderBody.innerHTML = state.tenders.map((item) => `<tr>
      <td data-label="Tender"><strong>${escapeHtml(item.title)}</strong><small>${formatDate(item.createdAt, true)}</small></td>
      <td data-label="Şirkət">${escapeHtml(item.companyName)}</td>
      <td data-label="Son tarix">${formatDate(item.deadline)}</td>
      <td data-label="Lot/təklif">${item.lots.length} / ${item.bidCount}</td>
      <td data-label="Status"><span class="status-pill">${escapeHtml(tenderStatusLabels[item.status] || item.status)}</span></td>
      <td data-label="Əməliyyat"><div class="admin-v2-row-actions">${item.orderId ? `<a class="table-action" href="order-detail.html?order=${encodeURIComponent(item.orderId)}">Sifariş #${escapeHtml(item.orderNumber || "")}</a>` : ""}<button class="table-action" type="button" data-tender-edit="${escapeHtml(item.id)}">Redaktə</button>${item.status !== "cancelled" && !item.orderId ? `<button class="table-action is-danger" type="button" data-tender-cancel="${escapeHtml(item.id)}">Ləğv et</button>` : ""}</div></td>
    </tr>`).join("") || '<tr><td colspan="6">Tender yoxdur.</td></tr>';

    const tenderBidBody = qs("[data-admin-v2-tender-bids]");
    if (tenderBidBody) tenderBidBody.innerHTML = state.tenderBids.map((bid) => `<tr>
      <td data-label="Tender"><strong>${escapeHtml(bid.tenderTitle || "-")}</strong><small>${formatDate(bid.createdAt, true)}</small></td>
      <td data-label="Təchizatçı">${escapeHtml(bid.supplierName || "-")}</td>
      <td data-label="Qiymət"><strong>${bid.priceAmount === null ? escapeHtml(bid.price || "Sorğu əsasında") : Number(bid.priceAmount).toLocaleString("az-AZ", { style: "currency", currency: bid.currency || "AZN" })}</strong></td>
      <td data-label="Çatdırılma">${escapeHtml(bid.delivery || "Dəqiqləşdirilməyib")}</td>
      <td data-label="Vəziyyət"><span class="status-pill">${escapeHtml(bid.status)}</span></td>
      <td data-label="Əməliyyat"><div class="admin-v2-row-actions">
        ${bid.orderId
          ? `<a class="table-action" href="order-detail.html?order=${encodeURIComponent(bid.orderId)}">Sifariş #${escapeHtml(bid.orderNumber || "")}</a>`
          : ["draft", "submitted"].includes(bid.status)
            ? `<button class="table-action" type="button" data-tender-bid-accept="${escapeHtml(bid.id)}">Qalib seç</button><button class="table-action is-danger" type="button" data-tender-bid-reject="${escapeHtml(bid.id)}">Rədd et</button>`
            : ""}
      </div></td>
    </tr>`).join("") || '<tr><td colspan="6">Tender təklifi yoxdur.</td></tr>';

    const orderBody = qs("[data-admin-v2-orders]");
    if (orderBody) orderBody.innerHTML = state.orders.map((item) => {
      const statusOptions = [item.status, ...(allowedOrderTransitions[item.status] || [])]
        .filter((value) => value !== "confirmed" || ["not_required", "approved"].includes(item.approvalStatus));
      const approvalLabel = {
        not_required: "Təsdiq tələb olunmur",
        pending: "Satınalma təsdiqi gözləyir",
        approved: "Satınalma təsdiqlənib",
        rejected: "Satınalma rədd edilib"
      }[item.approvalStatus] || item.approvalStatus;
      return `<tr>
      <td data-label="Sifariş"><strong>#${escapeHtml(item.orderNumber)}</strong><small>${formatDate(item.createdAt, true)}${item.rfqId ? " · RFQ-dən yaradılıb" : item.tenderId ? " · Tenderdən yaradılıb" : ""}</small></td>
      <td data-label="Şirkət və əlaqə"><strong>${escapeHtml(item.companyName)}</strong><small>${escapeHtml(item.contactName)} · ${escapeHtml(item.phone)}</small></td>
      <td data-label="Məhsul">${item.items.length}<small>${item.hasPendingPrice ? "Qiymət təsdiqi var" : "Qiymətlər təsdiqlidir"} · ${escapeHtml(approvalLabel)}</small></td>
      <td data-label="Məbləğ"><strong>${item.totalAmount === null ? "Sorğu əsasında" : Number(item.totalAmount).toLocaleString("az-AZ", { style: "currency", currency: item.currency })}</strong></td>
      <td data-label="Status"><select class="table-select" data-order-status="${escapeHtml(item.id)}">${statusOptions.map((value) => `<option value="${value}" ${value === item.status ? "selected" : ""}>${escapeHtml(orderStatusLabels[value] || value)}</option>`).join("")}</select></td>
      <td data-label="Ödəniş"><select class="table-select" data-order-payment="${escapeHtml(item.id)}">${Object.entries(paymentStatusLabels).map(([value, label]) => `<option value="${value}" ${value === item.paymentStatus ? "selected" : ""}>${label}</option>`).join("")}</select></td>
      <td data-label="Əməliyyat"><a class="table-action" href="order-detail.html?order=${encodeURIComponent(item.id)}">Tarixçə və sənəd</a></td>
    </tr>`;
    }).join("") || '<tr><td colspan="7">Sifariş yoxdur.</td></tr>';
  };

  const renderCommercial = () => {
    const crm = state.crm || { leads: [], stages: [], activities: [] };
    const stageGrid = qs("[data-admin-v2-crm-stages]");
    if (stageGrid) {
      stageGrid.innerHTML = ["new", "qualified", "proposal", "won", "lost"].map((stage) => {
        const metric = (crm.stages || []).find((item) => item.stage === stage) || {};
        return `<article><strong>${Number(metric.count || 0).toLocaleString("az-AZ")}</strong><span>${escapeHtml(crmStageLabels[stage])} · ${Number(metric.value || 0).toLocaleString("az-AZ", { maximumFractionDigits: 0 })} AZN</span></article>`;
      }).join("");
    }

    const leadBody = qs("[data-admin-v2-crm-leads]");
    if (leadBody) leadBody.innerHTML = (crm.leads || []).map((lead) => {
      const sourceHref = lead.sourceType === "order"
        ? `order-detail.html?order=${encodeURIComponent(lead.sourceId || "")}`
        : lead.sourceType === "rfq"
          ? "rfq-dashboard.html"
          : "";
      return `<tr>
        <td data-label="Lead"><strong>${escapeHtml(lead.title)}</strong><small>${formatDate(lead.updatedAt, true)}</small></td>
        <td data-label="Şirkət və əlaqə"><strong>${escapeHtml(lead.companyName)}</strong><small>${escapeHtml([lead.contactName, lead.phone, lead.email].filter(Boolean).join(" · "))}</small></td>
        <td data-label="Mənbə">${sourceHref ? `<a class="table-action" href="${sourceHref}">${escapeHtml(lead.sourceType)}</a>` : escapeHtml(lead.sourceType)}<small>${escapeHtml(lead.sourceId || "")}</small></td>
        <td data-label="Məbləğ">${lead.valueAmount === null ? "Dəqiqləşdirilir" : Number(lead.valueAmount).toLocaleString("az-AZ", { style: "currency", currency: lead.currency || "AZN" })}</td>
        <td data-label="Mərhələ"><select class="table-select" data-crm-stage="${escapeHtml(lead.id)}">${Object.entries(crmStageLabels).map(([value, label]) => `<option value="${value}" ${lead.stage === value ? "selected" : ""}>${label}</option>`).join("")}</select></td>
        <td data-label="Növbəti əlaqə">${formatDate(lead.nextActionAt, true)}<small>${escapeHtml(lead.ownerName || "Təyin edilməyib")}</small></td>
        <td data-label="Əməliyyat"><button class="table-action" type="button" data-crm-activity="${escapeHtml(lead.id)}">Fəaliyyət əlavə et</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="7">CRM lead yoxdur.</td></tr>';

    const bookingBody = qs("[data-admin-v2-rental-bookings]");
    if (bookingBody) bookingBody.innerHTML = state.rentalBookings.map((booking) => {
      const statusOptions = [booking.status, ...(rentalTransitions[booking.status] || [])];
      return `<tr data-rental-booking-row="${escapeHtml(booking.id)}">
        <td data-label="Avadanlıq"><strong>${escapeHtml(booking.rentalTitle)}</strong><small>${escapeHtml(booking.rentalId)} · ${booking.quantity} ədəd</small></td>
        <td data-label="Müştəri"><strong>${escapeHtml(booking.companyName)}</strong><small>${escapeHtml(booking.contactName)} · ${escapeHtml(booking.phone)}</small></td>
        <td data-label="Tarix"><strong>${formatDate(booking.startDate)} – ${formatDate(booking.endDate)}</strong><small>${escapeHtml(booking.city)} · ${escapeHtml(booking.address)}</small></td>
        <td data-label="Şərt">${escapeHtml(booking.operatorPreference)}<small>${booking.deliveryRequired ? "Çatdırılma ilə" : "Özü götürür"}</small></td>
        <td data-label="Qiymət"><input class="table-select" data-rental-quote type="number" min="0" step="0.01" value="${escapeHtml(booking.quotedAmount ?? "")}" aria-label="İcarə qiyməti" /><small>${escapeHtml(booking.currency || "AZN")}</small></td>
        <td data-label="Vəziyyət"><select class="table-select" data-rental-status>${statusOptions.map((value) => `<option value="${value}" ${booking.status === value ? "selected" : ""}>${escapeHtml(rentalStatusLabels[value] || value)}</option>`).join("")}</select></td>
        <td data-label="Əməliyyat"><button class="table-action" type="button" data-rental-booking-save="${escapeHtml(booking.id)}">Saxla</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="7">İcarə rezervasiyası yoxdur.</td></tr>';

    const activity = qs("[data-admin-v2-crm-activities]");
    if (activity) activity.innerHTML = (crm.activities || []).slice(0, 30).map((item) => `
      <article><span>${escapeHtml(item.actorName)}</span><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(item.leadTitle)} · ${formatDate(item.createdAt, true)}</small></article>
    `).join("") || "<p>CRM fəaliyyəti yoxdur.</p>";
  };

  const clearTenderForm = () => {
    const form = qs("[data-admin-v2-tender-form]");
    if (!form) return;
    form.reset();
    form.elements.id.value = "";
  };

  const fillMediaRightsForm = (id = "") => {
    const form = qs("[data-admin-v2-media-rights-form]");
    if (!form) return;
    const item = state.media.find((entry) => entry.id === (id || form.elements.id.value)) || state.media[0];
    if (!item) {
      form.reset();
      form.querySelector('button[type="submit"]').disabled = true;
      return;
    }
    form.querySelector('button[type="submit"]').disabled = false;
    form.elements.id.value = item.id;
    form.elements.licenseType.value = item.licenseType || "unspecified";
    form.elements.licenseNote.value = item.licenseNote || "";
    form.elements.rightsStatus.value = item.rightsStatus || "pending";
    form.elements.rightsExpiresOn.value = item.rightsExpiresOn ? String(item.rightsExpiresOn).slice(0, 10) : "";
    form.elements.rightsReviewNote.value = item.rightsReviewNote || "";
  };

  const renderMedia = () => {
    const grid = qs("[data-admin-v2-media]");
    if (!grid) return;
    setText("[data-admin-v2-media-count]", `${state.media.length} fayl`);
    const licenseLabels = { own: "ConstEra", supplier: "Təchizatçı", official: "Rəsmi media", licensed: "Lisenziyalı", reference: "Mənbə referansı", unspecified: "Hüquq qeyd edilməyib" };
    const rightsLabels = { pending: "Hüquq yoxlaması gözləyir", verified: "İstifadə hüququ təsdiqlənib", rejected: "İstifadə hüququ rədd edilib", expired: "İstifadə hüququ bitib" };
    const rightsSelect = qs("[data-admin-v2-media-rights-select]");
    if (rightsSelect) {
      const selected = rightsSelect.value;
      rightsSelect.innerHTML = state.media.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.filename)} · ${escapeHtml(rightsLabels[item.rightsStatus] || item.rightsStatus)}</option>`).join("");
      if (state.media.some((item) => item.id === selected)) rightsSelect.value = selected;
      fillMediaRightsForm(rightsSelect.value);
    }
    grid.innerHTML = state.media.map((item) => `<article>
      <div class="admin-v2-media-preview">${item.contentType.startsWith("image/") ? `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.altText || item.filename)}" loading="lazy" />` : '<span>PDF</span>'}</div>
      <div><strong>${item.isPrimary ? "Əsas · " : ""}${escapeHtml(item.filename)}</strong><small>${escapeHtml(item.entityType)}${item.entityId ? ` · ${escapeHtml(item.entityId)}` : ""}</small><small>${escapeHtml(licenseLabels[item.licenseType] || item.licenseType)} · ${item.provider === "external" ? "Xarici URL" : `${Math.round(item.sizeBytes / 1024)} KB`} · ${formatDate(item.createdAt)}</small><small>${escapeHtml(rightsLabels[item.rightsStatus] || item.rightsStatus)}${item.rightsVerifiedAt ? ` · ${formatDate(item.rightsVerifiedAt, true)}` : ""}</small></div>
      <div class="admin-v2-row-actions"><button class="table-action" type="button" data-media-review="${escapeHtml(item.id)}">Hüquqa bax</button><button class="table-action" type="button" data-media-copy="${escapeHtml(item.url)}">URL-ni köçür</button>${item.contentType.startsWith("image/") && item.entityId && !item.isPrimary ? `<button class="table-action" type="button" data-media-primary="${escapeHtml(item.id)}">Əsas et</button>` : ""}<button class="table-action is-danger" type="button" data-media-delete="${escapeHtml(item.id)}">Sil</button></div>
    </article>`).join("") || "<p>Yüklənmiş media yoxdur.</p>";
  };

  const stagingKind = (kind) => kind === "product" ? "material" : kind;
  const normalizedLabel = (value) => String(value || "").trim().toLocaleLowerCase("az-AZ");
  const stagingCategoryOptions = (item) => {
    const kind = stagingKind(item.kind);
    const categories = state.categories.filter((category) =>
      category.kind === kind && !category.parentId && category.active
    );
    const sourceCategory = normalizedLabel(item.payload?.category);
    return `<option value="">Kateqoriya seç</option>${categories.map((category) => {
      const selected = sourceCategory && normalizedLabel(category.title) === sourceCategory;
      return `<option value="${escapeHtml(category.id)}" ${selected ? "selected" : ""}>${escapeHtml(category.title)}</option>`;
    }).join("")}`;
  };

  const renderStaging = () => {
    const tbody = qs("[data-admin-v2-staging]");
    if (!tbody) return;
    setText("[data-admin-v2-staging-count]", `${state.staging.length} gözləyən`);
    tbody.innerHTML = state.staging.map((item) => {
      const payload = item.payload || {};
      const image = Array.isArray(payload.image_urls) ? payload.image_urls[0] : "";
      const sourceLabel = payload.source_label || item.sourceId;
      const price = payload.price_text || "Qiymət sorğu əsasında";
      const errors = Array.isArray(item.validationErrors) ? item.validationErrors : [];
      const existingNote = item.existingEntityId
        ? `<small class="admin-staging-warning">Mövcud SKU yenilənəcək: ${escapeHtml(item.existingEntityId)}</small>`
        : "";
      return `<tr data-staging-row="${escapeHtml(item.id)}">
        <td data-label="Qeyd"><div class="admin-staging-product">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" />` : '<span class="admin-staging-placeholder">Foto yoxdur</span>'}<div><strong>${escapeHtml(payload.name || "Adsız qeyd")}</strong><small>${escapeHtml(item.kind === "product" ? "Məhsul" : kindLabels[item.kind] || item.kind)}${payload.sku ? ` · ${escapeHtml(payload.sku)}` : ""}</small>${existingNote}${errors.length ? `<small>${escapeHtml(errors.join("; "))}</small>` : ""}</div></div></td>
        <td data-label="Mənbə"><a class="table-action" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceLabel)}</a><small>${formatDate(item.verifiedAt, true)}</small></td>
        <td data-label="Qiymət"><strong>${escapeHtml(price)}</strong>${payload.unit ? `<small>${escapeHtml(payload.unit)}</small>` : ""}</td>
        <td data-label="Yerləşdirmə"><div class="admin-staging-category"><select class="table-select" data-staging-category>${stagingCategoryOptions(item)}</select><input class="table-select" data-staging-subcategory value="${escapeHtml(payload.subcategory || "")}" aria-label="Subkateqoriya" placeholder="Subkateqoriya" /></div></td>
        <td data-label="Əməliyyat"><div class="admin-v2-row-actions"><button class="table-action" type="button" data-staging-approve>Təsdiqlə</button><button class="table-action is-danger" type="button" data-staging-reject>Rədd et</button></div></td>
      </tr>`;
    }).join("") || '<tr><td colspan="5">Yoxlama gözləyən kataloq qeydi yoxdur.</td></tr>';
  };

  const renderSystem = () => {
    const account = state.account;
    if (account) setStatus(
      "[data-admin-v2-account-status]",
      `${account.name} · ${roleLabels[account.role] || account.role} · ${account.activeSessions} aktiv sessiya${account.mustChangePassword ? " · şifrə dəyişdirilməlidir" : ""}`,
      account.mustChangePassword ? "warning" : "success"
    );
    const twoFactorBadge = qs("[data-admin-two-factor-badge]");
    const twoFactorStart = qs("[data-admin-two-factor-start]");
    const twoFactorManage = qs("[data-admin-two-factor-manage]");
    if (account && twoFactorBadge) {
      twoFactorBadge.textContent = account.twoFactorEnabled ? "Aktiv" : account.twoFactorReady ? "Söndürülüb" : "Server açarı tələb edir";
      twoFactorBadge.classList.toggle("is-real", account.twoFactorEnabled);
    }
    if (twoFactorStart) twoFactorStart.hidden = Boolean(account?.twoFactorEnabled) || !account?.twoFactorReady;
    if (twoFactorManage) twoFactorManage.hidden = !account?.twoFactorEnabled;
    if (account) setStatus(
      "[data-admin-two-factor-status]",
      account.twoFactorEnabled
        ? `2FA aktivdir · ${account.recoveryCodesRemaining} bərpa kodu qalıb.`
        : account.twoFactorReady
          ? "Authenticator tətbiqi ilə əlavə giriş qorumasını aktivləşdir."
          : "TWO_FACTOR_ENCRYPTION_KEY server dəyişəni qurulduqdan sonra aktiv olacaq.",
      account.twoFactorEnabled ? "success" : account.twoFactorReady ? "info" : "warning"
    );

    const notifications = qs("[data-admin-v2-notifications]");
    if (notifications) notifications.innerHTML = state.notifications.slice(0, 12).map((item) => `<article>
      <div><strong>${escapeHtml(item.subject || item.channel)}</strong><small>${escapeHtml(item.channel)} · ${escapeHtml(item.status)} · ${formatDate(item.created_at, true)}</small>${item.last_error ? `<small>${escapeHtml(item.last_error)}</small>` : ""}</div>
      ${["failed", "pending"].includes(item.status) ? `<button class="table-action" type="button" data-notification-retry="${escapeHtml(item.id)}">Yenidən sına</button>` : ""}
    </article>`).join("") || "<p>Bildiriş yoxdur.</p>";

    const imports = qs("[data-admin-v2-imports]");
    if (imports) imports.innerHTML = state.imports.slice(0, 12).map((item) => {
      const scraper = item.import_type === "scraper";
      const progress = scraper
        ? `${item.valid_rows}/${item.total_rows} yoxlama sahəsində`
        : `${item.imported_rows}/${item.total_rows} idxal`;
      return `<article><div><strong>${escapeHtml(item.filename || item.import_type)}</strong><small>${escapeHtml(scraper ? "Kataloq toplayıcısı" : item.import_type)} · ${escapeHtml(item.status)} · ${escapeHtml(progress)}</small></div><small>${formatDate(item.created_at, true)}</small></article>`;
    }).join("") || "<p>İdxal tarixçəsi yoxdur.</p>";

    renderStaging();

    const audit = qs("[data-admin-v2-audit]");
    if (audit) audit.innerHTML = state.audit.slice(0, 100).map((item) => `<tr>
      <td data-label="Vaxt">${formatDate(item.created_at, true)}</td>
      <td data-label="İstifadəçi"><strong>${escapeHtml(item.actor_name || "Sistem")}</strong><small>${escapeHtml(item.actor_email || "")}</small></td>
      <td data-label="Əməliyyat">${escapeHtml(actionLabels[item.action] || item.action)}</td>
      <td data-label="Obyekt">${escapeHtml(item.entity_type)}<small>${escapeHtml(item.entity_id || "")}</small></td>
      <td data-label="Təfərrüat"><small>${escapeHtml(JSON.stringify(item.details || {})).slice(0, 180)}</small></td>
    </tr>`).join("") || '<tr><td colspan="5">Audit qeydi yoxdur.</td></tr>';
  };

  const loadDashboard = async () => {
    const [result, monitor] = await Promise.all([api.analytics(), api.priceMonitor()]);
    state.analytics = result.data;
    state.priceMonitor = monitor.data;
    renderAnalytics();
    renderPriceMonitor();
    setStatus("[data-admin-v2-status]", `Canlı göstəricilər ${formatDate(result.data.generatedAt, true)} tarixində yeniləndi.`, "success");
  };

  const loadCategories = async () => {
    state.categories = (await api.categories()).data || [];
    renderCategories();
    renderStaging();
  };
  const loadUsers = async () => {
    state.users = (await api.users()).data || [];
    renderUsers();
  };
  const loadSupplierApplications = async () => {
    state.supplierApplications = (await api.supplierApplications("pending")).data || [];
    renderSupplierApplications();
  };
  const loadRequests = async () => {
    const [rfqs, tenders, tenderBids, orders] = await Promise.all([
      api.rfqs(),
      api.tenders(),
      api.tenderBids(),
      api.orders()
    ]);
    state.rfqs = rfqs.data || [];
    state.tenders = tenders.data || [];
    state.tenderBids = tenderBids.data || [];
    state.orders = orders.data || [];
    renderRequests();
  };
  const loadB2b = async () => {
    const [products, suppliers, offers, zones, procurement] = await Promise.all([
      api.myProducts(),
      api.suppliers(),
      api.managedProductOffers(),
      api.logisticsZones(true),
      api.procurement()
    ]);
    state.managedProducts = (products.data || []).filter((product) => product.status !== "archived");
    state.managedSuppliers = suppliers.data || [];
    state.productOffers = offers.data || [];
    state.logisticsZones = zones.data || [];
    state.procurementRequests = procurement.data || [];
    renderB2b();
  };
  const loadCommercial = async () => {
    const [crm, bookings] = await Promise.all([api.crm(), api.rentalBookings()]);
    state.crm = crm.data;
    state.rentalBookings = bookings.data || [];
    renderCommercial();
  };
  const loadMedia = async () => {
    state.media = (await api.media()).data || [];
    renderMedia();
  };
  const loadSystem = async () => {
    const results = await Promise.allSettled([
      api.account(),
      api.notifications(),
      api.imports(),
      api.catalogStaging(),
      api.audit()
    ]);
    if (results[0].status === "fulfilled") state.account = results[0].value.data;
    if (results[1].status === "fulfilled") state.notifications = results[1].value.data || [];
    if (results[2].status === "fulfilled") state.imports = results[2].value.data || [];
    if (results[3].status === "fulfilled") state.staging = results[3].value.data || [];
    if (results[4].status === "fulfilled") state.audit = results[4].value.data || [];
    renderSystem();
  };

  const qualityDialog = qs("[data-admin-quality-dialog]");
  const qualityForm = qs("[data-admin-quality-form]");
  const qualityCategory = qs("[data-admin-quality-category]");
  const qualityStatus = (message, type = "info") => setStatus("[data-admin-quality-status]", message, type);
  const closeQualityEditor = () => {
    if (qualityDialog?.open) qualityDialog.close();
    state.qualityProduct = null;
    qualityForm?.reset();
  };
  const qualityCategoryOptions = (selected = "") => {
    if (!qualityCategory) return;
    qualityCategory.innerHTML = state.categories
      .filter((category) => category.kind === "material" && !category.parentId && category.active)
      .map((category) => `<option value="${escapeHtml(category.id)}" ${category.id === selected ? "selected" : ""}>${escapeHtml(category.title)}</option>`)
      .join("");
  };
  const openQualityEditor = async (id, button) => {
    setButtonBusy(button, true, "Açılır...");
    try {
      const result = await api.product(id);
      const product = result.data;
      state.qualityProduct = product;
      qualityCategoryOptions(product.category);
      qualityForm.elements.id.value = product.id || "";
      qualityForm.elements.sku.value = product.sku || "";
      qualityForm.elements.name.value = product.name || "";
      qualityForm.elements.brand.value = product.brand || "Brendsiz";
      qualityForm.elements.category.value = product.category || "";
      qualityForm.elements.subcategory.value = product.subcategory || "";
      qualityForm.elements.package.value = product.package || "";
      qualityForm.elements.imageUrl.value = product.imageUrl || "";
      qualityForm.elements.sourceUrl.value = product.sourceUrl || "";
      qualityForm.elements.priceStatus.value = product.priceStatus || "request";
      qualityForm.elements.priceAmount.value = product.priceAmount ?? "";
      qualityForm.elements.stockQuantity.value = product.stockQuantity ?? "";
      qualityForm.elements.minimumOrder.value = product.minimumOrder ?? "";
      qualityForm.elements.availability.value = product.availability || "Stok sorğu ilə";
      qualityForm.elements.specs.value = (product.specs || []).join("; ");
      setText("[data-admin-quality-title]", `${product.name} · ${product.sku}`);
      const productLink = qs("[data-admin-quality-product-link]");
      if (productLink) productLink.href = `product-detail.html?product=${encodeURIComponent(product.id)}`;
      qualityStatus("Yalnız yoxlanmış real məlumatı saxla.");
      qualityDialog.showModal();
    } catch (error) {
      setStatus("[data-admin-v2-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  };

  qs("[data-admin-v2-refresh]")?.addEventListener("click", (event) => {
    setButtonBusy(event.currentTarget, true, "Yenilənir...");
    loadDashboard().catch((error) => setStatus("[data-admin-v2-status]", error.message, "error")).finally(() => setButtonBusy(event.currentTarget, false));
  });
  qs("[data-admin-price-monitor-scan]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setButtonBusy(button, true, "Yoxlanılır...");
    try {
      const result = await api.scanPriceMonitor();
      state.priceMonitor = result.data.monitor;
      renderPriceMonitor();
      setStatus(
        "[data-admin-price-monitor-status]",
        `${result.data.scan.createdRequests} yeni yoxlama yaradıldı, ${result.data.scan.expiredProducts} qiymətin vaxtı bitdi.`,
        "success"
      );
      await loadDashboard();
    } catch (error) {
      setStatus("[data-admin-price-monitor-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-price-monitor-items]")?.addEventListener("click", async (event) => {
    const remindButton = event.target.closest("[data-price-review-remind]");
    const cancelButton = event.target.closest("[data-price-review-cancel]");
    const button = remindButton || cancelButton;
    if (!button) return;
    const action = remindButton ? "remind" : "cancel";
    const id = remindButton?.dataset.priceReviewRemind || cancelButton?.dataset.priceReviewCancel;
    const note = action === "cancel" ? window.prompt("Bağlanma səbəbini yaz:", "Qiymət yoxlaması tələb olunmur") : "";
    if (action === "cancel" && note === null) return;
    setButtonBusy(button, true, action === "remind" ? "Göndərilir..." : "Bağlanır...");
    try {
      const result = await api.updatePriceReview(id, action, note || "");
      state.priceMonitor = result.data;
      renderPriceMonitor();
      setStatus(
        "[data-admin-price-monitor-status]",
        action === "remind" ? "Təchizatçıya xatırlatma növbəyə əlavə edildi." : "Qiymət yoxlaması bağlandı.",
        "success"
      );
      await loadDashboard();
    } catch (error) {
      setStatus("[data-admin-price-monitor-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-quality-items]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quality-edit]");
    if (button) openQualityEditor(button.dataset.qualityEdit, button);
  });
  document.querySelectorAll("[data-admin-quality-close]").forEach((button) => {
    button.addEventListener("click", closeQualityEditor);
  });
  qualityDialog?.addEventListener("click", (event) => {
    if (event.target === qualityDialog) closeQualityEditor();
  });
  qualityForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.qualityProduct) return;
    const fields = Object.fromEntries(new FormData(qualityForm).entries());
    const priceStatus = fields.priceStatus || "request";
    const priceAmount = fields.priceAmount === "" ? null : Number(fields.priceAmount);
    if (priceStatus === "confirmed" && (!Number.isFinite(priceAmount) || !fields.sourceUrl)) {
      qualityStatus("Təsdiqli qiymət üçün məbləğ və HTTPS mənbə URL-i tələb olunur.", "warning");
      return;
    }
    const button = qualityForm.querySelector('button[type="submit"]');
    setButtonBusy(button, true, "Saxlanır...");
    try {
      const currency = state.qualityProduct.priceCurrency || "AZN";
      await api.saveProduct({
        ...state.qualityProduct,
        ...fields,
        priceAmount: priceStatus === "confirmed" ? priceAmount : null,
        price: priceStatus === "confirmed"
          ? `${priceAmount.toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
          : "Sorğu əsasında",
        stockQuantity: fields.stockQuantity === "" ? null : Number(fields.stockQuantity),
        minimumOrder: fields.minimumOrder === "" ? null : Number(fields.minimumOrder),
        specs: String(fields.specs || "").split(";").map((item) => item.trim()).filter(Boolean)
      }, true);
      closeQualityEditor();
      await loadDashboard();
      setStatus("[data-admin-v2-status]", "Məhsul məlumatı yeniləndi və keyfiyyət balı yenidən hesablandı.", "success");
    } catch (error) {
      qualityStatus(error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  const offerForm = qs("[data-admin-product-offer-form]");
  const clearOfferForm = () => {
    offerForm?.reset();
    if (offerForm) offerForm.elements.id.value = "";
    renderB2b();
  };
  qs("[data-admin-offer-clear]")?.addEventListener("click", clearOfferForm);
  offerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(offerForm).entries());
    const button = offerForm.querySelector('button[type="submit"]');
    setButtonBusy(button, true, "Saxlanır...");
    try {
      await api.saveProductOffer({
        ...fields,
        featured: offerForm.elements.featured.checked,
        sourceLabel: "Admin tərəfindən yoxlanmış mənbə",
        deliveryModes: ["delivery", "pickup", "supplier_delivery"]
      }, Boolean(fields.id));
      clearOfferForm();
      await Promise.all([loadB2b(), loadDashboard()]);
      setStatus("[data-admin-b2b-status]", "Təchizatçı təklifi və kataloq qiyməti yeniləndi.", "success");
    } catch (error) {
      setStatus("[data-admin-b2b-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-product-offers]")?.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-admin-offer-edit]");
    const remove = event.target.closest("[data-admin-offer-delete]");
    const id = edit?.dataset.adminOfferEdit || remove?.dataset.adminOfferDelete;
    const offer = state.productOffers.find((item) => item.id === id);
    if (!offer) return;
    if (remove) {
      if (!window.confirm(`${offer.supplier} təklifi arxivlənsin?`)) return;
      try {
        await api.deleteProductOffer(id);
        await Promise.all([loadB2b(), loadDashboard()]);
      } catch (error) {
        setStatus("[data-admin-b2b-status]", error.message, "error");
      }
      return;
    }
    offerForm.elements.id.value = offer.id;
    offerForm.elements.productId.value = offer.productId;
    offerForm.elements.supplierId.value = offer.supplierId;
    offerForm.elements.supplierSku.value = offer.supplierSku || "";
    offerForm.elements.unitPrice.value = offer.unitPrice ?? "";
    offerForm.elements.priceStatus.value = offer.priceStatus;
    offerForm.elements.stockQuantity.value = offer.stockQuantity ?? "";
    offerForm.elements.minimumOrder.value = offer.minimumOrder ?? "";
    offerForm.elements.leadTimeDays.value = offer.leadTimeDays ?? "";
    offerForm.elements.sourceUrl.value = offer.sourceUrl || "";
    offerForm.elements.featured.checked = offer.featured;
    offerForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const logisticsForm = qs("[data-admin-logistics-form]");
  const clearLogisticsForm = () => {
    logisticsForm?.reset();
    if (logisticsForm) {
      logisticsForm.elements.id.value = "";
      logisticsForm.elements.priority.value = "100";
      logisticsForm.elements.etaMinDays.value = "1";
      logisticsForm.elements.etaMaxDays.value = "3";
    }
  };
  qs("[data-admin-logistics-clear]")?.addEventListener("click", clearLogisticsForm);
  logisticsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(logisticsForm).entries());
    const button = logisticsForm.querySelector('button[type="submit"]');
    setButtonBusy(button, true, "Saxlanır...");
    try {
      await api.saveLogisticsZone({ ...fields, active: true }, Boolean(fields.id));
      clearLogisticsForm();
      await loadB2b();
      setStatus("[data-admin-b2b-status]", "Logistika zonası yadda saxlanıldı.", "success");
    } catch (error) {
      setStatus("[data-admin-b2b-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-logistics-zones]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-logistics-edit]");
    if (!button || !logisticsForm) return;
    const zone = state.logisticsZones.find((item) => item.id === button.dataset.adminLogisticsEdit);
    if (!zone) return;
    Object.entries({
      id: zone.id,
      name: zone.name,
      cities: zone.cities.join(", "),
      baseFee: zone.baseFee,
      minimumFee: zone.minimumFee,
      perSupplierFee: zone.perSupplierFee,
      perUnitFee: zone.perUnitFee,
      freeAbove: zone.freeAbove ?? "",
      priority: zone.priority,
      etaMinDays: zone.etaMinDays,
      etaMaxDays: zone.etaMaxDays
    }).forEach(([name, value]) => {
      if (logisticsForm.elements[name]) logisticsForm.elements[name].value = value;
    });
    logisticsForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  qs("[data-admin-procurement-list]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-admin-procurement-decision]");
    if (!button) return;
    const decision = button.dataset.decision;
    const note = window.prompt("Qərar qeydi", "") ?? "";
    setButtonBusy(button, true, decision === "approved" ? "Təsdiqlənir..." : "Rədd edilir...");
    try {
      await api.decideProcurement(button.dataset.adminProcurementDecision, decision, note);
      await Promise.all([loadB2b(), loadRequests(), loadDashboard()]);
      setStatus("[data-admin-b2b-status]", "Satınalma qərarı yadda saxlanıldı.", "success");
    } catch (error) {
      setStatus("[data-admin-b2b-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-b2b-refresh]")?.addEventListener("click", (event) => {
    setButtonBusy(event.currentTarget, true, "Yenilənir...");
    loadB2b()
      .catch((error) => setStatus("[data-admin-b2b-status]", error.message, "error"))
      .finally(() => setButtonBusy(event.currentTarget, false));
  });

  const categoryForm = qs("[data-admin-v2-category-form]");
  categoryForm?.elements.kind.addEventListener("change", parentCategoryOptions);
  qs("[data-admin-v2-category-filter]")?.addEventListener("change", renderCategories);
  qs("[data-admin-v2-category-clear]")?.addEventListener("click", clearCategoryForm);
  categoryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = categoryForm.querySelector('button[type="submit"]');
    setButtonBusy(button, true, "Yadda saxlanır...");
    try {
      const fields = Object.fromEntries(new FormData(categoryForm).entries());
      fields.kind = categoryForm.elements.kind.value;
      const update = Boolean(fields.id);
      await api.saveCategory(fields, update);
      await loadCategories();
      clearCategoryForm();
      setStatus("[data-admin-v2-category-status]", "Kateqoriya PostgreSQL bazasında yadda saxlanıldı.", "success");
    } catch (error) {
      setStatus("[data-admin-v2-category-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-categories]")?.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-category-edit]");
    const archive = event.target.closest("[data-category-archive]");
    const key = edit?.dataset.categoryEdit || archive?.dataset.categoryArchive;
    if (!key) return;
    const separator = key.indexOf(":");
    const kind = key.slice(0, separator);
    const id = key.slice(separator + 1);
    const item = state.categories.find((entry) => entry.kind === kind && entry.id === id);
    if (!item) return;
    if (archive) {
      if (!window.confirm(`${item.title} kateqoriyası arxivlənsin?`)) return;
      try {
        await api.deleteCategory({ id, kind });
        await loadCategories();
        setStatus("[data-admin-v2-category-status]", "Kateqoriya arxivləndi.", "success");
      } catch (error) {
        setStatus("[data-admin-v2-category-status]", error.message, "error");
      }
      return;
    }
    categoryForm.elements.kind.disabled = false;
    categoryForm.elements.kind.value = item.kind;
    parentCategoryOptions();
    categoryForm.elements.id.value = item.id;
    categoryForm.elements.parentId.value = item.parentId || "";
    categoryForm.elements.title.value = item.title;
    categoryForm.elements.slug.value = item.slug;
    categoryForm.elements.group.value = item.group;
    categoryForm.elements.sortOrder.value = item.sortOrder;
    categoryForm.elements.subtitle.value = item.subtitle;
    categoryForm.elements.kind.disabled = true;
    categoryForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const userForm = qs("[data-admin-v2-user-form]");
  qs("[data-admin-v2-user-clear]")?.addEventListener("click", clearUserForm);
  userForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = userForm.querySelector('button[type="submit"]');
    setButtonBusy(button, true, "Yadda saxlanır...");
    try {
      const fields = Object.fromEntries(new FormData(userForm).entries());
      const update = Boolean(fields.id);
      const result = await api.saveUser(fields, update);
      await loadUsers();
      clearUserForm();
      const temporary = result.data.temporaryPassword ? ` Müvəqqəti şifrə: ${result.data.temporaryPassword}` : "";
      setStatus("[data-admin-v2-user-status]", `Hesab yadda saxlanıldı.${temporary}`, "success");
    } catch (error) {
      setStatus("[data-admin-v2-user-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-users]")?.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-user-edit]");
    const reset = event.target.closest("[data-user-reset]");
    const id = edit?.dataset.userEdit || reset?.dataset.userReset;
    const user = state.users.find((item) => item.id === id);
    if (!user) return;
    if (reset) {
      if (!window.confirm(`${user.name} üçün şifrə sıfırlansın?`)) return;
      try {
        const result = await api.saveUser({ id, action: "reset_password" }, true);
        setStatus("[data-admin-v2-user-status]", `Yeni müvəqqəti şifrə: ${result.data.temporaryPassword}`, "success");
        await loadUsers();
      } catch (error) {
        setStatus("[data-admin-v2-user-status]", error.message, "error");
      }
      return;
    }
    userForm.elements.id.value = user.id;
    userForm.elements.name.value = user.name;
    userForm.elements.email.value = user.email;
    userForm.elements.email.disabled = true;
    userForm.elements.companyName.value = user.companyName || "";
    userForm.elements.role.value = user.role;
    userForm.elements.status.value = user.status;
    userForm.elements.temporaryPassword.value = "";
    userForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  qs("[data-admin-v2-requests-refresh]")?.addEventListener("click", (event) => {
    setButtonBusy(event.currentTarget, true, "Yenilənir...");
    loadRequests().finally(() => setButtonBusy(event.currentTarget, false));
  });
  qs("[data-admin-supplier-applications]")?.addEventListener("click", async (event) => {
    const approveButton = event.target.closest("[data-supplier-application-approve]");
    const rejectButton = event.target.closest("[data-supplier-application-reject]");
    const button = approveButton || rejectButton;
    if (!button) return;
    const action = approveButton ? "approve" : "reject";
    const id = approveButton?.dataset.supplierApplicationApprove || rejectButton?.dataset.supplierApplicationReject;
    const application = state.supplierApplications.find((item) => item.id === id);
    if (!application) return;
    let decisionNote = "";
    if (action === "approve") {
      if (!window.confirm(`${application.companyName} üçün şirkət, təchizatçı profili və giriş hesabı yaradılsın?`)) return;
    } else {
      decisionNote = window.prompt("Rədd səbəbini yaz:", "") ?? "";
      if (!decisionNote) return;
    }
    setButtonBusy(button, true, action === "approve" ? "Təsdiqlənir..." : "Rədd edilir...");
    try {
      const result = await api.reviewSupplierApplication(id, action, decisionNote);
      setStatus(
        "[data-admin-supplier-application-status]",
        action === "approve" && result.data.invitationQueued
          ? "Təchizatçı hesabı yaradıldı və təhlükəsiz şifrə-qurma keçidi e-poçt növbəsinə əlavə edildi."
          : "Müraciət qərarı yadda saxlanıldı.",
        "success"
      );
      await Promise.all([loadSupplierApplications(), loadDashboard(), loadUsers()]);
    } catch (error) {
      setStatus("[data-admin-supplier-application-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-rfqs]")?.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-rfq-status]");
    if (!select) return;
    try {
      await api.updateRfq(select.dataset.rfqStatus, select.value);
      setStatus("[data-admin-v2-tender-status]", "Sorğu statusu yeniləndi.", "success");
    } catch (error) {
      setStatus("[data-admin-v2-tender-status]", error.message, "error");
      await loadRequests();
    }
  });
  qs("[data-admin-v2-orders]")?.addEventListener("change", async (event) => {
    const statusSelect = event.target.closest("[data-order-status]");
    const paymentSelect = event.target.closest("[data-order-payment]");
    const id = statusSelect?.dataset.orderStatus || paymentSelect?.dataset.orderPayment;
    const order = state.orders.find((item) => item.id === id);
    if (!order) return;
    const row = event.target.closest("tr");
    const status = row?.querySelector("[data-order-status]")?.value || order.status;
    const paymentStatus = row?.querySelector("[data-order-payment]")?.value || order.paymentStatus;
    try {
      await api.updateOrder(id, { status, paymentStatus });
      setStatus("[data-admin-v2-tender-status]", "Sifariş statusu yeniləndi.", "success");
      await loadRequests();
    } catch (error) {
      setStatus("[data-admin-v2-tender-status]", error.message, "error");
      await loadRequests();
    }
  });
  const tenderForm = qs("[data-admin-v2-tender-form]");
  qs("[data-admin-v2-tender-clear]")?.addEventListener("click", clearTenderForm);
  tenderForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = tenderForm.querySelector('button[type="submit"]');
    setButtonBusy(button, true, "Yadda saxlanır...");
    try {
      const fields = Object.fromEntries(new FormData(tenderForm).entries());
      const lots = String(fields.lots || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
        const [title, quantity, unit, specs] = line.split("|").map((item) => item.trim());
        return { title, quantity, unit, specifications: String(specs || "").split(";").map((item) => item.trim()).filter(Boolean) };
      });
      const payload = {
        ...fields,
        lots,
        requirements: String(fields.requirements || "").split(/[;\n]/).map((item) => item.trim()).filter(Boolean)
      };
      await api.saveTender(payload, Boolean(fields.id));
      await loadRequests();
      clearTenderForm();
      setStatus("[data-admin-v2-tender-status]", "Tender bazada yadda saxlanıldı.", "success");
    } catch (error) {
      setStatus("[data-admin-v2-tender-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-tenders]")?.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-tender-edit]");
    const cancel = event.target.closest("[data-tender-cancel]");
    const id = edit?.dataset.tenderEdit || cancel?.dataset.tenderCancel;
    const tender = state.tenders.find((item) => item.id === id);
    if (!tender) return;
    if (cancel) {
      if (!window.confirm(`${tender.title} tenderi ləğv edilsin?`)) return;
      try {
        await api.deleteTender(id);
        await loadRequests();
      } catch (error) {
        setStatus("[data-admin-v2-tender-status]", error.message, "error");
      }
      return;
    }
    tenderForm.elements.id.value = tender.id;
    tenderForm.elements.companyName.value = tender.companyName;
    tenderForm.elements.title.value = tender.title;
    tenderForm.elements.city.value = tender.city;
    tenderForm.elements.deadline.value = tender.deadline ? String(tender.deadline).slice(0, 10) : "";
    tenderForm.elements.budget.value = tender.budget;
    tenderForm.elements.status.value = tender.status;
    tenderForm.elements.visibility.value = tender.visibility;
    tenderForm.elements.contact.value = tender.contact;
    tenderForm.elements.description.value = tender.description;
    tenderForm.elements.lots.value = tender.lots.map((lot) => `${lot.title} | ${lot.quantity} | ${lot.unit} | ${(lot.specifications || []).join("; ")}`).join("\n");
    tenderForm.elements.requirements.value = (tender.requirements || []).join("; ");
    tenderForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  qs("[data-admin-v2-tender-bids]")?.addEventListener("click", async (event) => {
    const accept = event.target.closest("[data-tender-bid-accept]");
    const reject = event.target.closest("[data-tender-bid-reject]");
    const id = accept?.dataset.tenderBidAccept || reject?.dataset.tenderBidReject;
    if (!id) return;
    const status = accept ? "accepted" : "rejected";
    if (accept && !window.confirm("Bu təklif qalib seçilsin və avtomatik sifariş/proforma yaradılsın?")) return;
    const button = accept || reject;
    setButtonBusy(button, true, accept ? "Sifariş yaradılır..." : "Rədd edilir...");
    try {
      const result = await api.saveTenderBid({ id, status }, true);
      await loadRequests();
      setStatus(
        "[data-admin-v2-tender-status]",
        result.data?.order?.orderNumber
          ? `Tender qalibi təsdiqləndi. Sifariş #${result.data.order.orderNumber} və proforma yaradıldı.`
          : "Tender təklifi yeniləndi.",
        "success"
      );
    } catch (error) {
      setStatus("[data-admin-v2-tender-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  qs("[data-admin-v2-crm-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    setButtonBusy(button, true, "Yaradılır...");
    try {
      const result = await api.createCrmLead(Object.fromEntries(new FormData(form).entries()));
      state.crm = result.data;
      form.reset();
      renderCommercial();
      setStatus("[data-admin-v2-crm-status]", "Manual lead CRM boru xəttinə əlavə edildi.", "success");
    } catch (error) {
      setStatus("[data-admin-v2-crm-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-crm-leads]")?.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-crm-stage]");
    if (!select) return;
    select.disabled = true;
    try {
      const result = await api.updateCrmLead(select.dataset.crmStage, { stage: select.value });
      state.crm = result.data;
      renderCommercial();
      setStatus("[data-admin-v2-crm-status]", "Lead mərhələsi yeniləndi.", "success");
    } catch (error) {
      setStatus("[data-admin-v2-crm-status]", error.message, "error");
      await loadCommercial().catch(() => null);
    } finally {
      select.disabled = false;
    }
  });
  qs("[data-admin-v2-crm-leads]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-crm-activity]");
    if (!button) return;
    const subject = window.prompt("Fəaliyyət mövzusu", "Müştəri ilə əlaqə");
    if (!subject) return;
    const note = window.prompt("Qeyd", "") ?? "";
    setButtonBusy(button, true, "Əlavə edilir...");
    try {
      const result = await api.createCrmActivity({ leadId: button.dataset.crmActivity, type: "note", subject, note });
      state.crm = result.data;
      renderCommercial();
    } catch (error) {
      setStatus("[data-admin-v2-crm-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-rental-bookings]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-rental-booking-save]");
    if (!button) return;
    const row = button.closest("[data-rental-booking-row]");
    const status = row?.querySelector("[data-rental-status]")?.value;
    const quotedAmount = row?.querySelector("[data-rental-quote]")?.value || "";
    setButtonBusy(button, true, "Saxlanır...");
    try {
      await api.updateRentalBooking(button.dataset.rentalBookingSave, { status, quotedAmount });
      await loadCommercial();
      setStatus("[data-admin-v2-crm-status]", "İcarə rezervasiyası yeniləndi.", "success");
    } catch (error) {
      setStatus("[data-admin-v2-crm-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-commercial-refresh]")?.addEventListener("click", (event) => {
    setButtonBusy(event.currentTarget, true, "Yenilənir...");
    loadCommercial()
      .catch((error) => setStatus("[data-admin-v2-crm-status]", error.message, "error"))
      .finally(() => setButtonBusy(event.currentTarget, false));
  });

  qs("[data-admin-v2-media-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const files = [...form.elements.file.files].slice(0, 20);
    if (!files.length) return;
    setButtonBusy(button, true, "Yüklənir...");
    try {
      for (const [index, sourceFile] of files.entries()) {
        const optimized = await optimizeMediaFile(sourceFile);
        await api.uploadMedia({
          filename: optimized.filename,
          contentType: optimized.contentType,
          fileBase64: await fileToDataUrl(optimized.file),
          entityType: form.elements.entityType.value,
          entityId: form.elements.entityId.value,
          altText: form.elements.altText.value,
          sourceUrl: form.elements.sourceUrl.value,
          licenseType: form.elements.licenseType.value,
          licenseNote: form.elements.licenseNote.value,
          isPrimary: form.elements.isPrimary.checked && index === 0
        });
      }
      form.reset();
      await loadMedia();
      setStatus("[data-admin-v2-media-status]", `${files.length} fayl media kitabxanasına yükləndi.`, "success");
    } catch (error) {
      setStatus("[data-admin-v2-media-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-external-media-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    setButtonBusy(button, true, "Yoxlanılır...");
    try {
      const fields = Object.fromEntries(new FormData(form).entries());
      await api.registerExternalMedia({
        ...fields,
        isPrimary: form.elements.isPrimary.checked
      });
      form.reset();
      await loadMedia();
      setStatus("[data-admin-v2-media-status]", "Şəkil və mənbə yoxlanıldı; istifadə hüququ ayrıca baxış üçün gözləməyə alındı.", "success");
    } catch (error) {
      setStatus("[data-admin-v2-media-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-media]")?.addEventListener("click", async (event) => {
    const review = event.target.closest("[data-media-review]");
    const copy = event.target.closest("[data-media-copy]");
    const primary = event.target.closest("[data-media-primary]");
    const remove = event.target.closest("[data-media-delete]");
    if (review) {
      fillMediaRightsForm(review.dataset.mediaReview);
      qs("[data-admin-v2-media-rights-form]")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (copy) {
      await navigator.clipboard.writeText(copy.dataset.mediaCopy).catch(() => null);
      setStatus("[data-admin-v2-media-status]", "Media URL-i mübadilə buferinə köçürüldü.", "success");
    }
    if (primary) {
      const item = state.media.find((entry) => entry.id === primary.dataset.mediaPrimary);
      if (!item) return;
      try {
        await api.updateMedia({ id: item.id, isPrimary: true });
        await loadMedia();
        setStatus("[data-admin-v2-media-status]", "Əsas media yeniləndi.", "success");
      } catch (error) {
        setStatus("[data-admin-v2-media-status]", error.message, "error");
      }
    }
    if (remove && window.confirm("Bu media faylı silinsin?")) {
      try {
        await api.deleteMedia(remove.dataset.mediaDelete);
        await loadMedia();
      } catch (error) {
        setStatus("[data-admin-v2-media-status]", error.message, "error");
      }
    }
  });
  qs("[data-admin-v2-media-rights-select]")?.addEventListener("change", (event) => {
    fillMediaRightsForm(event.currentTarget.value);
  });
  qs("[data-admin-v2-media-rights-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const fields = Object.fromEntries(new FormData(form).entries());
    setButtonBusy(button, true, "Saxlanır...");
    try {
      await api.updateMedia({
        id: fields.id,
        licenseType: fields.licenseType,
        licenseNote: fields.licenseNote
      });
      await api.updateMedia({
        id: fields.id,
        action: "review-rights",
        rightsStatus: fields.rightsStatus,
        rightsExpiresOn: fields.rightsExpiresOn,
        rightsReviewNote: fields.rightsReviewNote
      });
      await loadMedia();
      setStatus("[data-admin-v2-media-status]", "Media hüququ qərarı audit izi ilə saxlanıldı.", "success");
    } catch (error) {
      setStatus("[data-admin-v2-media-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  qs("[data-admin-v2-password-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    setButtonBusy(button, true, "Dəyişdirilir...");
    try {
      const fields = Object.fromEntries(new FormData(form).entries());
      const result = await api.updateAccount({ action: "change_password", ...fields });
      state.account = result.data;
      form.reset();
      renderSystem();
      setStatus("[data-admin-v2-account-status]", "Şifrə dəyişdirildi və digər sessiyalar bağlandı.", "success");
    } catch (error) {
      setStatus("[data-admin-v2-account-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-revoke-sessions]")?.addEventListener("click", async () => {
    try {
      const result = await api.updateAccount({ action: "revoke_other_sessions" });
      setStatus("[data-admin-v2-account-status]", `${result.data.revoked} digər sessiya bağlandı.`, "success");
      await loadSystem();
    } catch (error) {
      setStatus("[data-admin-v2-account-status]", error.message, "error");
    }
  });

  qs("[data-admin-two-factor-start]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    setButtonBusy(button, true, "Hazırlanır...");
    try {
      const fields = Object.fromEntries(new FormData(form).entries());
      const result = await api.updateAccount({ action: "setup_2fa", ...fields });
      state.twoFactorSetupToken = result.data.setupToken;
      const panel = qs("[data-admin-two-factor-setup]");
      const secret = qs("[data-admin-two-factor-secret]");
      const link = qs("[data-admin-two-factor-link]");
      if (secret) secret.textContent = result.data.secret;
      if (link) link.href = result.data.otpauthUrl;
      if (panel) panel.hidden = false;
      form.reset();
      setStatus("[data-admin-two-factor-status]", "Açarı Authenticator tətbiqinə əlavə et və yaranan kodu təsdiqlə.", "success");
    } catch (error) {
      setStatus("[data-admin-two-factor-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  const showRecoveryCodes = (codes) => {
    state.recoveryCodes = codes || [];
    const panel = qs("[data-admin-recovery-codes]");
    const list = qs("[data-admin-recovery-code-list]");
    if (list) list.textContent = state.recoveryCodes.join("\n");
    if (panel) panel.hidden = !state.recoveryCodes.length;
  };

  qs("[data-admin-two-factor-confirm]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    setButtonBusy(button, true, "Aktivləşdirilir...");
    try {
      const code = new FormData(form).get("code");
      const result = await api.updateAccount({
        action: "confirm_2fa",
        setupToken: state.twoFactorSetupToken,
        code
      });
      state.account = result.data.account;
      state.twoFactorSetupToken = "";
      form.reset();
      const panel = qs("[data-admin-two-factor-setup]");
      if (panel) panel.hidden = true;
      const secret = qs("[data-admin-two-factor-secret]");
      const link = qs("[data-admin-two-factor-link]");
      if (secret) secret.textContent = "";
      if (link) link.removeAttribute("href");
      showRecoveryCodes(result.data.recoveryCodes);
      renderSystem();
      setStatus("[data-admin-two-factor-status]", "İki mərhələli giriş aktivləşdirildi.", "success");
    } catch (error) {
      setStatus("[data-admin-two-factor-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  qs("[data-admin-two-factor-manage]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    if (!window.confirm("İki mərhələli giriş söndürülsün?")) return;
    setButtonBusy(button, true, "Söndürülür...");
    try {
      const fields = Object.fromEntries(new FormData(form).entries());
      const result = await api.updateAccount({ action: "disable_2fa", ...fields });
      state.account = result.data;
      form.reset();
      showRecoveryCodes([]);
      renderSystem();
      setStatus("[data-admin-two-factor-status]", "İki mərhələli giriş söndürüldü.", "warning");
    } catch (error) {
      setStatus("[data-admin-two-factor-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  qs("[data-admin-two-factor-recovery]")?.addEventListener("click", async (event) => {
    const form = event.currentTarget.closest("form");
    const button = event.currentTarget;
    setButtonBusy(button, true, "Yaradılır...");
    try {
      const fields = Object.fromEntries(new FormData(form).entries());
      const result = await api.updateAccount({ action: "regenerate_recovery_codes", ...fields });
      state.account = result.data.account;
      form.reset();
      showRecoveryCodes(result.data.recoveryCodes);
      renderSystem();
      setStatus("[data-admin-two-factor-status]", "Yeni bərpa kodları yaradıldı; əvvəlkilər artıq işləmir.", "success");
    } catch (error) {
      setStatus("[data-admin-two-factor-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  qs("[data-admin-recovery-copy]")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(state.recoveryCodes.join("\n")).catch(() => null);
    setStatus("[data-admin-two-factor-status]", "Bərpa kodları mübadilə buferinə köçürüldü.", "success");
  });

  const runImport = async (action, button) => {
    const form = qs("[data-admin-v2-import-form]");
    const file = form?.elements.file.files[0];
    if (!file) {
      setStatus("[data-admin-v2-import-status]", "CSV və ya XLSX faylı seç.", "warning");
      return;
    }
    setButtonBusy(button, true, action === "validate" ? "Yoxlanılır..." : "İdxal edilir...");
    try {
      const fileBase64 = await fileToDataUrl(file);
      const result = await api.runImport({
        action,
        importType: form.elements.importType.value,
        filename: file.name,
        fileType: file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv",
        fileBase64,
        allowPartial: form.elements.allowPartial.checked
      });
      const data = result.data;
      setStatus("[data-admin-v2-import-status]", action === "validate"
        ? `${data.valid}/${data.total} sətir uyğundur, ${data.errors.length} səhv var.`
        : `${data.imported} qeyd PostgreSQL bazasına idxal edildi, ${data.errors.length} sətir buraxıldı.`, data.errors.length ? "warning" : "success");
      await Promise.all([loadSystem(), loadDashboard()]);
    } catch (error) {
      const count = error.details?.errors?.length;
      setStatus("[data-admin-v2-import-status]", `${error.message}${count ? ` (${count} səhv göstərildi)` : ""}`, "error");
    } finally {
      setButtonBusy(button, false);
    }
  };
  qs("[data-admin-v2-import-validate]")?.addEventListener("click", (event) => runImport("validate", event.currentTarget));
  qs("[data-admin-v2-import-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runImport("commit", event.currentTarget.querySelector('button[type="submit"]'));
  });
  qs("[data-admin-v2-process-notifications]")?.addEventListener("click", async (event) => {
    setButtonBusy(event.currentTarget, true, "Göndərilir...");
    try {
      const result = await api.processNotifications();
      setStatus("[data-admin-v2-import-status]", `${result.data.sent} bildiriş göndərildi, ${result.data.skipped} inteqrasiya gözləyir.`, result.data.failed ? "warning" : "success");
      await loadSystem();
    } catch (error) {
      setStatus("[data-admin-v2-import-status]", error.message, "error");
    } finally {
      setButtonBusy(event.currentTarget, false);
    }
  });
  qs("[data-admin-v2-notifications]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-notification-retry]");
    if (!button) return;
    await api.updateNotification(button.dataset.notificationRetry, "retry").catch((error) => setStatus("[data-admin-v2-import-status]", error.message, "error"));
    await loadSystem();
  });
  qs("[data-admin-v2-staging]")?.addEventListener("click", async (event) => {
    const approve = event.target.closest("[data-staging-approve]");
    const reject = event.target.closest("[data-staging-reject]");
    const button = approve || reject;
    if (!button) return;
    const row = button.closest("[data-staging-row]");
    const id = row?.dataset.stagingRow;
    if (!id) return;
    const action = approve ? "approve" : "reject";
    if (reject && !window.confirm("Bu yoxlama qeydi rədd edilsin?")) return;
    const item = state.staging.find((entry) => entry.id === id);
    const allowExistingUpdate = Boolean(item?.existingEntityId);
    if (approve && allowExistingUpdate && !window.confirm("Bu SKU artıq kataloqdadır. Mövcud məhsul real mənbədən gələn məlumatlarla yenilənsin?")) return;
    const categoryId = row.querySelector("[data-staging-category]")?.value || "";
    const subcategory = row.querySelector("[data-staging-subcategory]")?.value || "";
    if (approve && (!categoryId || !subcategory.trim())) {
      setStatus("[data-admin-v2-staging-status]", "Təsdiqdən əvvəl əsas kateqoriya və subkateqoriya seç.", "warning");
      return;
    }
    setButtonBusy(button, true, approve ? "Təsdiqlənir..." : "Rədd edilir...");
    try {
      const result = await api.reviewCatalogItem({ id, action, categoryId, subcategory, allowExistingUpdate });
      setStatus(
        "[data-admin-v2-staging-status]",
        approve
          ? `Qeyd kataloqda yayımlandı: ${result.data.publishedId}`
          : "Qeyd yoxlama siyahısından rədd edildi.",
        "success"
      );
      await Promise.all([loadSystem(), loadDashboard()]);
    } catch (error) {
      setStatus("[data-admin-v2-staging-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-cloud-backup]")?.addEventListener("click", async (event) => {
    setButtonBusy(event.currentTarget, true, "Hazırlanır...");
    try {
      const result = await api.cloudBackup();
      downloadJson(`constera-cloud-backup-${new Date().toISOString().slice(0, 10)}.json`, result.data);
    } catch (error) {
      setStatus("[data-admin-v2-import-status]", error.message, "error");
    } finally {
      setButtonBusy(event.currentTarget, false);
    }
  });
  qs("[data-admin-v2-system-refresh]")?.addEventListener("click", (event) => {
    setButtonBusy(event.currentTarget, true, "Yenilənir...");
    loadSystem().finally(() => setButtonBusy(event.currentTarget, false));
  });
  window.addEventListener("constera:media-updated", () => {
    Promise.all([loadMedia(), loadDashboard()])
      .catch((error) => setStatus("[data-admin-v2-media-status]", error.message, "error"));
  });

  const init = async () => {
    try {
      const session = await api.session();
      state.session = session.user;
      if (!session.user || !["super_admin", "admin"].includes(session.user.role)) {
        setStatus("[data-admin-v2-status]", "Canlı idarəetmə üçün administrator hesabına daxil ol. Lokal panel işləməyə davam edir.", "warning");
        return;
      }
      const tasks = [loadDashboard(), loadCategories(), loadUsers(), loadSupplierApplications(), loadRequests(), loadB2b(), loadCommercial(), loadMedia(), loadSystem()];
      const results = await Promise.allSettled(tasks);
      const failed = results.filter((item) => item.status === "rejected");
      if (failed.length) {
        setStatus("[data-admin-v2-status]", `${failed.length} idarəetmə modulu yüklənmədi: ${failed[0].reason?.message || "server xətası"}`, "warning");
      }
    } catch (error) {
      setStatus("[data-admin-v2-status]", error.message || "Canlı idarəetmə yüklənmədi.", "error");
    }
  };

  init();
})();
