(function initConsteraEnterprise() {
  const api = window.ConstEraAPI;
  if (!api) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const money = (value, currency = "AZN") => new Intl.NumberFormat("az-AZ", {
    style: "currency", currency, maximumFractionDigits: 2
  }).format(Number(value || 0));
  const date = (value) => value ? new Date(value).toLocaleString("az-AZ") : "";
  const stars = (rating) => `<span class="enterprise-stars" aria-label="${Number(rating)} ulduz">${"★".repeat(Number(rating) || 0)}${"☆".repeat(5 - (Number(rating) || 0))}</span>`;
  const labels = {
    support: "Dəstək", return: "Qaytarma", refund: "Geri ödəniş", dispute: "Mübahisə",
    open: "Açıq", in_review: "Baxılır", awaiting_customer: "Müştəri gözlənilir",
    awaiting_supplier: "Təchizatçı gözlənilir", approved: "Təsdiqlənib",
    refund_pending: "Geri ödəniş gözlənilir", resolved: "Həll olunub",
    rejected: "Rədd edilib", closed: "Bağlanıb", pending: "Moderasiya gözləyir",
    published: "Dərc olunub"
  };
  const status = (value) => labels[value] || String(value || "");
  let sessionPromise;
  const session = () => {
    sessionPromise ||= api.session().catch(() => ({ user: null }));
    return sessionPromise;
  };
  const signIn = (next = location.pathname.split("/").pop() + location.search) =>
    `<a class="button button-outline" href="login.html?next=${encodeURIComponent(next)}">Hesaba daxil ol</a>`;
  const setMessage = (node, message, type = "info") => {
    if (!node) return;
    node.textContent = message;
    node.dataset.type = type;
  };

  const initReviews = async () => {
    const root = document.querySelector("[data-review-center]");
    if (!root) return;
    const targetType = root.dataset.reviewTargetType;
    const targetId = new URLSearchParams(location.search).get(targetType) || "";
    if (!targetId) {
      root.hidden = true;
      return;
    }
    const render = async () => {
      try {
        const result = await api.reviews(targetType, targetId);
        const data = result.data;
        const eligibility = data.eligibility || [];
        root.innerHTML = `
          <div class="market-section-heading">
            <div><p class="eyebrow">Yoxlanılmış alış təcrübəsi</p><h2>Müştəri rəyləri</h2></div>
            <span class="data-badge">${esc(data.summary.average)} / 5 · ${esc(data.summary.count)} rəy</span>
          </div>
          <div class="enterprise-review-summary">${stars(Math.round(data.summary.average))}<span>${esc(data.summary.verified)} təsdiqlənmiş rəy</span></div>
          <div class="enterprise-review-list">
            ${(data.reviews || []).map((review) => `
              <article class="enterprise-review">
                <header><strong>${esc(review.title)}</strong>${stars(review.rating)}</header>
                <p>${esc(review.body)}</p>
                <small>${esc(review.customerName)} · Təsdiqlənmiş alış · ${date(review.createdAt)}</small>
                ${review.supplierResponse ? `<blockquote><strong>Təchizatçının cavabı</strong><span>${esc(review.supplierResponse)}</span></blockquote>` : ""}
              </article>`).join("") || '<p class="admin-import-status">Bu mövqe üçün hələ dərc edilmiş rəy yoxdur.</p>'}
          </div>
          ${eligibility.length ? `
            <form class="admin-form enterprise-review-form" data-review-form>
              <div class="market-section-heading"><div><p class="eyebrow">Real sifariş əsasında</p><h3>Rəyini paylaş</h3></div></div>
              <div class="admin-form-grid">
                <label class="admin-field"><span>Sifariş</span><select name="source">${eligibility.map((item) => `<option value="${esc(`${item.sourceType}|${item.sourceId}`)}">${esc(item.sourceLabel)}</option>`).join("")}</select></label>
                <label class="admin-field"><span>Qiymət</span><select name="rating">${[5, 4, 3, 2, 1].map((item) => `<option value="${item}">${item} ulduz</option>`).join("")}</select></label>
                <label class="admin-field admin-field-wide"><span>Başlıq</span><input name="title" maxlength="160" required /></label>
                <label class="admin-field admin-field-wide"><span>Rəy</span><textarea name="body" rows="4" minlength="10" maxlength="3000" required></textarea></label>
                <label class="admin-field admin-field-wide"><span>Foto URL-ləri, hər sətirdə bir</span><textarea name="mediaUrls" rows="2"></textarea></label>
              </div>
              <div class="admin-actions"><button class="button button-primary" type="submit">Moderasiya üçün göndər</button></div>
              <p class="admin-import-status" data-review-status></p>
            </form>` : `<p class="admin-import-status">Rəy yazmaq üçün bu mövqenin tamamlanmış sifarişi olmalıdır.</p>`}`;
      } catch (error) {
        root.innerHTML = `<div class="market-section-heading"><div><p class="eyebrow">Müştəri rəyləri</p><h2>Yoxlanılmış təcrübə</h2></div></div><p class="admin-import-status" data-type="warning">${esc(error.message)}</p>`;
      }
    };
    root.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-review-form]");
      if (!form) return;
      event.preventDefault();
      const output = form.querySelector("[data-review-status]");
      const fields = Object.fromEntries(new FormData(form).entries());
      const [sourceType, sourceId] = String(fields.source).split("|");
      try {
        setMessage(output, "Rəy göndərilir...");
        await api.createReview({ targetType, targetId, sourceType, sourceId, rating: fields.rating, title: fields.title, body: fields.body, mediaUrls: fields.mediaUrls });
        window.ConstEraTrack?.("review_submitted", { entityType: targetType, entityId: targetId });
        await render();
      } catch (error) {
        setMessage(output, error.message, "error");
      }
    });
    await render();
  };

  const caseCard = (item, privileged = false) => `
    <article class="enterprise-case">
      <header><div><strong>#${esc(item.caseNumber)} · ${esc(status(item.type))}</strong><span>${esc(item.subject)}</span></div><span class="status-pill">${esc(status(item.status))}</span></header>
      <p>${esc(item.description)}</p>
      ${item.requestedAmount !== null ? `<small>Tələb: ${money(item.requestedAmount, item.currency)}${item.approvedAmount !== null ? ` · Təsdiq: ${money(item.approvedAmount, item.currency)}` : ""}</small>` : ""}
      <div class="enterprise-messages">${(item.messages || []).map((message) => `<p><strong>${esc(message.authorName || message.authorRole || "Sistem")}</strong><span>${esc(message.body)}</span><small>${date(message.createdAt)}</small></p>`).join("")}</div>
      <form class="enterprise-inline-form" data-support-reply="${esc(item.id)}"><input name="message" maxlength="3000" placeholder="Cavab yaz" required /><button class="button button-secondary" type="submit">Göndər</button></form>
      ${privileged ? `<form class="enterprise-inline-form" data-support-status="${esc(item.id)}"><select name="status">${["open", "in_review", "awaiting_customer", "awaiting_supplier", "approved", "resolved", "rejected", "closed"].map((value) => `<option value="${value}"${value === item.status ? " selected" : ""}>${esc(status(value))}</option>`).join("")}</select><button class="button button-outline" type="submit">Vəziyyəti yenilə</button></form>` : ""}
    </article>`;

  const initOrderSupport = async () => {
    const root = document.querySelector("[data-order-support]");
    if (!root) return;
    const orderId = new URLSearchParams(location.search).get("order") || "";
    if (!orderId) {
      root.hidden = true;
      return;
    }
    const user = (await session()).user;
    if (!user) {
      root.innerHTML = `<h2>Dəstək və qaytarma</h2><p class="admin-import-status">Sifariş müraciətlərini görmək üçün hesabına daxil ol.</p>${signIn()}`;
      return;
    }
    const privileged = ["super_admin", "admin", "sales"].includes(user.role);
    const render = async () => {
      try {
        const cases = (await api.supportCases({ orderId })).data.cases || [];
        root.innerHTML = `
          <div class="market-section-heading"><div><p class="eyebrow">Sifariş sonrası xidmət</p><h2>Dəstək, qaytarma və geri ödəniş</h2></div><span class="data-badge">${cases.length} müraciət</span></div>
          ${user.role === "customer" ? `
            <form class="admin-form enterprise-support-form" data-support-create>
              <div class="admin-form-grid">
                <label class="admin-field"><span>Müraciət tipi</span><select name="type"><option value="support">Dəstək</option><option value="return">Qaytarma</option><option value="refund">Geri ödəniş</option><option value="dispute">Mübahisə</option></select></label>
                <label class="admin-field"><span>Tələb olunan məbləğ</span><input name="requestedAmount" type="number" min="0" step="0.01" /></label>
                <label class="admin-field admin-field-wide"><span>Mövzu</span><input name="subject" maxlength="180" required /></label>
                <label class="admin-field admin-field-wide"><span>Təfərrüat</span><textarea name="description" minlength="10" maxlength="5000" rows="4" required></textarea></label>
                <label class="admin-field admin-field-wide"><span>Sübut foto URL-ləri</span><textarea name="mediaUrls" rows="2"></textarea></label>
              </div>
              <div class="admin-actions"><button class="button button-primary" type="submit">Müraciət yarat</button></div>
              <p class="admin-import-status" data-support-form-status></p>
            </form>` : ""}
          <div class="enterprise-case-list">${cases.map((item) => caseCard(item, privileged)).join("") || '<p class="admin-import-status">Bu sifariş üzrə müraciət yoxdur.</p>'}</div>`;
      } catch (error) {
        root.innerHTML = `<h2>Dəstək və qaytarma</h2><p class="admin-import-status" data-type="error">${esc(error.message)}</p>`;
      }
    };
    root.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.target;
      try {
        if (form.matches("[data-support-create]")) {
          const fields = Object.fromEntries(new FormData(form).entries());
          await api.createSupportCase({ ...fields, orderId });
          window.ConstEraTrack?.("support_case_created", { entityType: "order", entityId: orderId });
        } else if (form.dataset.supportReply) {
          await api.updateSupportCase({ id: form.dataset.supportReply, action: "reply", message: new FormData(form).get("message") });
        } else if (form.dataset.supportStatus) {
          await api.updateSupportCase({ id: form.dataset.supportStatus, action: "status", status: new FormData(form).get("status") });
        }
        await render();
      } catch (error) {
        setMessage(root.querySelector("[data-support-form-status]"), error.message, "error");
      }
    });
    await render();
  };

  const initAccountTrust = async () => {
    const root = document.querySelector("[data-account-trust]");
    if (!root) return;
    const user = (await session()).user;
    if (!user) {
      root.innerHTML = `<h2>Etibar mərkəzi</h2><p class="admin-import-status">Müraciət və rəylərini görmək üçün hesabına daxil ol.</p>${signIn("customer-cabinet.html")}`;
      return;
    }
    try {
      const [supportResult, reviewResult] = await Promise.all([api.supportCases(), api.myReviews()]);
      const cases = supportResult.data.cases || [];
      const reviews = reviewResult.data.reviews || [];
      root.innerHTML = `
        <div class="market-section-heading"><div><p class="eyebrow">Etibar mərkəzi</p><h2>Müraciətlər və yoxlanılmış rəylər</h2></div><span class="data-badge">${cases.length + reviews.length} qeyd</span></div>
        <div class="enterprise-two-column">
          <section><h3>Son müraciətlər</h3>${cases.slice(0, 6).map((item) => `<a class="enterprise-link-row" href="${item.orderId ? `order-detail.html?order=${encodeURIComponent(item.orderId)}` : "#"}"><strong>#${esc(item.caseNumber)} · ${esc(status(item.type))}</strong><span>${esc(status(item.status))}</span></a>`).join("") || '<p class="admin-import-status">Müraciət yoxdur.</p>'}</section>
          <section><h3>Rəylərim</h3>${reviews.slice(0, 6).map((review) => `<a class="enterprise-link-row" href="${esc(`${review.targetType}-detail.html?${review.targetType}=${encodeURIComponent(review.targetId)}`)}"><strong>${esc(review.targetName || review.title)}</strong><span>${stars(review.rating)} · ${esc(status(review.status))}</span></a>`).join("") || '<p class="admin-import-status">Rəy yoxdur.</p>'}</section>
        </div>`;
    } catch (error) {
      root.innerHTML = `<h2>Etibar mərkəzi</h2><p class="admin-import-status">${esc(error.message)}</p>${signIn("customer-cabinet.html")}`;
    }
  };

  const scorecardHtml = (card) => {
    const metrics = [
      ["Məlumat keyfiyyəti", card.metrics.dataQuality],
      ["Sifariş qəbulu", card.metrics.acceptance],
      ["Vaxtında çatdırılma", card.metrics.onTime],
      ["Cavab sürəti", card.metrics.response],
      ["Müştəri rəyi", card.metrics.reviewScore]
    ];
    return `<article class="enterprise-scorecard">
      <header><div><p class="eyebrow">${esc(card.region || "Azərbaycan")}</p><h3>${esc(card.supplier)}</h3></div><strong>${esc(card.score)} · ${esc(card.grade)}</strong></header>
      ${metrics.map(([title, value]) => `<label><span>${esc(title)}</span><meter min="0" max="100" value="${Number(value)}">${Number(value)}%</meter><strong>${Number(value)}%</strong></label>`).join("")}
      <p>${(card.recommendations || []).map(esc).join(" ") || "Əsas göstəricilər hədəfə uyğundur."}</p>
    </article>`;
  };

  const initSupplierPerformance = async () => {
    const root = document.querySelector("[data-supplier-performance]");
    if (!root) return;
    const user = (await session()).user;
    if (!user) {
      root.innerHTML = `<h2>Təchizatçı performansı</h2><p class="admin-import-status">Şirkət göstəricilərini görmək üçün hesabına daxil ol.</p>${signIn("supplier-portal.html")}`;
      return;
    }
    try {
      const cards = (await api.supplierPerformance()).data.scorecards || [];
      root.innerHTML = `<div class="market-section-heading"><div><p class="eyebrow">Canlı əməliyyat göstəriciləri</p><h2>Təchizatçı performansı</h2></div><span class="data-badge">${cards.length ? `${cards[0].score} bal` : "Məlumat gözlənilir"}</span></div>${cards.map(scorecardHtml).join("") || '<p class="admin-import-status">Şirkət hesabına təchizatçı profili bağlandıqdan sonra göstəricilər açılacaq.</p>'}`;
    } catch (error) {
      root.innerHTML = `<h2>Təchizatçı performansı</h2><p class="admin-import-status">${esc(error.message)}</p>`;
    }
  };

  Promise.allSettled([
    initReviews(),
    initOrderSupport(),
    initAccountTrust(),
    initSupplierPerformance()
  ]);
})();
