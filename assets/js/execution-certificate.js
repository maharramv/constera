(function initExecutionCertificate() {
  if (document.body?.dataset.page !== "execution-certificate") return;
  const api = window.ConstEraAPI;
  const documentNode = document.querySelector("[data-certificate-document]");
  const statusNode = document.querySelector("[data-certificate-status]");
  if (!api || !documentNode || !statusNode) return;
  const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const money = (value, currency) => new Intl.NumberFormat("az-AZ", { style: "currency", currency: currency || "AZN" }).format(Number(value || 0));
  const number = (value, digits = 3) => Number(value || 0).toLocaleString("az-AZ", { maximumFractionDigits: digits });
  const date = (value) => value ? new Intl.DateTimeFormat("az-AZ", { dateStyle: "long" }).format(new Date(value)) : "—";
  const statusLabels = { draft: "Qaralama", submitted: "Təsdiq gözləyir", certified: "Təsdiqlənib", rejected: "Rədd edilib", paid: "Ödənilib", cancelled: "Ləğv edilib" };
  const id = new URLSearchParams(location.search).get("id") || "";
  document.querySelector("[data-certificate-print]")?.addEventListener("click", () => window.print());
  if (!id) { statusNode.textContent = "Akt identifikatoru göstərilməyib."; return; }
  api.execution(id).then(({ data }) => {
    const certificate = data.certificate;
    const items = data.items || [];
    document.title = `CE-AKT-${certificate.certificateNumber} | ConstEra`;
    documentNode.innerHTML = `<header class="certificate-head"><div><h2>Görülmüş işlər üzrə ödəniş aktı</h2><p>${certificate.certificateType === "final" ? "Yekun hesablaşma" : "Aralıq Forma 2/3"}</p></div><div><strong>CE-AKT-${number(certificate.certificateNumber, 0)}</strong><p>Status: ${escapeHtml(statusLabels[certificate.status] || certificate.status)}</p></div></header>
      <section class="certificate-meta"><div><span>Layihə</span><strong>${escapeHtml(certificate.projectTitle)}</strong></div><div><span>İş müqaviləsi</span><strong>#${number(certificate.contractNumber, 0)} ${escapeHtml(certificate.externalContractNumber || "")}</strong></div><div><span>Podratçı</span><strong>${escapeHtml(certificate.contractorName)}</strong></div><div><span>Hesabat dövrü</span><strong>${date(certificate.periodStart)}–${date(certificate.periodEnd)}</strong></div></section>
      <div class="certificate-table-wrap"><table class="certificate-table"><thead><tr><th>№</th><th>BOQ kodu və işin adı</th><th>İş tarixi / zona</th><th class="num">Miqdar</th><th class="num">Vahid qiymət</th><th class="num">Məbləğ</th></tr></thead><tbody>${items.map((item, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(item.itemCode)}</strong> ${escapeHtml(item.title)}</td><td>${date(item.workDate)}${item.locationText ? `<br>${escapeHtml(item.locationText)}` : ""}</td><td class="num">${number(item.quantity)} ${escapeHtml(item.unit)}</td><td class="num">${money(item.unitRate, certificate.currency)}</td><td class="num">${money(item.lineAmount, certificate.currency)}</td></tr>`).join("") || '<tr><td colspan="6">Bu yekun akt yalnız saxlanmış zəmanət məbləğinin azad edilməsini əhatə edir.</td></tr>'}</tbody></table></div>
      <section class="certificate-totals"><div><span>Görülmüş iş</span><strong>${money(certificate.workAmount, certificate.currency)}</strong></div><div><span>ƏDV (${number(certificate.taxPercent, 2)}%)</span><strong>${money(certificate.taxAmount, certificate.currency)}</strong></div><div><span>Avans tutulması</span><strong>− ${money(certificate.advanceRecoveryAmount, certificate.currency)}</strong></div><div><span>Zəmanət saxlaması</span><strong>− ${money(certificate.retentionAmount, certificate.currency)}</strong></div><div><span>Zəmanət azad edilməsi</span><strong>+ ${money(certificate.retentionReleaseAmount, certificate.currency)}</strong></div><div><span>Digər tutulmalar</span><strong>− ${money(certificate.otherDeductions, certificate.currency)}</strong></div><div><span>Ödənəcək yekun</span><strong>${money(certificate.netPayable, certificate.currency)}</strong></div></section>
      ${certificate.note ? `<p class="certificate-note"><strong>Qeyd:</strong> ${escapeHtml(certificate.note)}</p>` : ""}
      <section class="certificate-signatures"><div>Podratçı nümayəndəsi</div><div>Layihə sahibi / texniki nəzarət</div></section>`;
    statusNode.hidden = true; documentNode.hidden = false;
  }).catch((error) => {
    statusNode.textContent = error.status === 401 ? "Aktı görmək üçün hesabınıza daxil olun." : error.message || "Akt yüklənmədi.";
    if (error.status === 401) statusNode.innerHTML += ' <a href="login.html?next=execution-center.html">Daxil ol</a>';
  });
})();
