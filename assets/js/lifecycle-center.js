(function initLifecycleCenter() {
  if (document.body?.dataset.page !== "lifecycle-center") return;

  const api = window.ConstEraAPI;
  const root = document.querySelector("[data-lifecycle-root]");
  const sessionNode = document.querySelector("[data-lifecycle-session]");
  const statusNode = document.querySelector("[data-lifecycle-status]");
  const statsNode = document.querySelector("[data-lifecycle-stats]");
  if (!api || !root || !sessionNode || !statusNode || !statsNode) return;

  const state = { data: null, busy: false };
  const privilegedRoles = new Set(["super_admin", "admin", "sales"]);
  const labels = {
    draft: "Qaralama", published: "Dərc edilib", expired: "Vaxtı keçib", archived: "Arxiv",
    uploaded: "Yüklənib", analyzed: "Analiz edilib", mapped: "Uyğunlaşdırılıb", failed: "Xəta",
    submitted: "Təsdiq gözləyir", approved: "Təsdiqlənib", rejected: "Rədd edilib",
    implemented: "İcra edilib", cancelled: "Ləğv edilib", open: "Açıq",
    in_progress: "İcradadır", waiting_supplier: "Təchizatçı gözlənilir", resolved: "Həll edilib",
    closed: "Bağlanıb", reserved: "Rezerv edilib", sold: "Satılıb", withdrawn: "Geri çəkilib",
    active: "Aktiv", used: "İstifadə edilib", pending: "Yoxlamadadır", verified: "Təsdiqlənib",
    checkout: "Təhvil", checkin: "Geri qəbul", unused: "İstifadə olunmayıb",
    opened: "Qablaşdırma açılıb", used_good: "İşlənmiş, yaxşı", reclaimed: "Bərpa olunub",
    excellent: "Əla", good: "Yaxşı", fair: "Qənaətbəxş", damaged: "Zədəli"
  };
  const statLabels = {
    passports: "Məhsul pasportu", models: "Model analizi", changes: "Dəyişiklik",
    warranties: "Zəmanət işi", surplus: "Qalıq elanı", handovers: "Təhvil aktı",
    contractors: "Podratçı pasportu", locks: "Qiymət kilidi"
  };

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const statusLabel = (value) => labels[value] || String(value || "Məlum deyil");
  const asDate = (value, withTime = false) => {
    if (!value) return "—";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    return new Intl.DateTimeFormat("az-AZ", withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" }).format(date);
  };
  const asMoney = (value, currency = "AZN") => {
    if (value === null || value === undefined || value === "") return "Sorğu əsasında";
    return new Intl.NumberFormat("az-AZ", { style: "currency", currency }).format(Number(value));
  };
  const listText = (value) => {
    if (!Array.isArray(value) || !value.length) return "—";
    return value.map((item) => typeof item === "object" ? item.label || item.name || "" : item).filter(Boolean).join(", ");
  };
  const setStatus = (message, type = "info") => {
    statusNode.textContent = message;
    statusNode.dataset.type = type;
  };

  const optionLabels = {
    projects: (item) => `${item.title} · ${statusLabel(item.status)}`,
    products: (item) => `${item.name}${item.sku ? ` · ${item.sku}` : ""}`,
    orders: (item) => `Sifariş #${item.orderNumber || item.id} · ${item.companyName}`,
    offers: (item) => `${item.productName} · ${item.supplierName} · ${asMoney(item.unitPrice, item.currency)}`,
    bookings: (item) => `${item.rentalTitle} · ${asDate(item.startDate)}–${asDate(item.endDate)}`,
    suppliers: (item) => `${item.name}${item.region ? ` · ${item.region}` : ""}`
  };

  const populateSelects = () => {
    document.querySelectorAll("select[data-option-source]").forEach((select) => {
      const source = select.dataset.optionSource;
      let items = state.data?.[source] || [];
      if (source === "products" && select.closest('[data-lifecycle-form="save-passport"]')) {
        items = items.filter((item) => item.canManage);
      }
      if (source === "suppliers" && select.closest('[data-lifecycle-form="save-contractor"]')) {
        items = items.filter((item) => item.canManage);
      }
      const previous = select.value;
      select.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = select.dataset.optional === "true" ? "Seçilməyib" : "Seçin";
      select.append(placeholder);
      items.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = optionLabels[source]?.(item) || item.name || item.title || item.id;
        select.append(option);
      });
      if ([...select.options].some((option) => option.value === previous)) select.value = previous;
      select.disabled = items.length === 0;
      const form = select.closest("form");
      if (form && select.required) form.querySelector('button[type="submit"]')?.toggleAttribute("disabled", items.length === 0);
    });
  };

  const renderStats = () => {
    statsNode.innerHTML = Object.entries(statLabels).map(([key, label]) => `
      <article class="admin-stat-card">
        <span>${escapeHtml(label)}</span>
        <strong>${Number(state.data?.stats?.[key] || 0).toLocaleString("az-AZ")}</strong>
      </article>`).join("");
    document.querySelectorAll("[data-count]").forEach((node) => {
      const key = node.dataset.count;
      node.textContent = `${Number(state.data?.stats?.[key] || 0).toLocaleString("az-AZ")} qeyd`;
    });
  };

  const statusBadge = (status) => `<span class="data-badge" data-state="${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>`;
  const detail = (label, value) => `<span><small>${escapeHtml(label)}</small><strong>${escapeHtml(value ?? "—")}</strong></span>`;
  const actionButtons = (type, item) => {
    const transitions = {
      change_order: { draft: ["submitted", "cancelled"], submitted: ["approved", "rejected", "cancelled"], approved: ["implemented", "cancelled"] },
      warranty: { open: ["in_progress", "waiting_supplier", "rejected"], in_progress: ["waiting_supplier", "resolved", "rejected"], waiting_supplier: ["in_progress", "resolved", "rejected"], resolved: ["closed", "in_progress"] },
      surplus: { draft: ["published", "withdrawn"], published: ["reserved", "sold", "withdrawn", "expired"], reserved: ["published", "sold", "withdrawn"] },
      price_lock: { active: ["used", "cancelled", "expired"] }
    };
    const actor = state.data?.actor || {};
    const privileged = privilegedRoles.has(actor.role);
    let next = transitions[type]?.[item.status] || [];
    if (type === "change_order" && !privileged) next = next.filter((value) => ["submitted", "cancelled"].includes(value));
    if (type === "price_lock" && !privileged) next = next.filter((value) => value === "cancelled");
    if (!privileged) {
      const ownerId = item.requestedBy || item.customerId || item.ownerId;
      const supplierAccess = type === "warranty" && item.supplierCompanyId && item.supplierCompanyId === actor.companyId;
      if (supplierAccess) next = next.filter((value) => ["in_progress", "waiting_supplier", "resolved", "rejected"].includes(value));
      else if (ownerId && ownerId !== actor.id) next = [];
    }
    if (!next.length) return "";
    return `<div class="lifecycle-card-actions">${next.map((nextStatus) => `
      <button class="button button-outline" type="button" data-status-action data-entity-type="${type}" data-record-id="${escapeHtml(item.id)}" data-next-status="${nextStatus}">${escapeHtml(statusLabel(nextStatus))}</button>`).join("")}</div>`;
  };

  const renderCards = (key, items) => {
    const container = document.querySelector(`[data-lifecycle-records="${key}"]`);
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<p class="lifecycle-empty">Bu bölmədə hələ qeyd yoxdur.</p>';
      return;
    }
    const builders = {
      passports: (item) => ({
        title: item.productName, subtitle: item.passportCode,
        status: item.status, details: [detail("İstehsalçı", item.manufacturer), detail("Mənşə", item.originCountry || "—"), detail("Zəmanət", `${item.warrantyMonths || 0} ay`), detail("Yenilənib", asDate(item.updatedAt))],
        note: `Sertifikatlar: ${listText(item.certificateData)}`
      }),
      models: (item) => ({
        title: item.filename, subtitle: item.projectTitle,
        status: item.status, details: [detail("Format", String(item.modelFormat || "").toUpperCase()), detail("Element", Number(item.elementCount || 0).toLocaleString("az-AZ")), detail("Material", Number(item.materialCount || 0).toLocaleString("az-AZ")), detail("Tarix", asDate(item.createdAt))],
        note: item.issueNote || `Tapılan materiallar: ${listText(item.extractedItems)}`
      }),
      changes: (item) => ({
        title: `#${item.changeNumber} · ${item.title}`, subtitle: item.projectTitle,
        status: item.status, details: [detail("Büdcə fərqi", asMoney(item.costDelta, item.currency)), detail("Müddət fərqi", `${Number(item.daysDelta || 0)} gün`), detail("Səbəb", item.reason), detail("Tarix", asDate(item.createdAt))],
        note: item.scopeDescription, actions: actionButtons("change_order", item)
      }),
      warranties: (item) => ({
        title: `#${item.caseNumber} · ${item.title}`, subtitle: item.productName || item.projectTitle || item.supplierName || "Ümumi müraciət",
        status: item.status, details: [detail("Risk", statusLabel(item.severity)), detail("Təchizatçı", item.supplierName || "—"), detail("Son tarix", asDate(item.dueAt, true)), detail("Açılıb", asDate(item.createdAt))],
        note: item.description, actions: actionButtons("warranty", item)
      }),
      surplus: (item) => ({
        title: item.title, subtitle: item.projectTitle || item.city,
        status: item.status, details: [detail("Miqdar", `${item.quantity} ${item.unit}`), detail("Vəziyyət", statusLabel(item.condition)), detail("Qiymət", asMoney(item.unitPrice, item.currency)), detail("Şəhər", item.city)],
        note: item.description || "Əlavə təsvir yoxdur.", actions: actionButtons("surplus", item)
      }),
      handovers: (item) => ({
        title: item.rentalTitle, subtitle: `${statusLabel(item.reportType)} aktı`,
        status: item.equipmentCondition, details: [detail("Tarix", asDate(item.createdAt, true)), detail("Mühərrik saatı", item.engineHours ?? "—"), detail("Yanacaq", item.fuelLevel === null ? "—" : `${item.fuelLevel}%`), detail("Məkan", item.locationText || "—")],
        note: item.damageNotes || "Zədə qeydi yoxdur."
      }),
      contractors: (item) => ({
        title: item.supplierName, subtitle: statusLabel(item.contractorType),
        status: item.status, details: [detail("VÖEN", item.voen || "—"), detail("Komanda", `${item.teamSize || 0} nəfər`), detail("Regionlar", listText(item.regions)), detail("İxtisaslar", listText(item.specialties))],
        note: item.verificationNote || "Yoxlama qeydi yoxdur."
      }),
      locks: (item) => ({
        title: item.productName, subtitle: item.supplierName,
        status: item.status, details: [detail("Miqdar", item.quantity), detail("Kilidli qiymət", asMoney(item.lockedUnitPrice, item.currency)), detail("Bitir", asDate(item.expiresAt, true)), detail("Layihə", item.projectTitle || "—")],
        note: `Kilid kodu: ${item.id}`, actions: actionButtons("price_lock", item)
      })
    };
    container.innerHTML = items.map((item) => {
      const card = builders[key](item);
      return `<article class="lifecycle-record">
        <div class="lifecycle-record-head"><div><h3>${escapeHtml(card.title || "Qeyd")}</h3><p>${escapeHtml(card.subtitle || "")}</p></div>${statusBadge(card.status)}</div>
        <div class="lifecycle-record-details">${card.details.join("")}</div>
        <p class="lifecycle-record-note">${escapeHtml(card.note || "")}</p>
        ${card.actions || ""}
      </article>`;
    }).join("");
  };

  const render = () => {
    renderStats();
    populateSelects();
    Object.keys(statLabels).forEach((key) => renderCards(key, state.data?.[key] || []));
  };

  const formPayload = async (form) => {
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.action = form.dataset.lifecycleForm;
    if (payload.action === "save-passport") payload.batchTracking = form.elements.batchTracking.checked;
    if (payload.action === "analyze-model") {
      const file = form.elements.modelFile.files?.[0];
      if (!file) throw new Error("Model faylını seçin.");
      if (file.size > 1_000_000) throw new Error("Brauzer analizi üçün IFC faylı 1 MB-dan kiçik olmalıdır. Böyük fayl üçün HTTPS ünvanı əlavə edin.");
      payload.filename = file.name;
      payload.modelFormat = file.name.split(".").pop()?.toLowerCase() || "other";
      payload.contentText = payload.modelFormat === "ifc" || payload.modelFormat === "txt" ? await file.text() : "";
      delete payload.modelFile;
    }
    return payload;
  };

  const submitForm = async (form) => {
    if (state.busy) return;
    state.busy = true;
    const button = form.querySelector('button[type="submit"]');
    const original = button?.textContent;
    if (button) { button.disabled = true; button.textContent = "Saxlanılır..."; }
    setStatus("Məlumat yoxlanılır və saxlanılır.");
    try {
      const result = await api.lifecycleMutation(await formPayload(form));
      state.data = result.data;
      render();
      form.reset();
      setStatus("Əməliyyat uğurla tamamlandı.", "success");
    } catch (error) {
      setStatus(error.message || "Əməliyyat tamamlanmadı.", "error");
    } finally {
      state.busy = false;
      if (button) { button.disabled = false; button.textContent = original; }
      populateSelects();
    }
  };

  const updateRecordStatus = async (button) => {
    if (state.busy) return;
    state.busy = true;
    button.disabled = true;
    setStatus("Status yenilənir.");
    try {
      const result = await api.lifecycleMutation({
        action: "update-status", entityType: button.dataset.entityType,
        id: button.dataset.recordId, status: button.dataset.nextStatus
      });
      state.data = result.data;
      render();
      setStatus("Status yeniləndi.", "success");
    } catch (error) {
      setStatus(error.message || "Status yenilənmədi.", "error");
    } finally {
      state.busy = false;
      button.disabled = false;
    }
  };

  document.querySelectorAll("[data-lifecycle-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-lifecycle-tab]").forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll("[data-lifecycle-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.lifecyclePanel !== tab.dataset.lifecycleTab;
      });
      tab.parentElement?.scrollTo({ left: Math.max(0, tab.offsetLeft - 12), behavior: "smooth" });
    });
  });
  root.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-lifecycle-form]");
    if (!form) return;
    event.preventDefault();
    submitForm(form);
  });
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-status-action]");
    if (button) updateRecordStatus(button);
  });

  api.session()
    .then(async (session) => {
      if (!session.user) {
        sessionNode.innerHTML = '<a class="button button-outline" href="login.html?next=lifecycle-center.html">Hesaba daxil ol</a>';
        root.querySelectorAll("form input, form select, form textarea, form button").forEach((control) => { control.disabled = true; });
        setStatus("Məlumatları görmək və əməliyyat aparmaq üçün hesabınıza daxil olun.", "warning");
        return;
      }
      const lifecycle = await api.lifecycle();
      state.data = lifecycle.data;
      sessionNode.textContent = `${session.user.name} · ${session.user.role}`;
      render();
      setStatus("Məlumatlar yeniləndi.", "success");
    })
    .catch((error) => {
      sessionNode.textContent = "Bağlantı xətası";
      setStatus(error.message || "Həyat dövrü məlumatları yüklənmədi.", "error");
    });
})();
