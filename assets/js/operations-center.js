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
  const state = { data: null, procurement: null, invoiceAiRunId: "" };
  const statusLabels = {
    draft: "Qaralama", active: "Aktiv", suspended: "Dayandırılıb", expired: "Müddəti bitib",
    terminated: "Xitam verilib", approved: "Təsdiqlənib", paid: "Ödənilib", cancelled: "Ləğv edilib",
    pending: "Gözləyir", accepted: "Qəbul edilib", preparing: "Hazırlanır", ready: "Hazırdır",
    shipped: "Göndərilib", delivered: "Çatdırılıb", in_transit: "Yoldadır", exception: "Problem var",
    returned: "Geri qaytarılıb", completed: "Tamamlanıb", failed: "Uğursuz", refunded: "Geri ödənilib",
    requires_action: "Əməliyyat tələb edir", registered: "Qeydiyyatda", matched: "Uyğundur",
    posted: "Qəbul edilib", void: "Ləğv edilib", not_evaluated: "Yoxlanmayıb"
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

  const purchaseOrderOptions = (selected = "") => {
    const items = (state.procurement?.purchaseOrders || []).filter((item) => !["draft", "cancelled"].includes(item.status));
    return `<option value="">Satınalma sifarişini seç</option>${items.map((item) =>
      `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>AS-${item.number} · #${item.orderNumber} · ${escapeHtml(item.supplierName)}</option>`
    ).join("")}`;
  };
  const selectedPurchaseOrder = (form) => (state.procurement?.purchaseOrders || [])
    .find((item) => item.id === form.elements.purchaseOrderId.value);
  const acceptedByItem = (purchaseOrderId) => {
    const result = new Map();
    (state.procurement?.receipts || []).filter((receipt) => receipt.purchaseOrderId === purchaseOrderId && receipt.status === "posted")
      .forEach((receipt) => receipt.items.forEach((item) => result.set(item.purchaseOrderItemId,
        Number(result.get(item.purchaseOrderItemId) || 0) + Number(item.acceptedQuantity || 0))));
    return result;
  };
  const invoicedByItem = (purchaseOrderId) => {
    const result = new Map();
    (state.procurement?.invoices || []).filter((invoice) => invoice.purchaseOrderId === purchaseOrderId && invoice.status !== "cancelled")
      .forEach((invoice) => invoice.items.forEach((item) => result.set(item.purchaseOrderItemId,
        Number(result.get(item.purchaseOrderItemId) || 0) + Number(item.quantity || 0))));
    return result;
  };
  const renderReceiptEditor = () => {
    const form = qs("[data-goods-receipt-form]");
    const purchaseOrder = selectedPurchaseOrder(form);
    const accepted = acceptedByItem(purchaseOrder?.id);
    qs("[data-receipt-item-rows]").innerHTML = purchaseOrder?.items.map((item) => {
      const remaining = Math.max(0, Number(item.quantity) - Number(accepted.get(item.id) || 0));
      return `<article data-receipt-item="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.sku)} · sifariş: ${item.quantity.toLocaleString("az-AZ")} ${escapeHtml(item.unit)} · qalıq: ${remaining.toLocaleString("az-AZ")}</small>
        <div class="admin-form-grid"><label class="admin-field"><span>Gələn</span><input data-received-quantity type="number" min="0" max="${item.quantity}" step="0.001" value="${remaining}"></label><label class="admin-field"><span>Rədd</span><input data-rejected-quantity type="number" min="0" step="0.001" value="0"></label></div>
      </article>`;
    }).join("") || "<p>Əvvəl satınalma sifarişini seç.</p>";
  };
  const refreshInvoiceTotals = () => {
    const form = qs("[data-supplier-invoice-form]");
    const subtotal = [...qs("[data-invoice-item-rows]").querySelectorAll("[data-invoice-line]")]
      .reduce((sum, row) => sum + Number(row.querySelector("[data-invoice-line-total]")?.value || 0), 0);
    form.elements.subtotal.value = subtotal.toFixed(2);
    form.elements.totalAmount.value = (subtotal + Number(form.elements.taxAmount.value || 0) + Number(form.elements.deliveryAmount.value || 0)).toFixed(2);
  };
  const renderInvoiceEditor = (draft = null) => {
    const form = qs("[data-supplier-invoice-form]");
    const purchaseOrder = selectedPurchaseOrder(form);
    const accepted = acceptedByItem(purchaseOrder?.id);
    const invoiced = invoicedByItem(purchaseOrder?.id);
    const draftItems = new Map((draft?.items || []).map((item) => [item.purchaseOrderItemId, item]));
    qs("[data-invoice-item-rows]").innerHTML = purchaseOrder?.items.map((item) => {
      const remaining = Math.max(0, Number(accepted.get(item.id) || 0) - Number(invoiced.get(item.id) || 0));
      const extracted = draftItems.get(item.id);
      const itemQuantity = extracted?.quantity ?? remaining;
      const itemPrice = extracted?.unitPrice ?? item.unitPrice ?? 0;
      const lineTotal = extracted?.lineTotal ?? itemQuantity * itemPrice;
      return `<article data-invoice-line="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.sku)} · qəbul edilib: ${Number(accepted.get(item.id) || 0).toLocaleString("az-AZ")} ${escapeHtml(item.unit)} · faktura qalığı: ${remaining.toLocaleString("az-AZ")}</small>
        <div class="admin-form-grid"><label class="admin-field"><span>Miqdar</span><input data-invoice-quantity type="number" min="0" step="0.001" value="${itemQuantity}"></label><label class="admin-field"><span>Vahid qiyməti</span><input data-invoice-unit-price type="number" min="0" step="0.01" value="${Number(itemPrice).toFixed(2)}"></label><label class="admin-field"><span>Sətir yekunu</span><input data-invoice-line-total type="number" min="0" step="0.01" value="${Number(lineTotal).toFixed(2)}"></label></div>
      </article>`;
    }).join("") || "<p>Əvvəl satınalma sifarişini seç.</p>";
    if (!draft) refreshInvoiceTotals();
  };
  const renderProcurement = () => {
    const data = state.procurement;
    if (!data) return;
    const receiptSelect = qs("[data-receipt-purchase-order]");
    const invoiceSelect = qs("[data-invoice-purchase-order]");
    receiptSelect.innerHTML = purchaseOrderOptions(receiptSelect.value);
    invoiceSelect.innerHTML = purchaseOrderOptions(invoiceSelect.value);
    const summary = data.summary || {};
    qs("[data-procurement-control-kpis]").innerHTML = [
      ["Açıq sifariş", summary.openPurchaseOrders], ["Mal qəbulu", summary.postedReceipts],
      ["Fərqli faktura", summary.matchExceptions], ["Təsdiq gözləyir", summary.awaitingApproval],
      ["Ödəniş gözləyir", summary.awaitingPayment], ["Qeydiyyat məbləği (AZN)", money(summary.registeredAmount)]
    ].map(([label, value]) => `<article><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`).join("");
    qs("[data-procurement-control-count]").textContent = `${data.invoices.length} faktura`;
    qs("[data-goods-receipt-count]").textContent = `${data.receipts.length} qəbul`;
    qs("[data-goods-receipt-rows]").innerHTML = data.receipts.map((item) => {
      const accepted = item.items.reduce((sum, row) => sum + row.acceptedQuantity, 0);
      const rejected = item.items.reduce((sum, row) => sum + row.rejectedQuantity, 0);
      return `<tr data-receipt-id="${escapeHtml(item.id)}"><td data-label="Qəbul"><strong>MQ-${item.number}</strong><small>${date(item.receivedAt, true)} · ${escapeHtml(item.deliveryNoteNumber || "Sənədsiz")}</small></td><td data-label="Satınalma sifarişi"><strong>AS-${item.purchaseOrderNumber}</strong><small>${escapeHtml(item.supplierName)}</small></td><td data-label="Miqdar">${accepted.toLocaleString("az-AZ")} qəbul<small>${rejected.toLocaleString("az-AZ")} rədd</small></td><td data-label="Sənəd">${item.fileUrl ? `<a class="table-action" href="${escapeHtml(item.fileUrl)}" target="_blank" rel="noopener">Aç</a>` : "-"}</td><td data-label="Vəziyyət"><span class="status-pill" data-status="${escapeHtml(item.status)}">${escapeHtml(statusLabels[item.status] || item.status)}</span>${item.voidReason ? `<small>${escapeHtml(item.voidReason)}</small>` : ""}</td><td data-label="Əməliyyat">${item.status === "posted" ? '<button class="table-action is-danger" type="button" data-void-receipt>Ləğv et</button>' : "-"}</td></tr>`;
    }).join("") || '<tr><td colspan="6">Mal qəbulu yoxdur.</td></tr>';
    qs("[data-supplier-invoice-count]").textContent = `${data.invoices.length} faktura`;
    qs("[data-supplier-invoice-rows]").innerHTML = data.invoices.map((item) => {
      const purchaseOrder = data.purchaseOrders.find((row) => row.id === item.purchaseOrderId);
      const issues = item.matchResult?.issues || [];
      const actions = item.status === "matched"
        ? '<button class="table-action" data-invoice-action="approve-invoice">Təsdiqlə</button>'
        : item.status === "approved"
          ? '<button class="table-action" data-invoice-action="pay-invoice">Ödənildi</button>'
          : ["registered", "exception"].includes(item.status)
            ? '<button class="table-action" data-invoice-action="recheck-invoice">Yenidən yoxla</button>'
            : "";
      const cancel = !["paid", "cancelled"].includes(item.status) ? '<button class="table-action is-danger" data-invoice-action="cancel-invoice">Ləğv et</button>' : "";
      return `<tr data-invoice-id="${escapeHtml(item.id)}"><td data-label="Faktura"><strong>${escapeHtml(item.invoiceNumber)}</strong><small>SF-${item.internalNumber} · ${date(item.invoiceDate)}</small>${item.fileUrl ? `<small><a class="table-action" href="${escapeHtml(item.fileUrl)}" target="_blank" rel="noopener">Sənəd</a></small>` : ""}</td><td data-label="Sifariş / layihə"><strong>AS-${item.purchaseOrderNumber} · ${escapeHtml(item.supplierName)}</strong><small>${escapeHtml(purchaseOrder?.projectTitle || "Layihəyə bağlanmayıb")}</small>${purchaseOrder?.projectBudget !== null && purchaseOrder?.projectBudget !== undefined ? `<small>Büdcə öhdəliyi: ${money(purchaseOrder.projectCommitted)} / ${money(purchaseOrder.projectBudget)}</small>` : ""}</td><td data-label="Məbləğ"><strong>${money(item.totalAmount, item.currency)}</strong><small>Vergi: ${money(item.taxAmount, item.currency)}</small></td><td data-label="Uyğunlaşdırma"><span class="status-pill" data-status="${escapeHtml(item.matchStatus)}">${item.matchScore ?? 0}% · ${escapeHtml(statusLabels[item.matchStatus] || item.matchStatus)}</span>${issues.slice(0, 3).map((issue) => `<small>${escapeHtml(issue.message)}</small>`).join("")}</td><td data-label="Vəziyyət"><span class="status-pill" data-status="${escapeHtml(item.status)}">${escapeHtml(statusLabels[item.status] || item.status)}</span>${item.paymentReference ? `<small>${escapeHtml(item.paymentReference)}</small>` : ""}</td><td data-label="Əməliyyat"><div class="admin-v2-row-actions">${actions}${cancel}</div></td></tr>`;
    }).join("") || '<tr><td colspan="6">Faktura yoxdur.</td></tr>';
    renderReceiptEditor();
    renderInvoiceEditor();
  };

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
        <small>${item.legalConfirmed ? `Hüquqi təsdiq · ${date(item.legalConfirmedAt, true)}` : "Hüquqi təsdiq gözləyir"}</small>
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
    renderProcurement();
  };

  const load = async (message = "") => {
    const [operations, procurement] = await Promise.all([api.operationsCenter(), api.procurementControl()]);
    state.data = operations.data;
    state.procurement = procurement.data;
    render();
    setStatus(message || "Əməliyyat mərkəzi yeniləndi.", "success");
  };
  const contractForm = qs("[data-contract-form]");
  const settlementForm = qs("[data-settlement-form]");
  const trackingForm = qs("[data-tracking-form]");
  const receiptForm = qs("[data-goods-receipt-form]");
  const invoiceForm = qs("[data-supplier-invoice-form]");
  const today = new Date().toISOString().slice(0, 10);
  contractForm.elements.startsOn.value = today;
  settlementForm.elements.periodEnd.value = today;
  settlementForm.elements.periodStart.value = `${today.slice(0, 8)}01`;
  receiptForm.elements.receivedAt.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  invoiceForm.elements.invoiceDate.value = today;

  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Sənəd oxunmadı."));
    reader.readAsDataURL(file);
  });
  const uploadDocument = async (file, label) => {
    if (!file) return "";
    const result = await api.uploadMedia({
      filename: file.name, contentType: file.type, fileBase64: await fileToDataUrl(file),
      entityType: "general", altText: label, licenseType: "own", licenseNote: "Şirkətin satınalma sənədi."
    });
    return result.data.id;
  };

  receiptForm.elements.purchaseOrderId.addEventListener("change", renderReceiptEditor);
  invoiceForm.elements.purchaseOrderId.addEventListener("change", () => {
    state.invoiceAiRunId = "";
    const purchaseOrder = selectedPurchaseOrder(invoiceForm);
    if (purchaseOrder?.currency) invoiceForm.elements.currency.value = purchaseOrder.currency;
    renderInvoiceEditor();
  });
  qs("[data-invoice-item-rows]").addEventListener("input", (event) => {
    const row = event.target.closest("[data-invoice-line]");
    if (row && (event.target.matches("[data-invoice-quantity]") || event.target.matches("[data-invoice-unit-price]"))) {
      row.querySelector("[data-invoice-line-total]").value = (Number(row.querySelector("[data-invoice-quantity]").value || 0) * Number(row.querySelector("[data-invoice-unit-price]").value || 0)).toFixed(2);
    }
    refreshInvoiceTotals();
  });
  invoiceForm.elements.taxAmount.addEventListener("input", refreshInvoiceTotals);
  invoiceForm.elements.deliveryAmount.addEventListener("input", refreshInvoiceTotals);

  receiptForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = receiptForm.querySelector('button[type="submit"]');
    const items = [...qs("[data-receipt-item-rows]").querySelectorAll("[data-receipt-item]")].map((row) => ({
      purchaseOrderItemId: row.dataset.receiptItem,
      receivedQuantity: row.querySelector("[data-received-quantity]").value,
      rejectedQuantity: row.querySelector("[data-rejected-quantity]").value
    })).filter((item) => Number(item.receivedQuantity) > 0);
    setBusy(button, true, "Qeyd edilir...");
    try {
      const fields = Object.fromEntries(new FormData(receiptForm));
      fields.mediaAssetId = await uploadDocument(receiptForm.elements.document.files[0], "Mal qəbulu sənədi");
      delete fields.document;
      await api.procurementControlMutation({ action: "create-receipt", ...fields, items });
      receiptForm.reset();
      receiptForm.elements.receivedAt.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      await load("Mal qəbulu qeyd edildi və fakturalar yenidən yoxlanıldı.");
    } catch (error) { setStatus(error.message, "error"); } finally { setBusy(button, false); }
  });

  qs("[data-invoice-ai]").addEventListener("click", async (event) => {
    const file = invoiceForm.elements.document.files[0];
    const purchaseOrderId = invoiceForm.elements.purchaseOrderId.value;
    const status = qs("[data-invoice-ai-status]");
    if (!purchaseOrderId || !file) { status.textContent = "Əvvəl satınalma sifarişini və faktura faylını seç."; status.dataset.type = "error"; return; }
    if (file.size > 1_500_000) { status.textContent = "AI oxunuşu üçün fayl maksimum 1,5 MB ola bilər."; status.dataset.type = "error"; return; }
    setBusy(event.currentTarget, true, "Oxunur...");
    try {
      const encoded = await fileToDataUrl(file);
      const result = await api.procurementControlMutation({ action: "extract-invoice", purchaseOrderId, document: { fileName: file.name, mimeType: file.type, contentBase64: encoded.split(",")[1] || "" } });
      const draft = result.data.invoice;
      ["invoiceNumber", "invoiceDate", "dueDate", "currency", "subtotal", "taxAmount", "deliveryAmount", "totalAmount"].forEach((name) => { if (draft[name] !== undefined) invoiceForm.elements[name].value = draft[name]; });
      state.invoiceAiRunId = result.data.runId;
      renderInvoiceEditor(draft);
      status.textContent = `${Math.round(Number(result.data.confidence || 0) * 100)}% etibar · ${(draft.warnings || []).join(" · ") || "Məlumatlar formaya köçürüldü; təsdiqdən əvvəl yoxla."}`;
      status.dataset.type = "success";
    } catch (error) { status.textContent = error.message; status.dataset.type = "error"; } finally { setBusy(event.currentTarget, false); }
  });

  invoiceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = invoiceForm.querySelector('button[type="submit"]');
    const items = [...qs("[data-invoice-item-rows]").querySelectorAll("[data-invoice-line]")].map((row) => ({
      purchaseOrderItemId: row.dataset.invoiceLine,
      quantity: row.querySelector("[data-invoice-quantity]").value,
      unitPrice: row.querySelector("[data-invoice-unit-price]").value,
      lineTotal: row.querySelector("[data-invoice-line-total]").value
    })).filter((item) => Number(item.quantity) > 0);
    setBusy(button, true, "Yoxlanılır...");
    try {
      const fields = Object.fromEntries(new FormData(invoiceForm));
      fields.mediaAssetId = await uploadDocument(invoiceForm.elements.document.files[0], "Təchizatçı fakturası");
      fields.aiRunId = state.invoiceAiRunId;
      delete fields.document;
      await api.procurementControlMutation({ action: "create-invoice", ...fields, items });
      invoiceForm.reset(); state.invoiceAiRunId = ""; invoiceForm.elements.invoiceDate.value = today; invoiceForm.elements.taxAmount.value = 0; invoiceForm.elements.deliveryAmount.value = 0;
      await load("Faktura qeydiyyata alındı və üçlü uyğunlaşdırma tamamlandı.");
    } catch (error) { setStatus(error.message, "error"); } finally { setBusy(button, false); }
  });

  qs("[data-goods-receipt-rows]").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-void-receipt]");
    const id = button?.closest("[data-receipt-id]")?.dataset.receiptId;
    if (!button || !id) return;
    const note = window.prompt("Mal qəbulunun ləğv səbəbi", "");
    if (!note) return;
    setBusy(button, true);
    try { await api.procurementControlMutation({ action: "void-receipt", id, note }); await load("Mal qəbulu ləğv edildi."); }
    catch (error) { setStatus(error.message, "error"); } finally { setBusy(button, false); }
  });

  qs("[data-supplier-invoice-rows]").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-invoice-action]");
    const id = button?.closest("[data-invoice-id]")?.dataset.invoiceId;
    if (!button || !id) return;
    const action = button.dataset.invoiceAction;
    const payload = { action, id };
    if (action === "pay-invoice") payload.paymentReference = window.prompt("Bank və ya ödəniş istinadı", "") || "";
    if (action === "cancel-invoice") payload.note = window.prompt("Fakturanın ləğv səbəbi", "") || "";
    if ((action === "pay-invoice" && !payload.paymentReference) || (action === "cancel-invoice" && !payload.note)) return;
    setBusy(button, true);
    try { await api.procurementControlMutation(payload); await load("Faktura vəziyyəti yeniləndi."); }
    catch (error) { setStatus(error.message, "error"); } finally { setBusy(button, false); }
  });

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
    ["id", "supplierId", "contractNumber", "status", "commissionRate", "paymentTermsDays", "startsOn", "endsOn", "documentUrl", "note", "legalConfirmationNote"]
      .forEach((name) => { contractForm.elements[name].value = item[name] || ""; });
    contractForm.elements.legalConfirmed.checked = Boolean(item.legalConfirmed);
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
