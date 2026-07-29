(function initOperationsCenter() {
  const root = document.querySelector('[data-admin-panel="operations"]');
  const api = window.ConstEraAPI;
  if (!root || !api?.operationsCenter) return;

  const qs = (selector) => root.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const date = (value, time = false) => value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("az-AZ", time ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value))
    : "-";
  const money = (value, currency = "AZN") => Number(value || 0)
    .toLocaleString("az-AZ", { style: "currency", currency });
  const state = { data: null };
  const statusLabels = {
    draft: "Qaralama", active: "Aktiv", suspended: "Dayandırılıb", expired: "Müddəti bitib",
    terminated: "Xitam verilib", approved: "Təsdiqlənib", paid: "Ödənilib", cancelled: "Ləğv edilib",
    pending: "Gözləyir", accepted: "Qəbul edilib", preparing: "Hazırlanır", ready: "Hazırdır",
    shipped: "Göndərilib", delivered: "Çatdırılıb", in_transit: "Yoldadır", exception: "Problem var",
    returned: "Geri qaytarılıb", completed: "Tamamlanıb", failed: "Uğursuz", refunded: "Geri ödənilib",
    requires_action: "Əməliyyat tələb edir"
  };
  const securityLabels = {
    login_succeeded: "Giriş uğurludur", login_failed: "Giriş uğursuzdur", login_blocked: "Giriş bloklanıb",
    login_challenged: "2FA tələb edilib", two_factor_succeeded: "2FA uğurludur",
    two_factor_failed: "2FA uğursuzdur", password_reset_requested: "Şifrə bərpası istənib",
    password_reset_completed: "Şifrə yenilənib", sessions_revoked: "Sessiyalar bağlanıb"
  };
  const setStatus = (message, type = "") => {
    const node = qs("[data-operations-status]");
    node.textContent = message;
    if (type) node.dataset.type = type;
    else delete node.dataset.type;
  };
  const setBusy = (button, busy, label = "Gözlə...") => {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = label;
    } else if (button.dataset.label) button.textContent = button.dataset.label;
    button.disabled = busy;
  };
  const options = (selected = "") => (state.data?.suppliers || []).map((supplier) =>
    `<option value="${escapeHtml(supplier.id)}" ${supplier.id === selected ? "selected" : ""}>${escapeHtml(supplier.name)}</option>`
  ).join("");

  const render = () => {
    const data = state.data;
    if (!data) return;
    const summary = data.summary || {};
    qs("[data-operations-kpis]").innerHTML = [
      ["Aktiv müqavilə", summary.activeContracts],
      ["Qaralama müqavilə", summary.draftContracts],
      ["Aktivləşməyə hazır", summary.activationReadyContracts],
      ["Gözləyən hesablaşma", summary.pendingSettlements],
      ["Brüt dövriyyə", money(summary.settlementGross)],
      ["Komissiya", money(summary.commissionTotal)],
      ["Açıq çatdırılma", summary.openShipments],
      ["Yüksək risk", summary.highRiskEvents],
      ["Backup kanalı", summary.backupChannel || (summary.backupReady ? "Hazırdır" : "Qurulmayıb")]
    ].map(([label, value]) => `<article><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`).join("");
    qs("[data-contract-supplier]").innerHTML = options(qs("[data-contract-supplier]").value);
    qs("[data-settlement-supplier]").innerHTML = options(qs("[data-settlement-supplier]").value);
    qs("[data-tracking-fulfillment]").innerHTML = (data.fulfillments || []).map((item) =>
      `<option value="${escapeHtml(item.id)}">#${item.orderNumber} · ${escapeHtml(item.supplierName)} · ${escapeHtml(statusLabels[item.status] || item.status)}</option>`
    ).join("");

    qs("[data-contract-count]").textContent = `${data.contracts.length} müqavilə`;
    qs("[data-contract-rows]").innerHTML = data.contracts.map((item) => `<tr>
      <td data-label="Təchizatçı"><strong>${escapeHtml(item.supplierName)}</strong></td>
      <td data-label="Müqavilə"><strong>${escapeHtml(item.contractNumber)}</strong>${item.documentUrl ? `<small><a class="table-action" href="${escapeHtml(item.documentUrl)}" target="_blank" rel="noopener">Sənəd</a></small>` : ""}</td>
      <td data-label="Komissiya">${item.commissionRate}%<small>${item.paymentTermsDays} gün</small></td>
      <td data-label="Müddət">${date(item.startsOn)}<small>${item.endsOn ? date(item.endsOn) : "Müddətsiz"}</small></td>
      <td data-label="Vəziyyət">
        <span class="status-pill" data-status="${escapeHtml(item.status)}">${escapeHtml(statusLabels[item.status] || item.status)}</span>
        ${item.status !== "active" && !item.activationReadiness?.ready
          ? `<small>${escapeHtml((item.activationReadiness?.missing || []).join(" · "))}</small>`
          : ""}
      </td>
      <td data-label="Əməliyyat"><button class="table-action" type="button" data-contract-edit="${escapeHtml(item.id)}">Redaktə et</button></td>
    </tr>`).join("") || '<tr><td colspan="6">Müqavilə yoxdur.</td></tr>';

    qs("[data-settlement-count]").textContent = `${data.settlements.length} hesablaşma`;
    qs("[data-settlement-rows]").innerHTML = data.settlements.map((item) => {
      const actions = item.status === "draft"
        ? `<button class="table-action" data-settlement-action="approved">Təsdiqlə</button><button class="table-action is-danger" data-settlement-action="cancelled">Ləğv et</button>`
        : item.status === "approved"
          ? `<button class="table-action" data-settlement-action="paid">Ödənildi</button><button class="table-action is-danger" data-settlement-action="cancelled">Ləğv et</button>`
          : "";
      return `<tr data-settlement-id="${escapeHtml(item.id)}">
        <td data-label="Hesablaşma"><strong>#${item.settlementNumber} · ${escapeHtml(item.supplierName)}</strong><small>${item.itemCount} alt-sifariş · ${escapeHtml(item.contractNumber)}</small></td>
        <td data-label="Dövr">${date(item.periodStart)}<small>${date(item.periodEnd)}</small></td>
        <td data-label="Brüt">${money(item.grossAmount, item.currency)}</td>
        <td data-label="Komissiya / refund">${money(item.commissionAmount, item.currency)}<small>Refund: ${money(item.refundAmount, item.currency)}</small></td>
        <td data-label="Ödəniləcək"><strong>${money(item.netAmount, item.currency)}</strong>${item.adjustmentAmount ? `<small>Düzəliş: ${money(item.adjustmentAmount, item.currency)}</small>` : ""}</td>
        <td data-label="Vəziyyət"><span class="status-pill" data-status="${escapeHtml(item.status)}">${escapeHtml(statusLabels[item.status] || item.status)}</span></td>
        <td data-label="Əməliyyat"><div class="admin-v2-row-actions">${actions}</div></td>
      </tr>`;
    }).join("") || '<tr><td colspan="7">Hesablaşma yoxdur.</td></tr>';

    qs("[data-tracking-events]").innerHTML = (data.tracking || []).slice(0, 30).map((item) => `<article>
      <strong>#${item.orderNumber} · ${escapeHtml(item.supplierName)} · ${escapeHtml(statusLabels[item.status] || item.status)}</strong>
      <small>${escapeHtml(item.location || "Məkan göstərilməyib")} · ${date(item.occurredAt, true)}</small>
      ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
    </article>`).join("") || "<p>İzləmə hadisəsi yoxdur.</p>";

    const finance = [
      ...(data.finance?.payments || []).map((item) => ({ ...item, type: "Ödəniş" })),
      ...(data.finance?.refunds || []).map((item) => ({ ...item, type: "Geri ödəniş" }))
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 50);
    qs("[data-finance-rows]").innerHTML = finance.map((item) => `<tr>
      <td data-label="Sifariş">#${item.orderNumber}</td><td data-label="Növ">${item.type}</td>
      <td data-label="Provayder">${escapeHtml(item.provider)}</td><td data-label="Məbləğ">${money(item.amount, item.currency)}</td>
      <td data-label="Vəziyyət">${escapeHtml(statusLabels[item.status] || item.status)}</td><td data-label="Tarix">${date(item.created_at, true)}</td>
    </tr>`).join("") || '<tr><td colspan="6">Maliyyə əməliyyatı yoxdur.</td></tr>';

    qs("[data-security-count]").textContent = `${data.security.length} hadisə`;
    qs("[data-security-rows]").innerHTML = data.security.slice(0, 100).map((item) => `<tr>
      <td data-label="Vaxt">${date(item.createdAt, true)}</td><td data-label="İstifadəçi">${escapeHtml(item.userName)}</td>
      <td data-label="Hadisə">${escapeHtml(securityLabels[item.type] || item.type)}</td>
      <td data-label="Nəticə">${item.succeeded ? "Uğurlu" : "Uğursuz"}</td><td data-label="Risk">${escapeHtml(item.riskLevel)}</td>
    </tr>`).join("") || '<tr><td colspan="5">Təhlükəsizlik hadisəsi yoxdur.</td></tr>';

    qs("[data-backup-verifications]").innerHTML = (data.backupVerifications || []).map((item) => `<article>
      <strong>${item.status === "verified" ? "Yoxlanılıb" : "Xəta"} · ${escapeHtml(item.version)}</strong>
      <small>${item.tableCount} kolleksiya · ${item.recordCount.toLocaleString("az-AZ")} qeyd · ${date(item.createdAt, true)}</small>
      <small>SHA-256: ${escapeHtml(item.checksum.slice(0, 20))}… · ${escapeHtml(item.verifiedBy)}</small>
    </article>`).join("") || "<p>Backup bütövlüyü hələ yoxlanmayıb.</p>";
  };

  const load = async (message = "") => {
    state.data = (await api.operationsCenter()).data;
    render();
    setStatus(message || "Əməliyyat mərkəzi yeniləndi.", "success");
  };
  const contractForm = qs("[data-contract-form]");
  const settlementForm = qs("[data-settlement-form]");
  const trackingForm = qs("[data-tracking-form]");
  const today = new Date().toISOString().slice(0, 10);
  contractForm.elements.startsOn.value = today;
  settlementForm.elements.periodEnd.value = today;
  settlementForm.elements.periodStart.value = `${today.slice(0, 8)}01`;

  contractForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = contractForm.querySelector('button[type="submit"]');
    setBusy(button, true, "Saxlanır...");
    try {
      await api.saveSupplierContract(Object.fromEntries(new FormData(contractForm)));
      contractForm.reset();
      contractForm.elements.startsOn.value = today;
      await load("Müqavilə saxlanıldı.");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });
  qs("[data-contract-clear]").addEventListener("click", () => {
    contractForm.reset();
    contractForm.elements.id.value = "";
    contractForm.elements.startsOn.value = today;
  });
  qs("[data-contract-rows]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-contract-edit]");
    if (!button) return;
    const item = state.data.contracts.find((contract) => contract.id === button.dataset.contractEdit);
    if (!item) return;
    ["id", "supplierId", "contractNumber", "status", "commissionRate", "paymentTermsDays", "startsOn", "endsOn", "documentUrl", "note"]
      .forEach((name) => { contractForm.elements[name].value = item[name] || ""; });
    contractForm.elements.legalConfirmed.checked = false;
    contractForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  settlementForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = settlementForm.querySelector('button[type="submit"]');
    setBusy(button, true, "Hesablanır...");
    try {
      await api.generateSupplierSettlement(Object.fromEntries(new FormData(settlementForm)));
      await load("Hesablaşma qaralaması yaradıldı.");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });
  qs("[data-settlement-rows]").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-settlement-action]");
    const row = button?.closest("[data-settlement-id]");
    if (!button || !row) return;
    const status = button.dataset.settlementAction;
    const paymentReference = status === "paid" ? window.prompt("Bank və ya ödəniş istinadı", "") : "";
    if (status === "paid" && !paymentReference) return;
    if (status === "cancelled" && !window.confirm("Bu hesablaşma ləğv edilsin?")) return;
    setBusy(button, true);
    try {
      await api.updateSupplierSettlement({ id: row.dataset.settlementId, status, paymentReference });
      await load("Hesablaşma vəziyyəti yeniləndi.");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });
  trackingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = trackingForm.querySelector('button[type="submit"]');
    setBusy(button, true, "Əlavə edilir...");
    try {
      await api.addDeliveryTracking(Object.fromEntries(new FormData(trackingForm)));
      trackingForm.elements.location.value = "";
      trackingForm.elements.note.value = "";
      await load("Çatdırılma hadisəsi əlavə edildi.");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });
  qs("[data-backup-verify]").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, "Yoxlanır...");
    try {
      const result = await api.verifyCloudBackup();
      await load(`Backup yoxlandı: ${result.data.recordCount.toLocaleString("az-AZ")} qeyd.`);
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });
  qs("[data-operations-refresh]").addEventListener("click", (event) => {
    setBusy(event.currentTarget, true, "Yenilənir...");
    load().catch((error) => setStatus(error.message, "error")).finally(() => setBusy(event.currentTarget, false));
  });

  api.session().then((session) => {
    if (!["super_admin", "admin"].includes(session.user?.role)) throw new Error("Əməliyyat mərkəzi üçün administrator girişi tələb olunur.");
    return load();
  }).catch((error) => setStatus(error.message, "error"));
})();
