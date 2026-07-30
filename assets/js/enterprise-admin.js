(function initConsteraEnterpriseAdmin() {
  const api = window.ConstEraAPI;
  const root = document.querySelector("[data-admin-trust-center]");
  if (!api || !root) return;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const money = (value) => new Intl.NumberFormat("az-AZ", {
    style: "currency", currency: "AZN", maximumFractionDigits: 2
  }).format(Number(value || 0));
  const stars = (value) => `<span class="enterprise-stars">${"★".repeat(Number(value) || 0)}${"☆".repeat(5 - (Number(value) || 0))}</span>`;
  const caseLabels = {
    support: "Dəstək", return: "Qaytarma", refund: "Geri ödəniş", dispute: "Mübahisə",
    open: "Açıq", in_review: "Baxılır", awaiting_customer: "Müştəri gözlənilir",
    awaiting_supplier: "Təchizatçı gözlənilir", approved: "Təsdiqlənib",
    refund_pending: "Ödəniş gözlənilir", resolved: "Həll olunub", rejected: "Rədd edilib", closed: "Bağlanıb"
  };
  const label = (value) => caseLabels[value] || value || "";
  const safe = (promise) => promise.then((result) => result.data).catch((error) => ({ error: error.message }));
  const setStatus = (message, type = "info") => {
    const output = root.querySelector("[data-admin-trust-status]");
    if (!output) return;
    output.textContent = message;
    output.dataset.type = type;
  };
  const scoreRow = (card) => `<tr><td><strong>${esc(card.supplier)}</strong><small>${esc(card.region)}</small></td><td>${card.score} · ${esc(card.grade)}</td><td>${card.metrics.dataQuality}%</td><td>${card.metrics.onTime}%</td><td>${card.metrics.response}%</td><td>${card.metrics.reviewAverage || 0} / 5</td><td>${card.metrics.openQualityIssues}</td></tr>`;

  const load = async () => {
    const [analytics, reviews, support, quality, performance, integrations] = await Promise.all([
      safe(api.analytics()), safe(api.reviewModeration()), safe(api.supportCases()),
      safe(api.catalogQuality()), safe(api.supplierPerformance()), safe(api.integrationReadiness())
    ]);
    if (analytics.error) {
      root.innerHTML = `<h2>Etibar və keyfiyyət</h2><p class="admin-import-status">${esc(analytics.error)}</p><a class="button button-outline" href="login.html?next=admin.html">Hesaba daxil ol</a>`;
      return;
    }
    const trust = analytics.trust || {};
    const cases = support.cases || [];
    const pending = reviews.reviews || [];
    const issues = quality.issues || [];
    const cards = performance.scorecards || [];
    const readiness = integrations.readiness || {};
    const stages = analytics.funnel?.stages || [];
    const integrationNames = {
      payment: "Kart ödənişi", bankTransfer: "Bank köçürməsi", electronicInvoice: "Elektron qaimə", aiEstimate: "AI smeta",
      email: "E-poçt", whatsapp: "WhatsApp"
    };
    const funnelNames = {
      page_view: "Səhifə baxışı", search: "Axtarış", product_view: "Məhsul baxışı",
      add_to_cart: "Səbətə əlavə", checkout_start: "Sifariş başlanğıcı",
      order_created: "Sifariş", rfq_created: "Qiymət sorğusu", estimate_created: "Smeta"
    };
    root.innerHTML = `
      <div class="market-section-heading"><div><p class="eyebrow">Əməliyyat nəzarəti</p><h2>Etibar, keyfiyyət və satış hunisi</h2></div><div class="admin-actions"><button class="button button-outline" type="button" data-quality-attributes>Atributları standartlaşdır</button><button class="button button-outline" type="button" data-quality-remediate>Təhlükəsiz düzəliş</button><button class="button button-secondary" type="button" data-quality-scan>Keyfiyyəti yoxla</button></div></div>
      <div class="admin-v2-kpi-grid">
        <article><span>Açıq müraciət</span><strong>${Number(trust.supportOpen || 0)}</strong><small>${Number(trust.supportTotal || 0)} ümumi</small></article>
        <article><span>Geri ödəniş</span><strong>${money(trust.refundedAmount)}</strong><small>${Number(trust.refundsCompleted || 0)} əməliyyat</small></article>
        <article><span>Rəy balı</span><strong>${Number(trust.reviewAverage || 0)} / 5</strong><small>${Number(trust.reviewsPending || 0)} moderasiyada</small></article>
        <article><span>Keyfiyyət problemi</span><strong>${Number(quality.summary?.open || 0)}</strong><small>${Number(quality.summary?.critical || 0)} kritik</small></article>
      </div>
      <div class="admin-v2-grid">
        <section class="admin-v2-section">
          <div class="admin-v2-section-heading"><h3>İnteqrasiyalar</h3><span class="data-badge">${Object.values(readiness).filter(Boolean).length}/${Object.keys(readiness).length} hazır</span></div>
          <div class="enterprise-readiness">${Object.entries(readiness).map(([key, ready]) => `<span class="status-pill${ready ? " is-real" : ""}">${esc(integrationNames[key] || key)} · ${ready ? "Aktiv" : "Açar tələb edir"}</span>`).join("")}</div>
          <form class="enterprise-inline-form" data-integration-test><select name="channel"><option value="email">E-poçt</option><option value="whatsapp">WhatsApp</option></select><input name="recipient" placeholder="Ünvan və ya nömrə" required /><button class="button button-outline" type="submit">Test et</button></form>
        </section>
        <section class="admin-v2-section">
          <div class="admin-v2-section-heading"><h3>30 günlük satış hunisi</h3><span class="data-badge">${stages.reduce((sum, item) => sum + Number(item.events || 0), 0)} hadisə</span></div>
          <div class="enterprise-funnel">${stages.map((item) => `<div><strong>${esc(funnelNames[item.eventType] || item.eventType)}</strong><span>${Number(item.events || 0)} hadisə · ${Number(item.sessions || 0)} sessiya</span></div>`).join("") || '<p class="admin-import-status">Hadisələr toplanmağa başlayıb.</p>'}</div>
        </section>
        <section class="admin-v2-section admin-v2-section-wide">
          <div class="admin-v2-section-heading"><h3>Moderasiya gözləyən rəylər</h3><span class="data-badge">${pending.length}</span></div>
          <div class="enterprise-admin-list">${pending.map((review) => `<article><div><strong>${esc(review.targetName || review.title)} · ${stars(review.rating)}</strong><span>${esc(review.customerName)}: ${esc(review.body)}</span></div><div class="admin-actions"><button class="table-action" data-review-moderate="${esc(review.id)}" data-decision="published">Dərc et</button><button class="table-action is-danger" data-review-moderate="${esc(review.id)}" data-decision="rejected">Rədd et</button></div></article>`).join("") || '<p class="admin-import-status">Gözləyən rəy yoxdur.</p>'}</div>
        </section>
        <section class="admin-v2-section admin-v2-section-wide">
          <div class="admin-v2-section-heading"><h3>Dəstək və qaytarma növbəsi</h3><span class="data-badge">${cases.length}</span></div>
          <div class="enterprise-admin-list">${cases.slice(0, 40).map((item) => `<article><div><strong>#${item.caseNumber} · ${esc(label(item.type))} · ${esc(item.subject)}</strong><span>${esc(item.customerName)} · ${esc(label(item.status))}${item.requestedAmount !== null ? ` · ${money(item.requestedAmount)}` : ""}</span></div><div class="admin-actions"><button class="table-action" data-case-action="${esc(item.id)}" data-action="status">Həll et</button>${["refund", "return"].includes(item.type) && !item.refund ? `<button class="table-action" data-case-action="${esc(item.id)}" data-action="approve-refund">Məbləği təsdiqlə</button>` : ""}${item.refund && item.refund.status !== "completed" ? `<button class="table-action" data-case-action="${esc(item.id)}" data-action="complete-refund">Ödənişi tamamla</button>` : ""}</div></article>`).join("") || '<p class="admin-import-status">Açıq müraciət yoxdur.</p>'}</div>
        </section>
        <section class="admin-v2-section admin-v2-section-wide">
          <div class="admin-v2-section-heading"><h3>Kataloq keyfiyyət robotu</h3><span class="data-badge">${issues.length} aktiv qeyd</span></div>
          <div class="enterprise-admin-list">${issues.slice(0, 50).map((issue) => `<article><div><strong>${esc(issue.sku || issue.supplierName || issue.entityId)} · ${esc(issue.severity)}</strong><span>${esc(issue.productName || issue.type)} · ${esc(issue.detail)}</span></div><div class="admin-actions"><a class="table-action" href="product-detail.html?product=${encodeURIComponent(issue.productId || "")}">Aç</a><button class="table-action" data-quality-action="${esc(issue.id)}" data-action="resolve">Həll edildi</button><button class="table-action" data-quality-action="${esc(issue.id)}" data-action="ignore">Nəzərə alma</button></div></article>`).join("") || '<p class="admin-import-status">Aktiv problem yoxdur.</p>'}</div>
        </section>
        <section class="admin-v2-section admin-v2-section-wide">
          <div class="admin-v2-section-heading"><h3>Təchizatçı reytinqi</h3><span class="data-badge">${cards.length} profil</span></div>
          <div class="table-wrap"><table class="admin-table"><thead><tr><th>Təchizatçı</th><th>Bal</th><th>Məlumat</th><th>Çatdırılma</th><th>Cavab</th><th>Rəy</th><th>Problem</th></tr></thead><tbody>${cards.slice(0, 30).map(scoreRow).join("")}</tbody></table></div>
        </section>
      </div>
      <p class="admin-import-status" data-admin-trust-status></p>`;
  };

  root.addEventListener("click", async (event) => {
    const scan = event.target.closest("[data-quality-scan]");
    const remediate = event.target.closest("[data-quality-remediate]");
    const attributes = event.target.closest("[data-quality-attributes]");
    const review = event.target.closest("[data-review-moderate]");
    const support = event.target.closest("[data-case-action]");
    const quality = event.target.closest("[data-quality-action]");
    if (!scan && !remediate && !attributes && !review && !support && !quality) return;
    let completedMessage = "";
    try {
      setStatus("Əməliyyat icra olunur...");
      if (scan) await api.scanCatalogQuality();
      if (attributes) {
        const preview = (await api.previewCatalogAttributes()).data;
        if (!preview.candidateProducts) {
          completedMessage = "Standartlaşdırılacaq yeni texniki atribut tapılmadı.";
        } else {
          const summary = `${preview.candidateProducts} məhsulda ${preview.technicalAttributes} yüksək etibarlı texniki atribut saxlanacaq. Məhsul adı, qiymət, stok və mənbə dəyişməyəcək.`;
          if (!window.confirm(`${summary}\n\nDavam etmək üçün administrator 2FA qoruması aktiv olmalıdır.`)) return;
          const result = (await api.normalizeCatalogAttributes()).data;
          completedMessage = `${result.updatedProducts} məhsulun texniki atributları standartlaşdırıldı.`;
        }
      }
      if (remediate) {
        const preview = (await api.previewCatalogRemediation()).data;
        const summary = `${preview.quarantineProducts} mənbəsiz demo karantinə keçiriləcək, ${preview.duplicateProducts} dublikat yoxlanacaq və ${preview.safeFieldFixes} təhlükəli sahə normallaşdırılacaq.`;
        if (!window.confirm(`${summary}\n\nReal məlumat uydurulmayacaq. Davam edilsin?`)) return;
        const result = (await api.remediateCatalogQuality()).data.remediation;
        completedMessage = `${result.quarantinedProducts} demo karantinə keçirildi, ${result.archivedDuplicates} dublikat arxivləndi, ${result.remainingOpenIssues} real yoxlama qeydi qaldı.`;
      }
      if (review) await api.updateReview({ id: review.dataset.reviewModerate, action: "moderate", status: review.dataset.decision });
      if (support) {
        const payload = { id: support.dataset.caseAction, action: support.dataset.action };
        if (payload.action === "status") payload.status = "resolved";
        if (payload.action === "approve-refund") {
          const amount = prompt("Təsdiqlənəcək məbləği AZN ilə yaz:");
          if (!amount) return;
          payload.amount = amount;
        }
        await api.updateSupportCase(payload);
      }
      if (quality) await api.updateCatalogQuality({ id: quality.dataset.qualityAction, action: quality.dataset.action });
      await load();
      if (completedMessage) setStatus(completedMessage, "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-integration-test]");
    if (!form) return;
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(form).entries());
    try {
      await api.testNotification(fields.channel, fields.recipient);
      setStatus("Test bildirişi provayderə göndərildi.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
  api.session()
    .then(({ user }) => {
      if (!user) {
        root.innerHTML = `<h2>Etibar və keyfiyyət</h2><p class="admin-import-status">İdarəetmə göstəricilərini görmək üçün hesabına daxil ol.</p><a class="button button-outline" href="login.html?next=admin.html">Hesaba daxil ol</a>`;
        return;
      }
      return load();
    })
    .catch((error) => {
      root.innerHTML = `<h2>Etibar və keyfiyyət</h2><p class="admin-import-status" data-type="error">${esc(error.message)}</p>`;
    });
})();
