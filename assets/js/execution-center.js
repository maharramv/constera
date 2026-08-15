(function initExecutionCenter() {
  if (document.body?.dataset.page !== "execution-center") return;
  const api = window.ConstEraAPI;
  const root = document.querySelector("[data-execution-root]");
  const sessionNode = document.querySelector("[data-execution-session]");
  const statusNode = document.querySelector("[data-execution-status]");
  const statsNode = document.querySelector("[data-execution-stats]");
  if (!api || !root || !sessionNode || !statusNode || !statsNode) return;

  const state = { data: null, busy: false };
  const privilegedRoles = new Set(["super_admin", "admin", "sales"]);
  const labels = {
    draft: "Qaralama", active: "Aktiv", suspended: "Dayandırılıb", completed: "Tamamlanıb", cancelled: "Ləğv edilib",
    submitted: "Təsdiq gözləyir", accepted: "Qəbul edilib", rejected: "Rədd edilib",
    certified: "Sertifikatlaşdırılıb", paid: "Ödənilib", interim: "Aralıq Forma 2/3", final: "Yekun hesablaşma"
  };
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const label = (value) => labels[value] || String(value || "Məlum deyil");
  const money = (value, currency = "AZN") => new Intl.NumberFormat("az-AZ", { style: "currency", currency }).format(Number(value || 0));
  const date = (value) => value ? new Intl.DateTimeFormat("az-AZ", { dateStyle: "medium" }).format(new Date(value)) : "—";
  const number = (value, digits = 3) => Number(value || 0).toLocaleString("az-AZ", { maximumFractionDigits: digits });
  const setStatus = (message, type = "info") => { statusNode.textContent = message; statusNode.dataset.type = type; };
  const badge = (value) => `<span class="data-badge" data-state="${escapeHtml(value)}">${escapeHtml(label(value))}</span>`;
  const detail = (name, value) => `<span><small>${escapeHtml(name)}</small><strong>${escapeHtml(value)}</strong></span>`;
  const isManager = (record) => privilegedRoles.has(state.data?.actor?.role) || record.customerId === state.data?.actor?.id;

  const sourceItems = (source) => {
    if (source === "activeContracts") return (state.data?.contracts || []).filter((item) => item.status === "active");
    if (source === "payableContracts") return (state.data?.contracts || []).filter((item) => ["active", "suspended"].includes(item.status));
    return state.data?.[source] || [];
  };
  const optionText = {
    projects: (item) => `${item.title} · ${label(item.status)}`,
    suppliers: (item) => `${item.name}${item.region ? ` · ${item.region}` : ""}`,
    contracts: (item) => `#${item.contractNumber} · ${item.title} · ${item.contractorName}`,
    activeContracts: (item) => `#${item.contractNumber} · ${item.title}`,
    payableContracts: (item) => `#${item.contractNumber} · ${item.title}`,
    boqItems: (item) => `${item.itemCode} · ${item.title} · qalıq ${number(Number(item.contractQuantity) - Number(item.acceptedQuantity))} ${item.unit}`,
    changes: (item) => `#${item.changeNumber} · ${item.title} · ${money(item.costDelta, item.currency)}`
  };

  const populateSelect = (select) => {
    const source = select.dataset.optionSource;
    let items = sourceItems(source);
    if (source === "boqItems") {
      const contractId = select.form?.elements.contractId?.value;
      if (contractId) items = items.filter((item) => item.contractId === contractId && item.status === "active");
    }
    if (source === "changes") {
      const contractId = select.form?.elements.contractId?.value;
      const contract = (state.data?.contracts || []).find((item) => item.id === contractId);
      if (contract) items = items.filter((item) => item.projectId === contract.projectId);
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
      option.textContent = optionText[source]?.(item) || item.title || item.name || item.id;
      select.append(option);
    });
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    select.disabled = items.length === 0;
  };
  const populateSelects = () => document.querySelectorAll("select[data-option-source]").forEach(populateSelect);

  const renderStats = () => {
    const stats = state.data?.stats || {};
    const cards = [
      ["Müqavilə", stats.contracts], ["BOQ mövqeyi", stats.boqItems],
      ["Təsdiq gözləyən ölçmə", stats.submittedMeasurements], ["Təsdiqlənmiş akt", stats.certifiedCertificates],
      ["Ödəniş gözləyir", money(stats.payableTotal)]
    ];
    statsNode.innerHTML = cards.map(([name, value]) => `<article class="admin-stat-card"><span>${escapeHtml(name)}</span><strong>${escapeHtml(value ?? 0)}</strong></article>`).join("");
    const counts = { contracts: state.data?.contracts?.length, boqItems: state.data?.boqItems?.length, measurements: state.data?.measurements?.length, certificates: state.data?.certificates?.length };
    document.querySelectorAll("[data-count]").forEach((node) => { node.textContent = `${number(counts[node.dataset.count] || 0, 0)} qeyd`; });
  };

  const contractActions = (item) => {
    if (!isManager(item)) return "";
    const transitions = { draft: ["active", "cancelled"], active: ["suspended", "completed", "cancelled"], suspended: ["active", "cancelled"] };
    return actionButtons("contract", item.id, transitions[item.status] || []);
  };
  const actionButtons = (type, id, next) => next.length ? `<div class="lifecycle-card-actions">${next.map((status) => `<button class="button button-outline" type="button" data-execution-action data-entity-type="${type}" data-record-id="${escapeHtml(id)}" data-next-status="${status}">${escapeHtml(label(status))}</button>`).join("")}</div>` : "";

  const renderContracts = () => {
    const container = document.querySelector('[data-execution-records="contracts"]');
    const items = state.data?.contracts || [];
    if (!items.length) { container.innerHTML = '<p class="lifecycle-empty">Hələ iş müqaviləsi yaradılmayıb.</p>'; return; }
    container.innerHTML = items.map((item) => `<article class="lifecycle-record">
      <div class="lifecycle-record-head"><div><h3>#${number(item.contractNumber, 0)} · ${escapeHtml(item.title)}</h3><p>${escapeHtml(item.projectTitle)} · ${escapeHtml(item.contractorName)}</p></div>${badge(item.status)}</div>
      <div class="lifecycle-record-details">${detail("Müqavilə", money(item.contractAmount, item.currency))}${detail("BOQ", money(item.boqAmount, item.currency))}${detail("Təsdiqlənmiş iş", money(item.acceptedAmount, item.currency))}${detail("Ödənilib", money(item.paidNet, item.currency))}</div>
      <progress class="execution-progress" max="100" value="${Math.min(100, Number(item.progressPercent || 0))}" aria-label="İcra ${number(item.progressPercent, 1)} faiz">${number(item.progressPercent, 1)}%</progress>
      <p class="lifecycle-record-note">İcra: ${number(item.progressPercent, 1)}% · Avans ${number(item.advancePercent, 2)}% · Zəmanət saxlaması ${number(item.retentionPercent, 2)}%</p>
      ${contractActions(item)}
    </article>`).join("");
  };

  const renderBoq = () => {
    const container = document.querySelector('[data-execution-table="boq"]');
    const items = state.data?.boqItems || [];
    if (!items.length) { container.innerHTML = '<p class="lifecycle-empty">Hələ BOQ mövqeyi yoxdur.</p>'; return; }
    const contracts = new Map((state.data?.contracts || []).map((item) => [item.id, item]));
    container.innerHTML = `<table class="execution-table"><thead><tr><th>Kod və iş</th><th>Müqavilə</th><th>Miqdar</th><th>Qəbul</th><th>Qalıq</th><th>Vahid qiymət</th><th>Məbləğ</th></tr></thead><tbody>${items.map((item) => {
      const contract = contracts.get(item.contractId);
      const remaining = Math.max(0, Number(item.contractQuantity) - Number(item.acceptedQuantity));
      return `<tr><td><strong>${escapeHtml(item.itemCode)} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(item.workCategory || "Digər iş")}${item.changeNumber ? ` · Dəyişiklik #${number(item.changeNumber, 0)}` : ""}</small></td><td>${escapeHtml(contract?.title || item.contractTitle)}</td><td>${number(item.contractQuantity)} ${escapeHtml(item.unit)}</td><td>${number(item.acceptedQuantity)} ${escapeHtml(item.unit)}</td><td>${number(remaining)} ${escapeHtml(item.unit)}</td><td class="execution-money">${money(item.unitRate, contract?.currency)}</td><td class="execution-money">${money(Number(item.contractQuantity) * Number(item.unitRate), contract?.currency)}</td></tr>`;
    }).join("")}</tbody></table>`;
  };

  const measurementActions = (item) => {
    const actor = state.data?.actor || {};
    const manager = isManager(item);
    let next = [];
    if (item.status === "draft" && (manager || item.submittedBy === actor.id)) next = ["submitted", "cancelled"];
    if (item.status === "submitted") {
      if (manager && item.submittedBy !== actor.id) next = ["accepted", "rejected", "cancelled"];
      else if (item.submittedBy === actor.id) next = ["cancelled"];
    }
    return actionButtons("measurement", item.id, next);
  };
  const renderMeasurements = () => {
    const container = document.querySelector('[data-execution-records="measurements"]');
    const items = state.data?.measurements || [];
    if (!items.length) { container.innerHTML = '<p class="lifecycle-empty">Hələ sahə ölçməsi yoxdur.</p>'; return; }
    container.innerHTML = items.map((item) => `<article class="lifecycle-record" data-risk="${item.status === "submitted" ? "pending" : ""}">
      <div class="lifecycle-record-head"><div><h3>#${number(item.measurementNumber, 0)} · ${escapeHtml(item.itemTitle)}</h3><p>${escapeHtml(item.projectTitle)} · ${escapeHtml(item.contractTitle)}</p></div>${badge(item.status)}</div>
      <div class="lifecycle-record-details">${detail("Miqdar", `${number(item.measuredQuantity)} ${item.unit}`)}${detail("Məbləğ", money(Number(item.measuredQuantity) * Number(item.unitRate), item.currency))}${detail("İş tarixi", date(item.workDate))}${detail("Zona", item.locationText || "—")}</div>
      <p class="lifecycle-record-note">${escapeHtml(item.note || "Əlavə qeyd yoxdur.")}</p>${measurementActions(item)}
    </article>`).join("");
  };

  const certificateActions = (item) => {
    const actor = state.data?.actor || {};
    const manager = isManager(item);
    let next = [];
    if (item.status === "draft" && (manager || item.submittedBy === actor.id)) next = ["submitted", "cancelled"];
    if (item.status === "submitted") {
      if (manager && item.submittedBy !== actor.id) next = ["certified", "rejected", "cancelled"];
      else if (item.submittedBy === actor.id) next = ["cancelled"];
    }
    if (item.status === "rejected" && (manager || item.submittedBy === actor.id)) next = ["draft", "cancelled"];
    if (item.status === "certified" && manager) next = ["paid"];
    return actionButtons("certificate", item.id, next);
  };
  const renderCertificates = () => {
    const container = document.querySelector('[data-execution-records="certificates"]');
    const items = state.data?.certificates || [];
    if (!items.length) { container.innerHTML = '<p class="lifecycle-empty">Hələ ödəniş aktı yoxdur.</p>'; return; }
    container.innerHTML = items.map((item) => `<article class="lifecycle-record" data-risk="${item.status === "submitted" ? "pending" : item.status === "certified" ? "payable" : ""}">
      <div class="lifecycle-record-head"><div><h3>CE-AKT-${number(item.certificateNumber, 0)} · ${escapeHtml(label(item.certificateType))}</h3><p>${escapeHtml(item.projectTitle)} · ${escapeHtml(item.contractorName)}</p></div>${badge(item.status)}</div>
      <div class="lifecycle-record-details">${detail("İş məbləği", money(item.workAmount, item.currency))}${detail("Avans tutulması", money(item.advanceRecoveryAmount, item.currency))}${detail("Zəmanət saxlaması", money(item.retentionAmount, item.currency))}${detail("Ödənəcək", money(item.netPayable, item.currency))}</div>
      <p class="lifecycle-record-note">${date(item.periodStart)}–${date(item.periodEnd)} · ${number(item.lineCount, 0)} ölçmə mövqeyi${item.paymentReference ? ` · Ödəniş: ${escapeHtml(item.paymentReference)}` : ""}</p>
      <a class="button button-outline execution-record-link" href="execution-certificate.html?id=${encodeURIComponent(item.id)}">Aktı aç / PDF</a>${certificateActions(item)}
    </article>`).join("");
  };

  const render = () => { renderStats(); populateSelects(); renderContracts(); renderBoq(); renderMeasurements(); renderCertificates(); };
  const setDateDefaults = () => {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    const monthStart = `${iso.slice(0, 8)}01`;
    document.querySelectorAll('input[name="startDate"], input[name="workDate"], input[name="periodEnd"]').forEach((input) => { if (!input.value) input.value = iso; });
    document.querySelectorAll('input[name="periodStart"]').forEach((input) => { if (!input.value) input.value = monthStart; });
  };
  const submit = async (form) => {
    if (state.busy) return;
    state.busy = true;
    const button = form.querySelector('button[type="submit"]');
    const original = button?.textContent;
    if (button) { button.disabled = true; button.textContent = "Saxlanılır..."; }
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.action = form.dataset.executionForm;
      if (payload.action === "create-certificate") payload.releaseRetention = form.elements.releaseRetention.checked;
      const result = await api.executionMutation(payload);
      state.data = result.data;
      form.reset(); render(); setDateDefaults(); setStatus("Əməliyyat uğurla tamamlandı.", "success");
    } catch (error) { setStatus(error.message || "Əməliyyat tamamlanmadı.", "error"); }
    finally { state.busy = false; if (button) { button.disabled = false; button.textContent = original; } populateSelects(); }
  };
  const updateStatus = async (button) => {
    if (state.busy) return;
    const type = button.dataset.entityType;
    const status = button.dataset.nextStatus;
    const payload = { action: `update-${type}-status`, id: button.dataset.recordId, status };
    if (type === "measurement" && ["accepted", "rejected"].includes(status)) payload.reviewNote = window.prompt("Təsdiq qeydi (istəyə bağlı)", "") || "";
    if (type === "certificate" && status === "paid") {
      payload.paymentReference = window.prompt("Bank ödəniş istinadını daxil edin") || "";
      if (!payload.paymentReference) return;
    }
    state.busy = true; button.disabled = true;
    try { const result = await api.executionMutation(payload); state.data = result.data; render(); setStatus("Status yeniləndi.", "success"); }
    catch (error) { setStatus(error.message || "Status yenilənmədi.", "error"); }
    finally { state.busy = false; button.disabled = false; }
  };

  root.addEventListener("submit", (event) => { const form = event.target.closest("[data-execution-form]"); if (form) { event.preventDefault(); submit(form); } });
  root.addEventListener("click", (event) => { const button = event.target.closest("[data-execution-action]"); if (button) updateStatus(button); });
  root.addEventListener("change", (event) => {
    if (event.target.matches('select[name="contractId"]')) event.target.form?.querySelectorAll('select[data-option-source="boqItems"], select[data-option-source="changes"]').forEach(populateSelect);
  });
  document.querySelectorAll("[data-execution-tab]").forEach((tab) => tab.addEventListener("click", () => {
    document.querySelectorAll("[data-execution-tab]").forEach((item) => { const active = item === tab; item.classList.toggle("is-active", active); item.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-execution-panel]").forEach((panel) => { panel.hidden = panel.dataset.executionPanel !== tab.dataset.executionTab; });
    tab.parentElement?.scrollTo({ left: Math.max(0, tab.offsetLeft - 12), behavior: "smooth" });
  }));
  setDateDefaults();
  api.session().then(async (session) => {
    if (!session.user) {
      sessionNode.innerHTML = '<a class="button button-outline" href="login.html?next=execution-center.html">Hesaba daxil ol</a>';
      root.querySelectorAll("form input, form select, form textarea, form button").forEach((control) => { control.disabled = true; });
      setStatus("Məlumatları görmək və əməliyyat aparmaq üçün hesabınıza daxil olun.", "warning"); return;
    }
    state.data = (await api.execution()).data;
    sessionNode.textContent = `${session.user.name} · ${session.user.role}`;
    render(); setDateDefaults(); setStatus("İcra və ödəniş məlumatları yeniləndi.", "success");
  }).catch((error) => { sessionNode.textContent = "Bağlantı xətası"; setStatus(error.message || "Məlumatlar yüklənmədi.", "error"); });
})();
