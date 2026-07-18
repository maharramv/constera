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
    media: [],
    notifications: [],
    imports: [],
    audit: [],
    account: null
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
    bulk_sync: "Sinxronlaşdırdı"
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
      [counts.tenders, "tender"],
      [counts.users, "aktiv istifadəçi"],
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
      return `<div><span><strong>${escapeHtml(priceLabels[item.status] || item.status)}</strong><small>${item.count} · ${percent}%</small></span><i style="--admin-progress:${percent}%"></i></div>`;
    }).join("") || "<p>Məlumat yoxdur.</p>";

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
    if (imports) imports.innerHTML = state.imports.slice(0, 12).map((item) => `<article><div><strong>${escapeHtml(item.filename || item.import_type)}</strong><small>${escapeHtml(item.import_type)} · ${escapeHtml(item.status)} · ${item.imported_rows}/${item.total_rows} idxal</small></div><small>${formatDate(item.created_at, true)}</small></article>`).join("") || "<p>İdxal tarixçəsi yoxdur.</p>";

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
    const result = await api.analytics();
    state.analytics = result.data;
    renderAnalytics();
    setStatus("[data-admin-v2-status]", `Canlı göstəricilər ${formatDate(result.data.generatedAt, true)} tarixində yeniləndi.`, "success");
  };

  const loadCategories = async () => {
    state.categories = (await api.categories()).data || [];
    renderCategories();
  };
  const loadUsers = async () => {
    state.users = (await api.users()).data || [];
    renderUsers();
  };
  const loadRequests = async () => {
    const [rfqs, tenders] = await Promise.all([api.rfqs(), api.tenders()]);
    state.rfqs = rfqs.data || [];
    state.tenders = tenders.data || [];
    renderRequests();
  };
  const loadMedia = async () => {
    state.media = (await api.media()).data || [];
    renderMedia();
  };
  const loadSystem = async () => {
    const results = await Promise.allSettled([api.account(), api.notifications(), api.imports(), api.audit()]);
    if (results[0].status === "fulfilled") state.account = results[0].value.data;
    if (results[1].status === "fulfilled") state.notifications = results[1].value.data || [];
    if (results[2].status === "fulfilled") state.imports = results[2].value.data || [];
    if (results[3].status === "fulfilled") state.audit = results[3].value.data || [];
    renderSystem();
  };

  qs("[data-admin-v2-refresh]")?.addEventListener("click", (event) => {
    setButtonBusy(event.currentTarget, true, "Yenilənir...");
    loadDashboard().catch((error) => setStatus("[data-admin-v2-status]", error.message, "error")).finally(() => setButtonBusy(event.currentTarget, false));
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
      const tasks = [loadDashboard(), loadCategories(), loadUsers(), loadRequests(), loadMedia(), loadSystem()];
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
