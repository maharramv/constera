(function initOrderDetail() {
  if (document.body.dataset.page !== "order-detail" || !window.ConstEraAPI) return;

  const qs = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const formatDate = (value, withTime = true) => {
    if (!value || !Number.isFinite(Date.parse(value))) return "-";
    return new Intl.DateTimeFormat("az-AZ", withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" }).format(new Date(value));
  };
  const formatMoney = (value, currency = "AZN") => value === null || value === undefined
    ? "Sorğu əsasında"
    : Number(value).toLocaleString("az-AZ", { style: "currency", currency });
  const statusLabels = {
    submitted: "Göndərilib",
    confirmed: "Təsdiqlənib",
    processing: "Hazırlanır",
    shipped: "Çatdırılır",
    completed: "Tamamlanıb",
    cancelled: "Ləğv edilib"
  };
  const paymentLabels = {
    pending: "Gözləyir",
    awaiting: "Ödəniş gözləyir",
    paid: "Ödənilib",
    failed: "Uğursuz",
    refunded: "Geri qaytarılıb"
  };
  const approvalLabels = {
    not_required: "Tələb olunmur",
    pending: "Təsdiq gözləyir",
    approved: "Təsdiqlənib",
    rejected: "Rədd edilib"
  };
  const transitions = {
    submitted: ["confirmed", "cancelled"],
    confirmed: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["completed"],
    completed: [],
    cancelled: []
  };
  const orderId = new URLSearchParams(window.location.search).get("order") || "";
  const statusNode = qs("[data-order-detail-status]");
  const documentNode = qs("[data-order-document]");
  const adminPanel = qs("[data-order-admin-panel]");
  const adminForm = qs("[data-order-admin-form]");
  let order = null;
  let sessionUser = null;
  let integrations = {};
  let activeDocumentId = "";

  const setStatus = (message, type = "info") => {
    statusNode.textContent = message;
    statusNode.dataset.type = type;
  };

  const currentDocument = () => {
    const documents = order?.documents || [];
    return documents.find((item) => item.id === activeDocumentId)
      || documents.find((item) => item.type === "proforma_invoice")
      || documents.find((item) => item.type === "order_summary")
      || null;
  };

  const renderHistory = () => {
    const history = order?.history || [];
    qs("[data-order-history-count]").textContent = `${history.length} mərhələ`;
    qs("[data-order-history]").innerHTML = history.map((item) => {
      const statusChanged = item.fromStatus && item.fromStatus !== item.toStatus;
      const paymentChanged = item.fromPaymentStatus && item.fromPaymentStatus !== item.toPaymentStatus;
      return `<article>
        <strong>${escapeHtml(statusLabels[item.toStatus] || item.toStatus)} · ${escapeHtml(paymentLabels[item.toPaymentStatus] || item.toPaymentStatus)}</strong>
        <span>${statusChanged ? `${escapeHtml(statusLabels[item.fromStatus] || item.fromStatus)} → ` : ""}${paymentChanged ? `Ödəniş: ${escapeHtml(paymentLabels[item.fromPaymentStatus] || item.fromPaymentStatus)} → ` : ""}${escapeHtml(item.actorName)} · ${formatDate(item.createdAt)}</span>
        ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
      </article>`;
    }).join("") || "<p>Tarixçə qeydi yoxdur.</p>";
  };

  const renderFulfillments = () => {
    const labels = {
      pending: "Gözləyir",
      accepted: "Qəbul edilib",
      preparing: "Hazırlanır",
      ready: "Göndərişə hazırdır",
      shipped: "Göndərilib",
      delivered: "Çatdırılıb",
      cancelled: "Ləğv edilib"
    };
    const reservationLabels = {
      active: "Stok rezerv edilib",
      shortage: "Stok çatışmır",
      released: "Rezerv buraxılıb",
      consumed: "Stokdan çıxılıb"
    };
    const fulfillments = order?.fulfillments || [];
    const reservations = order?.reservations || [];
    qs("[data-order-fulfillment-count]").textContent = `${fulfillments.length} icra`;
    qs("[data-order-fulfillments]").innerHTML = fulfillments.map((item) => {
      const supplierReservations = reservations.filter((reservation) => reservation.supplierId === item.supplierId);
      return `<article>
        <strong>${escapeHtml(item.supplierName || "Təchizatçı")} · ${escapeHtml(labels[item.status] || item.status)}</strong>
        <span>${escapeHtml([item.deliveryProvider, item.trackingCode].filter(Boolean).join(" · ") || "Göndəriş məlumatı gözlənilir")}</span>
        ${supplierReservations.map((reservation) => `<small>${escapeHtml(reservationLabels[reservation.status] || reservation.status)} · ${Number(reservation.quantity).toLocaleString("az-AZ")}</small>`).join("")}
      </article>`;
    }).join("") || "<p>Təchizatçı icra qeydi yoxdur.</p>";
  };

  const renderProcurement = () => {
    const request = order?.procurement;
    const quote = order?.deliveryQuote;
    const approvalStatus = order?.approvalStatus || "not_required";
    qs("[data-order-approval-status]").textContent = approvalLabels[approvalStatus];
    const details = [];
    if (quote) {
      details.push(`<article>
        <strong>${escapeHtml(quote.zoneName || quote.city)} · ${formatMoney(quote.amount, quote.currency)}</strong>
        <span>${quote.etaMinDays}-${quote.etaMaxDays} gün · ${quote.supplierCount} təchizatçı · ${Number(quote.itemQuantity).toLocaleString("az-AZ")} vahid</span>
        <small>ConstEra platforma logistika tarifi üzrə sifariş zamanı hesablanıb.</small>
      </article>`);
    }
    if (request) {
      details.push(`<article>
        <strong>${escapeHtml(request.companyName || order.companyName)} · ${approvalLabels[request.status] || request.status}</strong>
        <span>${request.approvedCount}/${request.requiredApprovals} təsdiq · ${escapeHtml(request.costCenter || "Xərc mərkəzi göstərilməyib")}</span>
        <small>${request.budgetAmount === null ? "Büdcə limiti yoxdur" : `Büdcə limiti: ${formatMoney(request.budgetAmount)}`}${request.note ? ` · ${escapeHtml(request.note)}` : ""}</small>
      </article>`);
      (request.decisions || []).forEach((decision) => {
        details.push(`<article>
          <strong>${escapeHtml(decision.actorName)} · ${decision.decision === "approved" ? "Təsdiqlədi" : "Rədd etdi"}</strong>
          <span>${formatDate(decision.createdAt)}</span>
          ${decision.note ? `<small>${escapeHtml(decision.note)}</small>` : ""}
        </article>`);
      });
    }
    qs("[data-order-procurement-details]").innerHTML = details.join("")
      || "<p>Bu sifariş üçün ayrıca logistika və təsdiq qeydi yoxdur.</p>";
    const privileged = ["super_admin", "admin", "sales"].includes(sessionUser?.role);
    const sameCompanyApprover = sessionUser?.role === "customer"
      && request?.companyId
      && request.companyId === sessionUser.companyId
      && request.requestedBy !== sessionUser.id;
    const canDecide = request?.status === "pending"
      && (sessionUser?.role === "super_admin"
        || ((privileged || sameCompanyApprover) && request.requestedBy !== sessionUser?.id));
    const canCancel = request?.status === "pending"
      && (privileged || request.requestedBy === sessionUser?.id);
    const canRequest = !request
      && sessionUser?.role === "customer"
      && order.customerId === sessionUser.id
      && ["submitted", "confirmed"].includes(order.status);
    qs("[data-order-procurement-actions]").innerHTML = [
      canRequest ? '<button class="button button-secondary" type="button" data-procurement-request>Təsdiqə göndər</button>' : "",
      canDecide ? '<button class="button button-primary" type="button" data-procurement-decision="approved">Təsdiqlə</button>' : "",
      canDecide ? '<button class="button button-outline" type="button" data-procurement-decision="rejected">Rədd et</button>' : "",
      canCancel ? '<button class="button button-outline" type="button" data-procurement-cancel>Sorğunu ləğv et</button>' : ""
    ].join("");
  };

  const renderDocument = () => {
    const document = currentDocument();
    const snapshot = document?.payload?.order || order;
    const currency = snapshot.currency || "AZN";
    activeDocumentId = document?.id || "";
    documentNode.hidden = false;
    qs("[data-order-document-kind]").textContent = document?.type === "proforma_invoice" ? "Proforma hesab" : "Sifariş xülasəsi";
    qs("[data-order-document-number]").textContent = document?.number || `Sifariş #${order.orderNumber}`;
    qs("[data-order-document-date]").textContent = formatDate(document?.issuedAt || order.createdAt);
    qs("[data-order-company]").textContent = snapshot.companyName || "-";
    qs("[data-order-contact]").textContent = `${snapshot.contactName || "-"} · ${snapshot.email || "-"} · ${snapshot.phone || "-"}`;
    qs("[data-order-city]").textContent = snapshot.city || "-";
    qs("[data-order-address]").textContent = snapshot.address || "-";
    qs("[data-order-status-label]").textContent = `${statusLabels[snapshot.status] || snapshot.status} · ${paymentLabels[snapshot.paymentStatus] || snapshot.paymentStatus} · ${approvalLabels[snapshot.approvalStatus || order.approvalStatus] || "Tələb olunmur"}`;
    qs("[data-order-tracking]").textContent = snapshot.trackingCode
      ? `${snapshot.deliveryProvider || "Daşıyıcı"} · ${snapshot.trackingCode}`
      : "İzləmə kodu hələ təyin edilməyib";
    qs("[data-order-document-items]").innerHTML = (snapshot.items || []).map((item) => `<tr>
      <td data-label="Məhsul"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.snapshot?.supplierName || "")}</small></td>
      <td data-label="SKU">${escapeHtml(item.sku)}</td>
      <td data-label="Miqdar">${Number(item.quantity).toLocaleString("az-AZ")} ${escapeHtml(item.unit)}</td>
      <td data-label="Vahid qiymət">${formatMoney(item.unitPrice, currency)}</td>
      <td data-label="Cəm">${formatMoney(item.lineTotal, currency)}</td>
    </tr>`).join("");
    qs("[data-order-subtotal]").textContent = formatMoney(snapshot.subtotal, currency);
    qs("[data-order-delivery]").textContent = formatMoney(snapshot.deliveryAmount || 0, currency);
    qs("[data-order-total]").textContent = formatMoney(snapshot.totalAmount, currency);
    const sourceNote = snapshot.rfqId
      ? ` Mənbə: RFQ ${snapshot.rfqId}, qalib təklif ${snapshot.offerId || "-"}.`
      : snapshot.tenderId
        ? ` Mənbə: tender ${snapshot.tenderId}, qalib təklif ${snapshot.tenderBidId || "-"}.`
        : "";
    qs("[data-order-document-note]").textContent = `${document?.payload?.marketplace?.note
      || "Sifariş məlumatları serverdə təsdiqlənmiş snapshot əsasında göstərilir."}${sourceNote}`;
    document.title = `${document?.number || `Sifariş ${order.orderNumber}`} | ConstEra`;
  };

  const renderDocuments = () => {
    const documents = order.documents || [];
    const tabs = qs("[data-order-documents]");
    tabs.innerHTML = documents.map((item) => `<button type="button" data-order-document-id="${escapeHtml(item.id)}" class="${item.id === currentDocument()?.id ? "is-active" : ""}">${item.type === "proforma_invoice" ? "Proforma hesab" : "Sifariş xülasəsi"} · ${escapeHtml(item.number)}</button>`).join("");
    if (!documents.length) tabs.innerHTML = "<span>Sənəd sifariş təsdiqləndikdə yaradılacaq.</span>";
  };

  const renderAdmin = () => {
    const privileged = ["super_admin", "admin", "sales"].includes(sessionUser?.role);
    adminPanel.hidden = !privileged;
    if (!privileged) return;
    const statusValues = [order.status, ...(transitions[order.status] || [])]
      .filter((value) => value !== "confirmed" || ["not_required", "approved"].includes(order.approvalStatus));
    adminForm.elements.status.innerHTML = statusValues.map((value) => `<option value="${value}">${escapeHtml(statusLabels[value] || value)}</option>`).join("");
    adminForm.elements.status.value = order.status;
    adminForm.elements.paymentStatus.innerHTML = Object.entries(paymentLabels).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("");
    adminForm.elements.paymentStatus.value = order.paymentStatus;
    adminForm.elements.deliveryAmount.value = order.deliveryAmount ?? "";
    adminForm.elements.deliveryProvider.value = order.deliveryProvider || "";
    adminForm.elements.trackingCode.value = order.trackingCode || "";
    adminForm.elements.historyNote.value = "";
  };

  const render = () => {
    qs("[data-order-detail-title]").textContent = `Sifariş #${order.orderNumber}`;
    const backLink = qs("[data-order-back]");
    if (backLink && ["super_admin", "admin", "sales"].includes(sessionUser?.role)) {
      backLink.href = "admin.html#requests";
      backLink.textContent = "Admin panelə qayıt";
    }
    qs("[data-order-print]").disabled = false;
    renderDocuments();
    renderDocument();
    renderHistory();
    renderFulfillments();
    renderProcurement();
    renderAdmin();
    const customerCanCancel = sessionUser?.role === "customer"
      && ["submitted", "confirmed"].includes(order.status);
    const customerCanPay = sessionUser?.role === "customer"
      && integrations.payment
      && order.paymentStatus !== "paid"
      && order.status !== "cancelled"
      && !order.hasPendingPrice
      && ["not_required", "approved"].includes(order.approvalStatus)
      && Number(order.totalAmount) > 0;
    qs("[data-order-customer-actions]").hidden = !customerCanCancel && !customerCanPay;
    qs("[data-order-cancel]").hidden = !customerCanCancel;
    qs("[data-order-pay]").hidden = !customerCanPay;
    const invoiceButton = qs("[data-order-issue-invoice]");
    if (invoiceButton) {
      invoiceButton.hidden = !["super_admin", "admin", "sales"].includes(sessionUser?.role)
        || !integrations.electronicInvoice
        || order.hasPendingPrice
        || order.totalAmount === null;
    }
    setStatus(`Sifariş ${formatDate(order.updatedAt)} tarixində yenilənib.`, "success");
  };

  const load = async () => {
    if (!orderId) {
      setStatus("Sifariş ID-si göstərilməyib.", "error");
      return;
    }
    try {
      const [session, readiness] = await Promise.all([
        window.ConstEraAPI.session(),
        window.ConstEraAPI.integrationReadiness?.().catch(() => ({ data: { readiness: {} } }))
      ]);
      sessionUser = session.user;
      integrations = readiness?.data?.readiness || {};
      if (!sessionUser) {
        setStatus("Sifariş sənədini görmək üçün hesabına daxil ol.", "warning");
        window.setTimeout(() => {
          window.location.assign(`login.html?next=${encodeURIComponent(`order-detail.html?order=${orderId}`)}`);
        }, 500);
        return;
      }
      order = (await window.ConstEraAPI.order(orderId)).data;
      activeDocumentId = order.documents?.find((item) => item.type === "proforma_invoice")?.id
        || order.documents?.[0]?.id
        || "";
      render();
    } catch (error) {
      setStatus(error.message || "Sifariş yüklənmədi.", "error");
    }
  };

  qs("[data-order-documents]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-order-document-id]");
    if (!button) return;
    activeDocumentId = button.dataset.orderDocumentId;
    renderDocuments();
    renderDocument();
  });
  qs("[data-order-print]")?.addEventListener("click", () => window.print());
  qs("[data-order-procurement-actions]")?.addEventListener("click", async (event) => {
    const requestButton = event.target.closest("[data-procurement-request]");
    const decisionButton = event.target.closest("[data-procurement-decision]");
    const cancelButton = event.target.closest("[data-procurement-cancel]");
    if (!requestButton && !decisionButton && !cancelButton) return;
    const button = requestButton || decisionButton || cancelButton;
    button.disabled = true;
    const actionStatus = qs("[data-order-procurement-status]");
    try {
      if (requestButton) {
        await window.ConstEraAPI.requestProcurementApproval({
          orderId,
          requiredApprovals: 1,
          note: "Sifariş detalından təsdiqə göndərildi"
        });
      } else if (decisionButton) {
        const decision = decisionButton.dataset.procurementDecision;
        const note = window.prompt("Qərar qeydi", "") ?? "";
        await window.ConstEraAPI.decideProcurement(order.procurement.id, decision, note);
      } else if (cancelButton) {
        if (!window.confirm("Satınalma təsdiqi sorğusu ləğv edilsin?")) {
          button.disabled = false;
          return;
        }
        await window.ConstEraAPI.cancelProcurement(order.procurement.id);
      }
      order = (await window.ConstEraAPI.order(orderId)).data;
      render();
      actionStatus.textContent = "Satınalma təsdiqi yeniləndi.";
      actionStatus.dataset.type = "success";
    } catch (error) {
      actionStatus.textContent = error.message || "Satınalma təsdiqi yenilənmədi.";
      actionStatus.dataset.type = "error";
      button.disabled = false;
    }
  });
  adminForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = adminForm.querySelector('button[type="submit"]');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Yenilənir...";
    try {
      const fields = Object.fromEntries(new FormData(adminForm).entries());
      order = (await window.ConstEraAPI.updateOrder(orderId, fields)).data;
      activeDocumentId = order.documents?.find((item) => item.type === "proforma_invoice")?.id
        || activeDocumentId;
      render();
      qs("[data-order-admin-status]").textContent = "Sifariş mərhələsi yeniləndi.";
      qs("[data-order-admin-status]").dataset.type = "success";
    } catch (error) {
      qs("[data-order-admin-status]").textContent = error.message;
      qs("[data-order-admin-status]").dataset.type = "error";
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
  qs("[data-order-cancel]")?.addEventListener("click", async () => {
    if (!window.confirm("Sifariş ləğv edilsin?")) return;
    try {
      order = (await window.ConstEraAPI.updateOrder(orderId, {
        status: "cancelled",
        note: "Müştəri tərəfindən ləğv edildi"
      })).data;
      render();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
  qs("[data-order-pay]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      setStatus("Təhlükəsiz ödəniş səhifəsi hazırlanır...");
      const result = await window.ConstEraAPI.createPayment(orderId, `order-${orderId}`);
      window.location.assign(result.data.checkoutUrl);
    } catch (error) {
      setStatus(error.message || "Ödəniş səhifəsi açılmadı.", "error");
      button.disabled = false;
    }
  });
  qs("[data-order-issue-invoice]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await window.ConstEraAPI.issueElectronicInvoice(orderId);
      qs("[data-order-admin-status]").textContent = result.data.documentUrl
        ? "Elektron qaimə yaradıldı və sənəd URL-i provayderdən alındı."
        : "Elektron qaimə provayderə göndərildi.";
      qs("[data-order-admin-status]").dataset.type = "success";
    } catch (error) {
      qs("[data-order-admin-status]").textContent = error.message;
      qs("[data-order-admin-status]").dataset.type = "error";
    } finally {
      button.disabled = false;
    }
  });

  load();
})();
