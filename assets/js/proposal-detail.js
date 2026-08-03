(function initCommercialProposalDetail() {
  const proposalId = new URLSearchParams(window.location.search).get("proposal") || "";
  const documentPanel = document.querySelector("[data-proposal-document]");
  const statusOutput = document.querySelector("[data-proposal-status]");
  const title = document.querySelector("[data-proposal-title]");
  const printButton = document.querySelector("[data-proposal-print]");
  const acceptButton = document.querySelector("[data-proposal-accept]");
  const orderLink = document.querySelector("[data-proposal-order-link]");
  let currentProposal = null;
  let currentUser = null;

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const money = (value, currency = "AZN") => Number(value || 0).toLocaleString("az-AZ", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const date = (value) => {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toLocaleDateString("az-AZ");
  };
  const statusLabels = {
    draft: "Qaralama",
    issued: "Göndərilib",
    accepted: "Qəbul edilib",
    expired: "Müddəti bitib",
    cancelled: "Ləğv edilib"
  };
  const specText = (specs) => (Array.isArray(specs) ? specs : [])
    .map((item) => typeof item === "string" ? item : item?.value || item?.label || "")
    .filter(Boolean)
    .join(" · ") || "Əlavə tələb yoxdur";
  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  };

  const render = (proposal) => {
    currentProposal = proposal;
    const currency = proposal.currency || "AZN";
    const customer = proposal.customer || {};
    const supplier = proposal.supplier || {};
    const issuedDate = proposal.issuedAt || proposal.createdAt;
    if (title) title.textContent = `${proposal.documentNumber} · ${proposal.rfqTitle || "Kommersiya təklifi"}`;
    document.title = `${proposal.documentNumber} | ConstEra kommersiya təklifi`;
    setText("[data-proposal-number]", proposal.documentNumber);
    setText("[data-proposal-dates]", `Tərtib: ${date(issuedDate)} · Etibarlıdır: ${date(proposal.validUntil)}`);
    setText("[data-proposal-customer]", customer.companyName || customer.contactName || "Sifarişçi");
    setText("[data-proposal-customer-contact]", [customer.contactName, customer.phone, customer.email, customer.city].filter(Boolean).join(" · ") || "Əlaqə məlumatı göstərilməyib");
    setText("[data-proposal-supplier]", supplier.name || proposal.selectedSupplierName || "Təchizatçı");
    setText("[data-proposal-supplier-terms]", [supplier.leadTime, supplier.delivery, supplier.warranty].filter(Boolean).join(" · ") || "Şərtlər aşağıda göstərilib");
    setText("[data-proposal-state]", statusLabels[proposal.status] || proposal.status);
    setText("[data-proposal-version]", `Versiya ${proposal.version} · RFQ ${proposal.rfqId}`);
    setText("[data-proposal-payment]", proposal.paymentTerms || "Razılaşdırılır");
    setText("[data-proposal-delivery-terms]", proposal.deliveryTerms || "Razılaşdırılır");
    setText("[data-proposal-warranty]", proposal.warrantyTerms || "Razılaşdırılır");
    setText("[data-proposal-note]", proposal.note || "Əlavə qeyd yoxdur");
    setText("[data-proposal-subtotal]", money(proposal.subtotal, currency));
    setText("[data-proposal-discount]", proposal.discountAmount ? `− ${money(proposal.discountAmount, currency)}` : money(0, currency));
    setText("[data-proposal-delivery]", money(proposal.deliveryAmount, currency));
    const vatModeLabel = proposal.vatMode === "included"
      ? `ƏDV (${proposal.vatRate}%, daxildir)`
      : proposal.vatMode === "not_applicable"
        ? "ƏDV tətbiq edilmir"
        : `ƏDV (${proposal.vatRate}%)`;
    setText("[data-proposal-vat-label]", vatModeLabel);
    setText("[data-proposal-vat]", money(proposal.vatAmount, currency));
    setText("[data-proposal-total]", money(proposal.totalAmount, currency));

    const itemRows = document.querySelector("[data-proposal-items]");
    if (itemRows) {
      itemRows.innerHTML = (proposal.items || []).map((item) => `
        <tr>
          <td data-label="Mövqe"><strong>${escapeHtml(item.title || "RFQ mövqeyi")}</strong></td>
          <td data-label="Miqdar">${escapeHtml(item.quantity || item.unit || "—")}</td>
          <td data-label="Texniki tələblər">${escapeHtml(specText(item.specs))}</td>
        </tr>
      `).join("") || '<tr><td colspan="3">RFQ mövqeyi göstərilməyib.</td></tr>';
    }
    const comparisonRows = document.querySelector("[data-proposal-comparisons]");
    if (comparisonRows) {
      comparisonRows.innerHTML = (proposal.comparisons || []).map((offer) => `
        <tr class="${offer.selected ? "is-selected" : ""}">
          <td data-label="Təchizatçı"><strong>${escapeHtml(offer.supplier || "Təchizatçı")}${offer.selected ? " · Seçilib" : ""}</strong></td>
          <td data-label="Məbləğ">${escapeHtml(offer.price || (offer.priceAmount === null ? "Sorğu əsasında" : money(offer.priceAmount, offer.currency || currency)))}</td>
          <td data-label="Müddət">${escapeHtml(offer.leadTime || "Açıq")}</td>
          <td data-label="Çatdırılma">${escapeHtml(offer.delivery || "Açıq")}</td>
          <td data-label="Zəmanət">${escapeHtml(offer.warranty || "Açıq")}</td>
        </tr>
      `).join("") || '<tr><td colspan="5">Müqayisə məlumatı yoxdur.</td></tr>';
    }

    if (documentPanel) documentPanel.hidden = false;
    if (printButton) printButton.disabled = false;
    const canAccept = ["super_admin", "admin", "sales", "customer"].includes(currentUser?.role)
      && proposal.status === "issued";
    if (acceptButton) acceptButton.hidden = !canAccept;
    if (statusOutput) {
      statusOutput.textContent = proposal.status === "issued"
        ? `Təklif ${date(proposal.validUntil)} tarixinədək qüvvədədir. Qəbul edildikdə sifariş və proforma avtomatik yaradılacaq.`
        : `Sənəd vəziyyəti: ${statusLabels[proposal.status] || proposal.status}.`;
    }
    if (orderLink) {
      orderLink.hidden = !proposal.orderId;
      orderLink.innerHTML = proposal.orderId
        ? `<a class="button button-primary" href="order-detail.html?order=${encodeURIComponent(proposal.orderId)}">Sifariş #${escapeHtml(proposal.orderNumber || "")} və proformanı aç</a>`
        : "";
    }
  };

  const load = async () => {
    if (!proposalId) {
      if (statusOutput) statusOutput.textContent = "Kommersiya təklifi ID-si göstərilməyib.";
      return;
    }
    if (!window.ConstEraAPI?.proposal) {
      if (statusOutput) statusOutput.textContent = "Kommersiya təklifi modulu yüklənmədi.";
      return;
    }
    try {
      const [session, response] = await Promise.all([
        window.ConstEraAPI.session(),
        window.ConstEraAPI.proposal(proposalId)
      ]);
      currentUser = session.user;
      render(response.data);
    } catch (error) {
      if (statusOutput) {
        statusOutput.innerHTML = error.status === 401
          ? 'Sənədi görmək üçün <a href="login.html">hesaba daxil ol</a>.'
          : escapeHtml(error.message || "Kommersiya təklifi yüklənmədi.");
      }
    }
  };

  printButton?.addEventListener("click", () => window.print());
  acceptButton?.addEventListener("click", async () => {
    if (!currentProposal || !window.ConstEraAPI?.updateProposal) return;
    if (!window.confirm(`${currentProposal.documentNumber} nömrəli təklifi qəbul edib sifariş yaratmaq istəyirsən?`)) return;
    acceptButton.disabled = true;
    if (statusOutput) statusOutput.textContent = "Təklif qəbul edilir, sifariş və proforma yaradılır...";
    try {
      const response = await window.ConstEraAPI.updateProposal(currentProposal.id, "accepted");
      render(response.data.proposal);
      if (statusOutput) statusOutput.textContent = `Təklif qəbul edildi. Sifariş #${response.data.order?.orderNumber || ""} və proforma hazırdır.`;
    } catch (error) {
      if (statusOutput) statusOutput.textContent = error.message;
    } finally {
      acceptButton.disabled = false;
    }
  });

  load();
})();
