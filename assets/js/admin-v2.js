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
    orders: [],
    media: [],
    notifications: [],
    imports: [],
    staging: [],
    audit: [],
    supplierApplications: [],
    priceMonitor: null,
    account: null,
    qualityProduct: null
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

  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Fayl oxuna bilmədi."));
    reader.readAsDataURL(file);
  });

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
      [counts.rfqs, "qiymət sorğusu"],
      [counts.orders, "sifariş"],
      [counts.tenders, "tender"],
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
      `${qualityTotal.toLocaleString("az-AZ")} real satış qeydi · ${Number(qualitySummary.requestGroups || 0).toLocaleString("az-AZ")} RFQ məhsul qrupu · ${Number(qualitySummary.unknownStock || 0).toLocaleString("az-AZ")} dəqiqləşdirilməmiş stok`
    );
    const qualityMetrics = [
      ["Real foto", "missingImage"],
      ["Mənbə URL-i", "missingSource"],
      ["Texniki məlumat", "missingSpecs"],
      ["Dəqiq brend", "missingBrand"],
      ["Düzgün kateqoriya", "missingCategory"]
    ];
    const qualityBars = qs("[data-admin-v2-quality-bars]");
    if (qualityBars) qualityBars.innerHTML = qualityMetrics.map(([label, key]) => {
      const missing = Number(qualitySummary[key] || 0);
      const complete = Math.max(0, qualityTotal - missing);
      const percent = qualityTotal ? Math.round((complete / qualityTotal) * 100) : 100;
      return `<div><span><strong>${escapeHtml(label)}</strong><small>${complete.toLocaleString("az-AZ")} / ${qualityTotal.toLocaleString("az-AZ")} · ${percent}%</small></span><progress max="100" value="${percent}" aria-label="${escapeHtml(label)}: ${percent}%"></progress></div>`;
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
      whatsappWebhook: "WhatsApp webhook-u"
    };
    const integrations = qs("[data-admin-v2-integrations]");
    if (integrations) integrations.innerHTML = Object.entries(data.integrations || {}).map(([key, active]) => `
      <div><span>${escapeHtml(integrationLabels[key] || key)}</span><strong class="${active ? "is-ready" : "is-pending"}">${active ? "Hazır" : "Qurulmayıb"}</strong></div>
    `).join("");

    const activity = qs("[data-admin-v2-activity]");
    if (activity) activity.innerHTML = (data.recentActivity || []).map((item) => `
      <article><span>${escapeHtml(item.actor_name || "Sistem")}</span><strong>${escapeHtml(actionLabels[item.action] || item.action)}</strong><small>${escapeHtml(item.entity_type)} · ${formatDate(item.created_at, true)}</small></article>
    `).join("") || "<p>Son fəaliyyət yoxdur.</p>";
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
      <td data-label="Əməliyyat"><div class="admin-v2-row-actions"><button class="table-action" type="button" data-tender-edit="${escapeHtml(item.id)}">Redaktə</button>${item.status !== "cancelled" ? `<button class="table-action is-danger" type="button" data-tender-cancel="${escapeHtml(item.id)}">Ləğv et</button>` : ""}</div></td>
    </tr>`).join("") || '<tr><td colspan="6">Tender yoxdur.</td></tr>';

    const orderBody = qs("[data-admin-v2-orders]");
    if (orderBody) orderBody.innerHTML = state.orders.map((item) => {
      const statusOptions = [item.status, ...(allowedOrderTransitions[item.status] || [])];
      return `<tr>
      <td data-label="Sifariş"><strong>#${escapeHtml(item.orderNumber)}</strong><small>${formatDate(item.createdAt, true)}${item.rfqId ? ` · RFQ-dən yaradılıb` : ""}</small></td>
      <td data-label="Şirkət və əlaqə"><strong>${escapeHtml(item.companyName)}</strong><small>${escapeHtml(item.contactName)} · ${escapeHtml(item.phone)}</small></td>
      <td data-label="Məhsul">${item.items.length}<small>${item.hasPendingPrice ? "Qiymət təsdiqi var" : "Qiymətlər təsdiqlidir"}</small></td>
      <td data-label="Məbləğ"><strong>${item.totalAmount === null ? "Sorğu əsasında" : Number(item.totalAmount).toLocaleString("az-AZ", { style: "currency", currency: item.currency })}</strong></td>
      <td data-label="Status"><select class="table-select" data-order-status="${escapeHtml(item.id)}">${statusOptions.map((value) => `<option value="${value}" ${value === item.status ? "selected" : ""}>${escapeHtml(orderStatusLabels[value] || value)}</option>`).join("")}</select></td>
      <td data-label="Ödəniş"><select class="table-select" data-order-payment="${escapeHtml(item.id)}">${Object.entries(paymentStatusLabels).map(([value, label]) => `<option value="${value}" ${value === item.paymentStatus ? "selected" : ""}>${label}</option>`).join("")}</select></td>
      <td data-label="Əməliyyat"><a class="table-action" href="order-detail.html?order=${encodeURIComponent(item.id)}">Tarixçə və sənəd</a></td>
    </tr>`;
    }).join("") || '<tr><td colspan="7">Sifariş yoxdur.</td></tr>';
  };

  const clearTenderForm = () => {
    const form = qs("[data-admin-v2-tender-form]");
    if (!form) return;
    form.reset();
    form.elements.id.value = "";
  };

  const renderMedia = () => {
    const grid = qs("[data-admin-v2-media]");
    if (!grid) return;
    setText("[data-admin-v2-media-count]", `${state.media.length} fayl`);
    grid.innerHTML = state.media.map((item) => `<article>
      <div class="admin-v2-media-preview">${item.contentType.startsWith("image/") ? `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.altText || item.filename)}" loading="lazy" />` : '<span>PDF</span>'}</div>
      <div><strong>${escapeHtml(item.filename)}</strong><small>${escapeHtml(item.entityType)}${item.entityId ? ` · ${escapeHtml(item.entityId)}` : ""}</small><small>${Math.round(item.sizeBytes / 1024)} KB · ${formatDate(item.createdAt)}</small></div>
      <div class="admin-v2-row-actions"><button class="table-action" type="button" data-media-copy="${escapeHtml(item.url)}">URL-ni köçür</button><button class="table-action is-danger" type="button" data-media-delete="${escapeHtml(item.id)}">Sil</button></div>
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
    const [rfqs, tenders, orders] = await Promise.all([api.rfqs(), api.tenders(), api.orders()]);
    state.rfqs = rfqs.data || [];
    state.tenders = tenders.data || [];
    state.orders = orders.data || [];
    renderRequests();
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

  qs("[data-admin-v2-media-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const file = form.elements.file.files[0];
    if (!file) return;
    setButtonBusy(button, true, "Yüklənir...");
    try {
      const fileBase64 = await fileToDataUrl(file);
      await api.uploadMedia({
        filename: file.name,
        contentType: file.type,
        fileBase64,
        entityType: form.elements.entityType.value,
        entityId: form.elements.entityId.value,
        altText: form.elements.altText.value
      });
      form.reset();
      await loadMedia();
      setStatus("[data-admin-v2-media-status]", "Fayl Vercel Blob kitabxanasına yükləndi.", "success");
    } catch (error) {
      setStatus("[data-admin-v2-media-status]", error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
  qs("[data-admin-v2-media]")?.addEventListener("click", async (event) => {
    const copy = event.target.closest("[data-media-copy]");
    const remove = event.target.closest("[data-media-delete]");
    if (copy) {
      await navigator.clipboard.writeText(copy.dataset.mediaCopy).catch(() => null);
      setStatus("[data-admin-v2-media-status]", "Media URL-i mübadilə buferinə köçürüldü.", "success");
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

  const init = async () => {
    try {
      const session = await api.session();
      state.session = session.user;
      if (!session.user || !["super_admin", "admin"].includes(session.user.role)) {
        setStatus("[data-admin-v2-status]", "Canlı idarəetmə üçün administrator hesabına daxil ol. Lokal panel işləməyə davam edir.", "warning");
        return;
      }
      const tasks = [loadDashboard(), loadCategories(), loadUsers(), loadSupplierApplications(), loadRequests(), loadMedia(), loadSystem()];
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
